// Relationship type + detail picker shown when the user drags one member
// onto another in the All Nodes view. Follows the same wizard pattern as
// gedcomWizard.js: a single showModal instance, a small local `wiz` state
// object, and setBody() re-renders on every step change.
import { showModal } from './ui.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

export const TYPE_OPTIONS = [
  { type: 'parent', label: 'Parent' },
  { type: 'child', label: 'Child' },
  { type: 'spouse', label: 'Spouse' },
  { type: 'sibling', label: 'Sibling' },
];

// Help text needs the actual source/target names ("Add Alice as Bob's
// parent") rather than "this person"/"the other person", which reviewers
// found ambiguous about which dragged node was which. sourceLabel may be a
// comma-joined list in bulk mode (relationshipManager/builderPanel.js).
export function getTypeHelp(type, sourceLabel, targetLabel) {
  switch (type) {
    case 'parent':
      return `Make ${targetLabel} the parent of ${sourceLabel}.`;
    case 'child':
      return `Make ${targetLabel} the child of ${sourceLabel}.`;
    case 'spouse':
      return `Record ${sourceLabel} and ${targetLabel} as a marriage/partnership.`;
    case 'sibling':
      return `Record ${sourceLabel} and ${targetLabel} as siblings.`;
    default:
      return '';
  }
}

export const PARENT_SUBTYPES = [
  { value: 'biological', label: 'Biological' },
  { value: 'adoptive', label: 'Adoptive Parent' },
  { value: 'step', label: 'Step Parent' },
  { value: 'foster', label: 'Foster Parent' },
  { value: 'guardian', label: 'Guardian' },
];

export const SIBLING_SUBTYPES = [
  { value: 'full', label: 'Full Sibling' },
  { value: 'half', label: 'Half Sibling' },
  { value: 'step', label: 'Step Sibling' },
  { value: 'twin', label: 'Twin' },
];

export function toLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum?.id ?? '');
}

// draft.type describes the target's role relative to source (applyRelationship:
// 'parent' means target becomes source's parent, 'child' means target becomes
// source's child - see relationshipMutations.js). The preview reads top-to-
// bottom as "source [this text] target", so the phrasing here must describe
// SOURCE's role (the inverse of draft.type) to read correctly - e.g. draft.type
// 'parent' renders "Child of" because source is the child in that case.
export function describeRelationship(draft) {
  const { type, subtype, marriageDate, status } = draft;
  if (type === 'parent') {
    const label = PARENT_SUBTYPES.find((s) => s.value === subtype)?.label || 'Parent';
    return `Child of (${label.toLowerCase()})`;
  }
  if (type === 'child') {
    const label = PARENT_SUBTYPES.find((s) => s.value === subtype)?.label || 'Parent';
    return `Parent of (${label.toLowerCase()})`;
  }
  if (type === 'spouse') {
    const statusLabel = status === 'former' ? 'Former Spouse of' : 'Spouse of';
    return marriageDate ? `${statusLabel} (married ${marriageDate})` : statusLabel;
  }
  if (type === 'sibling') {
    const label = SIBLING_SUBTYPES.find((s) => s.value === subtype)?.label || 'Sibling';
    return `${label} of`;
  }
  return 'Related to';
}

/**
 * @param {import('../src/types/data').Datum} sourceDatum
 * @param {import('../src/types/data').Datum} targetDatum
 * @param {(type: string) => { valid: boolean, reason?: string }} validateForType
 * @returns {Promise<null | { sourceId: string, targetId: string, type: string, subtype?: string, marriageDate?: string, divorceDate?: string, status?: string }>}
 */
export function openRelationshipDialog(sourceDatum, targetDatum, validateForType) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const wiz = {
      step: 1, // 1: type picker, 2: details, 3: preview
      type: null,
      subtype: null,
      marriageDate: '',
      divorceDate: '',
      status: 'current',
    };

    const modal = showModal({
      bodyHtml: '<p>Loading...</p>',
      className: 'modal-relationship-dialog',
      onClose: () => settle(null),
    });

    const renderStep = () => {
      modal.setBody(bodyForStep(wiz, { sourceDatum, targetDatum, validateForType }));
      bindListeners(modal, wiz, { sourceDatum, targetDatum, validateForType, renderStep, settle });
    };
    renderStep();
  });
}

function bodyForStep(wiz, ctx) {
  switch (wiz.step) {
    case 1:
      return renderTypeStep(wiz, ctx);
    case 2:
      return renderDetailsStep(wiz, ctx);
    case 3:
      return renderPreviewStep(wiz, ctx);
    default:
      return '';
  }
}

function renderTypeStep(wiz, { sourceDatum, targetDatum, validateForType }) {
  const sourceLabel = escapeHtml(toLabel(sourceDatum));
  const targetLabel = escapeHtml(toLabel(targetDatum));
  const rawSourceLabel = toLabel(sourceDatum);
  const rawTargetLabel = toLabel(targetDatum);

  const optionsHtml = TYPE_OPTIONS.map(({ type, label }) => {
    const check = validateForType(type);
    const disabled = check.valid ? '' : 'disabled';
    const help = getTypeHelp(type, rawSourceLabel, rawTargetLabel);
    const reasonHtml = check.valid ? '' : `<span class="field-error">${escapeHtml(check.reason || 'Not allowed.')}</span>`;
    return `
      <label class="relationship-type-option ${check.valid ? '' : 'is-disabled'}">
        <input type="radio" name="rel-type" value="${type}" ${disabled} />
        <span class="relationship-type-label">${label}</span>
        <span class="relationship-type-help">${escapeHtml(help)}</span>
        ${reasonHtml}
      </label>
    `;
  }).join('');

  return `
    <button type="button" class="icon-btn modal-close" id="rel-dialog-close-btn" aria-label="Close">${icon('close')}</button>
    <h3 id="modal-title">How are these people related?</h3>
    <p class="modal-message">${sourceLabel} &rarr; ${targetLabel}</p>
    <form id="rel-type-form" class="stack">
      <div class="relationship-type-list" role="radiogroup" aria-label="Relationship type">
        ${optionsHtml}
      </div>
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="rel-dialog-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary" id="rel-type-next-btn" disabled>Next</button>
      </div>
    </form>
  `;
}

function renderDetailsStep(wiz, { sourceDatum, targetDatum }) {
  const sourceLabel = escapeHtml(toLabel(sourceDatum));
  const targetLabel = escapeHtml(toLabel(targetDatum));

  let fieldsHtml = '';
  if (wiz.type === 'parent' || wiz.type === 'child') {
    fieldsHtml = `
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Parent type">
        ${PARENT_SUBTYPES.map(({ value, label }) => `
          <label class="relationship-subtype-option">
            <input type="radio" name="rel-subtype" value="${value}" ${value === 'biological' ? 'checked' : ''} />
            <span>${label}</span>
          </label>
        `).join('')}
      </div>
    `;
  } else if (wiz.type === 'spouse') {
    fieldsHtml = `
      <label>Marriage date
        <input type="date" name="marriageDate" />
      </label>
      <label>Divorce date
        <input type="date" name="divorceDate" />
      </label>
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Spouse status">
        <label class="relationship-subtype-option">
          <input type="radio" name="status" value="current" checked />
          <span>Current</span>
        </label>
        <label class="relationship-subtype-option">
          <input type="radio" name="status" value="former" />
          <span>Former</span>
        </label>
      </div>
    `;
  } else if (wiz.type === 'sibling') {
    fieldsHtml = `
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Sibling type">
        ${SIBLING_SUBTYPES.map(({ value, label }) => `
          <label class="relationship-subtype-option">
            <input type="radio" name="rel-subtype" value="${value}" ${value === 'full' ? 'checked' : ''} />
            <span>${label}</span>
          </label>
        `).join('')}
      </div>
      <p class="modal-message">Siblings aren't linked as a direct edge in this tree. If ${sourceLabel} and ${targetLabel} share a parent, consider also linking that parent for a complete tree.</p>
    `;
  }

  return `
    <button type="button" class="icon-btn modal-close" id="rel-dialog-close-btn" aria-label="Close">${icon('close')}</button>
    <h3 id="modal-title">${sourceLabel} &rarr; ${targetLabel}</h3>
    <form id="rel-details-form" class="stack">
      ${fieldsHtml}
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="rel-dialog-back-btn">Back</button>
        <button type="submit" class="btn btn-primary">Preview</button>
      </div>
    </form>
  `;
}

function renderPreviewStep(wiz, { sourceDatum, targetDatum }) {
  const sourceLabel = escapeHtml(toLabel(sourceDatum));
  const targetLabel = escapeHtml(toLabel(targetDatum));
  const relationshipLabel = escapeHtml(describeRelationship(wiz));

  return `
    <button type="button" class="icon-btn modal-close" id="rel-dialog-close-btn" aria-label="Close">${icon('close')}</button>
    <h3 id="modal-title">Confirm relationship</h3>
    <div class="relationship-preview">
      <p class="relationship-preview-person">${sourceLabel}</p>
      <p class="relationship-preview-arrow">${relationshipLabel}</p>
      <p class="relationship-preview-person">${targetLabel}</p>
    </div>
    <div class="modal-actions row">
      <button type="button" class="btn btn-ghost" id="rel-dialog-back-btn">Back</button>
      <button type="button" class="btn btn-primary" id="rel-dialog-confirm-btn">Confirm</button>
    </div>
  `;
}

function bindListeners(modal, wiz, { sourceDatum, targetDatum, validateForType, renderStep, settle }) {
  modal.root.querySelector('#rel-dialog-close-btn')?.addEventListener('click', () => {
    settle(null);
    modal.close();
  });
  modal.root.querySelector('#rel-dialog-cancel-btn')?.addEventListener('click', () => {
    settle(null);
    modal.close();
  });
  modal.root.querySelector('#rel-dialog-back-btn')?.addEventListener('click', () => {
    wiz.step = Math.max(1, wiz.step - 1);
    renderStep();
  });

  if (wiz.step === 1) {
    const form = modal.root.querySelector('#rel-type-form');
    const nextBtn = modal.root.querySelector('#rel-type-next-btn');
    form?.addEventListener('change', () => {
      nextBtn.disabled = !form.querySelector('input[name="rel-type"]:checked');
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const checked = form.querySelector('input[name="rel-type"]:checked');
      if (!checked) return;
      wiz.type = checked.value;
      wiz.step = 2;
      renderStep();
    });
  }

  if (wiz.step === 2) {
    const form = modal.root.querySelector('#rel-details-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      wiz.subtype = data.get('rel-subtype') || null;
      wiz.marriageDate = data.get('marriageDate') || '';
      wiz.divorceDate = data.get('divorceDate') || '';
      wiz.status = data.get('status') || 'current';
      wiz.step = 3;
      renderStep();
    });
  }

  if (wiz.step === 3) {
    modal.root.querySelector('#rel-dialog-confirm-btn')?.addEventListener('click', () => {
      const check = validateForType(wiz.type);
      if (!check.valid) {
        // Structural validity can change between steps only in pathological
        // cases (data mutated elsewhere while the dialog was open); bail
        // back to the type step rather than committing an invalid draft.
        wiz.step = 1;
        renderStep();
        return;
      }
      settle({
        sourceId: sourceDatum.id,
        targetId: targetDatum.id,
        type: wiz.type,
        subtype: wiz.subtype || undefined,
        marriageDate: wiz.marriageDate || undefined,
        divorceDate: wiz.divorceDate || undefined,
        status: wiz.type === 'spouse' ? wiz.status : undefined,
      });
      modal.close();
    });
  }
}
