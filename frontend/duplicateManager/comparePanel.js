// Right panel: field-by-field compare + merge for the currently selected
// candidate pair. "a" is always the keep/survivor side, "b" is the side that
// will be dropped once merged - the toolbar lets the user flip which member
// is which before merging.
import { escapeHtml } from '../utils.js';
import { toLabel } from '../relationshipDialog.js';
import { diffFields, applyMerge } from './duplicateMerge.js';
import { pushCommand, undo, redo } from './undoStack.js';

const FIELD_LABELS = {
  'first name': 'First name',
  'last name': 'Last name',
  gender: 'Gender',
  birthday: 'Birthday',
  location: 'Location',
  avatar: 'Photo',
  notes: 'Notes',
  fatherId: 'Father',
  motherId: 'Mother',
};

// fatherId/motherId store raw person ids (see utils.js's treeDataToCsv); the
// compare panel should show the referenced person's name, not the bare id.
const PERSON_REF_FIELDS = new Set(['fatherId', 'motherId']);

function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

function relCount(datum) {
  const rels = datum?.rels || {};
  return (rels.parents || []).length + (rels.children || []).length + (rels.spouses || []).length;
}

function renderFieldRow(field, valueA, valueB, choice, byId) {
  const display = (v) => {
    if (v === '' || v === undefined || v === null) return '<em>(empty)</em>';
    if (PERSON_REF_FIELDS.has(field)) {
      const referenced = byId.get(v);
      return escapeHtml(referenced ? toLabel(referenced) : String(v));
    }
    return escapeHtml(String(v));
  };
  return `
    <div class="dm-field-row">
      <span class="dm-field-name">${escapeHtml(fieldLabel(field))}</span>
      <label class="dm-field-option ${choice === 'a' ? 'is-chosen' : ''}">
        <input type="radio" name="dm-field-${escapeHtml(field)}" value="a" ${choice === 'a' ? 'checked' : ''} />
        ${display(valueA)}
      </label>
      <label class="dm-field-option ${choice === 'b' ? 'is-chosen' : ''}">
        <input type="radio" name="dm-field-${escapeHtml(field)}" value="b" ${choice === 'b' ? 'checked' : ''} />
        ${display(valueB)}
      </label>
    </div>
  `;
}

export function renderComparePanel(dm, data, candidate) {
  if (!candidate) {
    return `
      <div class="dm-panel-header"><h3>Compare</h3></div>
      <div class="dm-empty-state">Select a pair on the left to compare and merge.</div>
    `;
  }

  const byId = new Map(data.map((d) => [d.id, d]));
  const keepId = dm.keepFirst ? candidate.aId : candidate.bId;
  const dropId = dm.keepFirst ? candidate.bId : candidate.aId;
  const a = byId.get(keepId);
  const b = byId.get(dropId);
  if (!a || !b) {
    return `<div class="dm-panel-header"><h3>Compare</h3></div><div class="dm-empty-state">One of these members no longer exists.</div>`;
  }

  const diffs = diffFields(a, b);
  const fieldsHtml = diffs.length
    ? diffs
        .map(({ field, valueA, valueB }) =>
          renderFieldRow(field, valueA, valueB, dm.fieldChoices[field] || (valueA ? 'a' : 'b'), byId),
        )
        .join('')
    : `<div class="dm-empty-state">No conflicting fields - all values match.</div>`;

  const inheritedCount = relCount(b);

  return `
    <div class="dm-panel-header">
      <h3>
        Compare &amp; Merge
        <button type="button" id="dm-swap-btn" class="chip dm-swap-btn" title="Swap which record is kept">Swap</button>
      </h3>
    </div>
    <div class="dm-compare-body">
      <div class="dm-field-row dm-field-row-header">
        <span class="dm-field-name"></span>
        <span class="dm-field-col-label dm-field-col-keep">Keep: ${escapeHtml(toLabel(a))}</span>
        <span class="dm-field-col-label dm-field-col-remove">Remove: ${escapeHtml(toLabel(b))}</span>
      </div>
      <div class="dm-field-list">${fieldsHtml}</div>
      <div class="dm-rel-preview">
        ${inheritedCount > 0
          ? `Will also inherit ${inheritedCount} relationship${inheritedCount === 1 ? '' : 's'} from ${escapeHtml(toLabel(b))}.`
          : `${escapeHtml(toLabel(b))} has no relationships to inherit.`}
      </div>
      <div class="dm-field-row dm-field-row-actions">
        <span class="dm-field-name"></span>
        <span class="dm-field-col-keep">
          <button type="button" id="dm-merge-btn" class="btn btn-primary" title="Keep ${escapeHtml(toLabel(a))} and merge ${escapeHtml(toLabel(b))} into it">Accept</button>
        </span>
        <span></span>
      </div>
    </div>
  `;
}

export function attachComparePanelListeners(state, render) {
  const dm = state.duplicateManager;
  const data = state.selectedTreeData;

  document.querySelector('#dm-undo-btn')?.addEventListener('click', () => {
    if (undo(dm.undoStack, data)) {
      dm.dirty = true;
      render();
    }
  });

  document.querySelector('#dm-redo-btn')?.addEventListener('click', () => {
    if (redo(dm.undoStack, data)) {
      dm.dirty = true;
      render();
    }
  });

  if (!dm.selectedPairKey) return;

  document.querySelector('#dm-swap-btn')?.addEventListener('click', () => {
    dm.keepFirst = !dm.keepFirst;
    dm.fieldChoices = {};
    render();
  });

  document.querySelectorAll('.dm-field-row input[type="radio"]').forEach((input) => {
    input.addEventListener('change', () => {
      const field = input.name.replace('dm-field-', '');
      dm.fieldChoices[field] = input.value;
      render();
    });
  });

  document.querySelector('#dm-merge-btn')?.addEventListener('click', () => {
    const [sortedA, sortedB] = dm.selectedPairKey.split('::');
    const keepId = dm.keepFirst ? sortedA : sortedB;
    const dropId = dm.keepFirst ? sortedB : sortedA;
    const command = applyMerge(data, { keepId, dropId, fieldChoices: { ...dm.fieldChoices } });
    if (!command) return;
    pushCommand(dm.undoStack, command);
    dm.dirty = true;
    dm.selectedPairKey = null;
    dm.keepFirst = true;
    dm.fieldChoices = {};
    render();
  });
}
