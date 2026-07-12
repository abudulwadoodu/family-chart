// Middle panel: the persistent relationship-builder wizard. Unlike
// relationshipDialog.js (a showModal Promise-based popup bound to exactly one
// source/target pair), this panel is always mounted, drives its state from
// state.relationshipManager.builder, and supports N selected sources at once
// (bulk mode collapses to the N=1 case with no separate code path). Reuses
// relationshipDialog.js's exported constants/labels rather than redefining
// them, and relationshipValidator.js/relationshipMutations.js for all actual
// validation/mutation - this module only owns wizard-step orchestration.
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { validateRelationship } from '../relationshipValidator.js';
import { applyRelationship } from '../relationshipMutations.js';
import { searchMembers, buildMemberSearchIndex } from '../memberSearch.js';
import { TYPE_OPTIONS, PARENT_SUBTYPES, SIBLING_SUBTYPES, toLabel, describeRelationship, getTypeHelp } from '../relationshipDialog.js';
import { suggestMatches } from './suggestions.js';
import { recordRecentMember, recordRecentType, getRecentMembers, getRecentTypes } from './recentContext.js';
import { pushCommand } from './undoStack.js';
import { showToast } from '../ui.js';

function resetBuilder(builder) {
  builder.step = 'select-target';
  builder.targetId = null;
  builder.type = null;
  builder.subtype = null;
  builder.marriageDate = '';
  builder.divorceDate = '';
  builder.status = 'current';
  builder.targetSearchQuery = '';
  builder.targetSearchResults = [];
  builder.perItemResults = [];
}

// Pure: computes per-source validity for the chosen target/type. Bulk mode
// is just this list having length > 1 - preview rendering and commit both
// operate uniformly over it regardless of selection size.
export function computeBulkPreview(data, sourceIds, targetId, type) {
  const byId = new Map(data.map((d) => [d.id, d]));
  return sourceIds.map((sourceId) => {
    const check = validateRelationship(data, sourceId, targetId, type);
    return {
      sourceId,
      label: toLabel(byId.get(sourceId)),
      valid: check.valid,
      reason: check.reason,
    };
  });
}

// Family-tree ancestry only ever links a blood/adoptive child to a parent -
// a child's spouse is never a direct parent/child edge (see the module
// comment in relationshipMutations.js). If two selected sources are married
// to each other and the user is about to bulk-apply Parent/Child to both,
// one of them is almost certainly joining by marriage, not birth - flag it
// so the couple doesn't both get recorded as the parent's blood children.
export function findInLawWarnings(data, sourceIds, type) {
  if (type !== 'parent' && type !== 'child') return [];
  const byId = new Map(data.map((d) => [d.id, d]));
  const sourceSet = new Set(sourceIds);
  const warnings = [];
  const seen = new Set();

  sourceIds.forEach((id) => {
    if (seen.has(id)) return;
    const datum = byId.get(id);
    const marriedSelectedSpouseId = (datum?.rels?.spouses || []).find((spouseId) => sourceSet.has(spouseId));
    if (!marriedSelectedSpouseId) return;
    seen.add(id);
    seen.add(marriedSelectedSpouseId);
    warnings.push({ aId: id, bId: marriedSelectedSpouseId });
  });

  return warnings;
}

function renderBuilderHeader(rm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const sourceLabels = rm.selectedSourceIds.map((id) => escapeHtml(toLabel(byId.get(id)))).join(', ');
  const targetLabel = escapeHtml(toLabel(byId.get(rm.builder.targetId)));
  return `<p class="rm-builder-selection"><strong>${sourceLabels}</strong> &rarr; <strong>${targetLabel}</strong></p>`;
}

function typeAvailability(data, sourceIds, targetId) {
  // A type is selectable if valid for at least one selected source - full
  // per-source pass/fail is decided later in the preview step.
  const availability = {};
  TYPE_OPTIONS.forEach(({ type }) => {
    availability[type] = sourceIds.some((sourceId) => validateRelationship(data, sourceId, targetId, type).valid);
  });
  return availability;
}

// Rendered into #rm-target-results-wrap, a container separate from the
// search <input> itself. The input listener below updates only this
// container's innerHTML on every keystroke - re-rendering the whole step
// (including the input) would recreate the input element and drop focus/
// cursor position after every character typed.
function renderTargetResultsBlock(rm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const sources = rm.selectedSourceIds;

  const results = rm.builder.targetSearchResults;
  const resultsHtml = results.length
    ? `<div class="rm-target-results">${results
        .map((entry) => `<button type="button" class="rm-target-result" data-id="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</button>`)
        .join('')}</div>`
    : '';

  const suggestions = sources.length === 1 ? suggestMatches(byId.get(sources[0]), data) : [];
  const suggestionsHtml = suggestions.length
    ? `
      <div class="rm-suggestions">
        <span class="rm-suggestions-label">Suggested matches</span>
        <div class="rm-suggestion-list">
          ${suggestions
            .map(
              (s) => `
            <button type="button" class="rm-suggestion-chip" data-id="${escapeHtml(s.id)}" title="${escapeHtml(s.reasons.join(', '))}">
              ${escapeHtml(s.label)}
            </button>
          `,
            )
            .join('')}
        </div>
      </div>
    `
    : '';

  const recentMembers = getRecentMembers(rm.recent, data);
  const recentHtml = recentMembers.length
    ? `
      <div class="rm-recent">
        <span class="rm-suggestions-label">Recently selected</span>
        <div class="rm-suggestion-list">
          ${recentMembers
            .map((m) => `<button type="button" class="rm-recent-chip" data-id="${escapeHtml(m.id)}">${escapeHtml(toLabel(m))}</button>`)
            .join('')}
        </div>
      </div>
    `
    : '';

  return `${resultsHtml}${suggestionsHtml}${recentHtml}`;
}

function renderSelectTargetStep(rm, data) {
  const sources = rm.selectedSourceIds;
  if (sources.length === 0) {
    return `<p class="rm-builder-empty">Select one or more people from the left panel to start connecting them.</p>`;
  }

  const byId = new Map(data.map((d) => [d.id, d]));
  const sourceLabels = sources.map((id) => escapeHtml(toLabel(byId.get(id)))).join(', ');

  return `
    <p class="rm-builder-selection"><strong>${sourceLabels}</strong> ${sources.length > 1 ? `(${sources.length} people)` : ''}</p>
    <label class="search-box rm-search-box">
      ${icon('search')}
      <input type="text" id="rm-target-search-input" placeholder="Search existing member..." autocomplete="off" value="${escapeHtml(rm.builder.targetSearchQuery)}" />
    </label>
    <div id="rm-target-results-wrap">${renderTargetResultsBlock(rm, data)}</div>
  `;
}

function renderChooseTypeStep(rm, data) {
  const availability = typeAvailability(data, rm.selectedSourceIds, rm.builder.targetId);
  const byId = new Map(data.map((d) => [d.id, d]));
  const sourceLabel = rm.selectedSourceIds.map((id) => toLabel(byId.get(id))).join(', ');
  const targetLabel = toLabel(byId.get(rm.builder.targetId));
  const optionsHtml = TYPE_OPTIONS.map(({ type, label }, index) => {
    const enabled = availability[type];
    const help = getTypeHelp(type, sourceLabel, targetLabel);
    return `
      <label class="relationship-type-option ${enabled ? '' : 'is-disabled'}">
        <input type="radio" name="rm-rel-type" value="${type}" ${enabled ? '' : 'disabled'} />
        <span class="relationship-type-label">${index + 1}. ${label}</span>
        <span class="relationship-type-help">${escapeHtml(help)}</span>
      </label>
    `;
  }).join('');

  const recentTypes = getRecentTypes(rm.recent);
  const recentHtml = recentTypes.length
    ? `
      <div class="rm-recent">
        <span class="rm-suggestions-label">Recently used</span>
        <div class="rm-suggestion-list">
          ${recentTypes
            .map((t) => `<button type="button" class="rm-recent-chip" data-type="${escapeHtml(t)}" ${availability[t] ? '' : 'disabled'}>${escapeHtml(TYPE_OPTIONS.find((o) => o.type === t)?.label || t)}</button>`)
            .join('')}
        </div>
      </div>
    `
    : '';

  return `
    ${renderBuilderHeader(rm, data)}
    <form id="rm-type-form" class="stack">
      <div class="relationship-type-list" role="radiogroup" aria-label="Relationship type">${optionsHtml}</div>
      ${recentHtml}
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="rm-builder-back-btn">Back</button>
        <button type="submit" class="btn btn-primary" id="rm-type-next-btn" disabled>Next</button>
      </div>
    </form>
  `;
}

function renderOptionsStep(rm, data) {
  const { type } = rm.builder;
  let fieldsHtml = '';
  if (type === 'parent' || type === 'child') {
    fieldsHtml = `
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Parent type">
        ${PARENT_SUBTYPES.map(
          ({ value, label }) => `
          <label class="relationship-subtype-option">
            <input type="radio" name="rm-rel-subtype" value="${value}" ${value === 'biological' ? 'checked' : ''} />
            <span>${label}</span>
          </label>
        `,
        ).join('')}
      </div>
    `;
  } else if (type === 'spouse') {
    fieldsHtml = `
      <label>Marriage date<input type="date" name="marriageDate" /></label>
      <label>Divorce date<input type="date" name="divorceDate" /></label>
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Spouse status">
        <label class="relationship-subtype-option"><input type="radio" name="status" value="current" checked /><span>Current</span></label>
        <label class="relationship-subtype-option"><input type="radio" name="status" value="former" /><span>Former</span></label>
      </div>
    `;
  } else if (type === 'sibling') {
    fieldsHtml = `
      <div class="relationship-subtype-list" role="radiogroup" aria-label="Sibling type">
        ${SIBLING_SUBTYPES.map(
          ({ value, label }) => `
          <label class="relationship-subtype-option">
            <input type="radio" name="rm-rel-subtype" value="${value}" ${value === 'full' ? 'checked' : ''} />
            <span>${label}</span>
          </label>
        `,
        ).join('')}
      </div>
    `;
  }

  return `
    ${renderBuilderHeader(rm, data)}
    <form id="rm-options-form" class="stack">
      ${fieldsHtml}
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="rm-builder-back-btn">Back</button>
        <button type="submit" class="btn btn-primary">Preview</button>
      </div>
    </form>
  `;
}

function renderPreviewStep(rm, data) {
  const { targetId, type } = rm.builder;
  const byId = new Map(data.map((d) => [d.id, d]));
  const targetLabel = escapeHtml(toLabel(byId.get(targetId)));
  const relationshipLabel = escapeHtml(describeRelationship(rm.builder));
  const results = rm.builder.perItemResults;
  const validCount = results.filter((r) => r.valid).length;

  const inLawWarnings = findInLawWarnings(data, rm.selectedSourceIds, type);
  const warningHtml = inLawWarnings.length
    ? `
      <div class="rm-inlaw-warning">
        ${inLawWarnings
          .map(
            ({ aId, bId }) => `
          <p>
            <strong>${escapeHtml(toLabel(byId.get(aId)))}</strong> and <strong>${escapeHtml(toLabel(byId.get(bId)))}</strong> are married to each other.
            Only their actual blood/adoptive child should be recorded as ${escapeHtml(targetLabel)}'s ${type === 'child' ? 'child' : 'parent'} -
            the spouse who joined by marriage will already show up in the tree correctly without a direct link. Consider unchecking one of them and creating that link separately.
          </p>
        `,
          )
          .join('')}
      </div>
    `
    : '';

  const rowsHtml = results
    .map(
      (r) => `
      <div class="rm-bulk-preview-row ${r.valid ? '' : 'is-invalid'}">
        <span class="rm-bulk-preview-icon">${icon(r.valid ? 'check' : 'close')}</span>
        <span class="rm-bulk-preview-person">${escapeHtml(r.label)}</span>
        ${r.valid ? `<span class="relationship-preview-arrow">${relationshipLabel}</span><span class="rm-bulk-preview-person">${targetLabel}</span>` : `<span class="field-error">${escapeHtml(r.reason || 'Not allowed.')}</span>`}
      </div>
    `,
    )
    .join('');

  return `
    ${warningHtml}
    <div class="rm-bulk-preview">${rowsHtml}</div>
    <div class="modal-actions row">
      <button type="button" class="btn btn-ghost" id="rm-builder-back-btn">Back</button>
      <button type="button" class="btn btn-primary" id="rm-builder-create-btn" ${validCount === 0 ? 'disabled' : ''}>
        ${validCount === 0 ? 'No valid relationships to create' : `Create ${validCount} relationship${validCount === 1 ? '' : 's'}`}
      </button>
    </div>
  `;
}

export function renderBuilderPanel(rm, data) {
  const { step } = rm.builder;
  let bodyHtml;
  if (step === 'select-target') bodyHtml = renderSelectTargetStep(rm, data);
  else if (step === 'choose-type') bodyHtml = renderChooseTypeStep(rm, data);
  else if (step === 'options') bodyHtml = renderOptionsStep(rm, data);
  else bodyHtml = renderPreviewStep(rm, data);

  const stepLabels = { 'select-target': 'Select Target', 'choose-type': 'Relationship Type', options: 'Additional Options', preview: 'Preview' };
  return `
    <div class="rm-panel-header">
      <h3>Relationship Builder</h3>
      <span class="rm-builder-step-label">${stepLabels[step]}</span>
    </div>
    <div class="rm-builder-body" id="rm-builder-body">${bodyHtml}</div>
  `;
}

function selectTarget(state, render, targetId) {
  const rm = state.relationshipManager;
  rm.builder.targetId = targetId;
  rm.builder.targetSearchResults = [];
  rm.builder.targetSearchQuery = '';
  rm.builder.step = 'choose-type';
  render();
}

function commit(state, render, onDirtyChange) {
  const rm = state.relationshipManager;
  const data = state.selectedTreeData;
  const { targetId, type, subtype, marriageDate, divorceDate, status, perItemResults } = rm.builder;

  const validResults = perItemResults.filter((r) => r.valid);
  validResults.forEach(({ sourceId }) => {
    const draft = { sourceId, targetId, type, subtype, marriageDate: marriageDate || undefined, divorceDate: divorceDate || undefined, status: type === 'spouse' ? status : undefined };
    applyRelationship(data, draft);
    pushCommand(rm.undoStack, draft);
    recordRecentMember(rm.recent, sourceId);
  });
  recordRecentMember(rm.recent, targetId);
  recordRecentType(rm.recent, type);
  rm.dirty = true;

  const skipped = perItemResults.length - validResults.length;
  showToast(
    skipped > 0
      ? `Applied ${validResults.length} of ${perItemResults.length} — ${skipped} skipped (already related).`
      : `Created ${validResults.length} relationship${validResults.length === 1 ? '' : 's'} — remember to save.`,
  );

  if (!rm.keepSelection) rm.selectedSourceIds = [];
  resetBuilder(rm.builder);
  onDirtyChange?.();
  render();
}

export function attachBuilderPanelListeners(state, render, onDirtyChange) {
  const rm = state.relationshipManager;
  const data = state.selectedTreeData;
  const { step } = rm.builder;

  document.querySelector('#rm-builder-back-btn')?.addEventListener('click', () => {
    if (step === 'choose-type') rm.builder.step = 'select-target';
    else if (step === 'options') rm.builder.step = 'choose-type';
    else if (step === 'preview') rm.builder.step = 'options';
    render();
  });

  if (step === 'select-target') {
    const input = document.querySelector('#rm-target-search-input');
    const resultsWrap = document.querySelector('#rm-target-results-wrap');

    const attachResultListeners = () => {
      resultsWrap?.querySelectorAll('.rm-target-result, .rm-suggestion-chip, .rm-recent-chip[data-id]').forEach((btn) => {
        btn.addEventListener('click', () => selectTarget(state, render, btn.dataset.id));
      });
    };

    input?.addEventListener('input', () => {
      rm.builder.targetSearchQuery = input.value;
      const index = buildMemberSearchIndex(data);
      rm.builder.targetSearchResults = searchMembers(index, input.value, 8).filter((entry) => !rm.selectedSourceIds.includes(entry.id));
      // Update only the results container, not the whole step - replacing
      // the <input> itself (via a full render()) would drop focus/cursor
      // position after every keystroke.
      if (resultsWrap) {
        resultsWrap.innerHTML = renderTargetResultsBlock(rm, data);
        attachResultListeners();
      }
    });

    attachResultListeners();
  }

  if (step === 'choose-type') {
    const form = document.querySelector('#rm-type-form');
    const nextBtn = document.querySelector('#rm-type-next-btn');
    form?.addEventListener('change', () => {
      nextBtn.disabled = !form.querySelector('input[name="rm-rel-type"]:checked');
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const checked = form.querySelector('input[name="rm-rel-type"]:checked');
      if (!checked) return;
      rm.builder.type = checked.value;
      rm.builder.step = 'options';
      render();
    });
    document.querySelectorAll('.rm-recent-chip[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        rm.builder.type = btn.dataset.type;
        rm.builder.step = 'options';
        render();
      });
    });
  }

  if (step === 'options') {
    const form = document.querySelector('#rm-options-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      rm.builder.subtype = formData.get('rm-rel-subtype') || null;
      rm.builder.marriageDate = formData.get('marriageDate') || '';
      rm.builder.divorceDate = formData.get('divorceDate') || '';
      rm.builder.status = formData.get('status') || 'current';
      rm.builder.perItemResults = computeBulkPreview(data, rm.selectedSourceIds, rm.builder.targetId, rm.builder.type);
      rm.builder.step = 'preview';
      render();
    });
  }

  if (step === 'preview') {
    document.querySelector('#rm-builder-create-btn')?.addEventListener('click', () => commit(state, render, onDirtyChange));
  }
}
