// Right panel: field-by-field compare + merge for the currently selected
// candidate pair. "a" is always the keep/survivor side, "b" is the side that
// will be dropped once merged - the toolbar lets the user flip which member
// is which before merging.
import { escapeHtml } from '../utils.js';
import { toLabel } from '../relationshipDialog.js';
import { diffFields, applyMerge } from './duplicateMerge.js';
import { pushCommand, undo, redo } from './undoStack.js';
import { getFilteredSortedCandidates, selectNextCandidate } from './duplicateListPanel.js';

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

// Names (with disambiguating meta token) of the relatives relCount() is
// counting, in parents/children/spouses order - so "Will also inherit 2
// relationships" isn't just a bare number the user has to take on faith.
function relativeNames(datum, byId) {
  const rels = datum?.rels || {};
  const ids = [...(rels.parents || []), ...(rels.children || []), ...(rels.spouses || [])];
  return ids.map((id) => byId.get(id)).filter(Boolean).map((person) => nameWithMeta(person));
}

function birthYearLabel(datum) {
  const raw = datum?.data?.birthday;
  if (!raw) return '';
  const year = new Date(raw).getFullYear();
  return Number.isNaN(year) ? '' : String(year);
}

// Short disambiguating fragment for two records that may share a display
// name - prefers birth year, then location, then falls back to a truncated
// id suffix so there's always *something* distinguishing "Saleem" from
// "Saleem" in the compare heading.
function metaToken(datum) {
  const year = birthYearLabel(datum);
  if (year) return year;
  const location = datum?.data?.location;
  if (location) return String(location);
  const id = String(datum?.id ?? '');
  return id ? `id ${id.slice(-4)}` : '';
}

function nameWithMeta(datum) {
  const label = escapeHtml(toLabel(datum));
  const token = escapeHtml(metaToken(datum));
  return token ? `${label} <span class="dm-meta-token">(${token})</span>` : label;
}

function renderFieldRow(field, valueA, valueB, choice, byId) {
  const display = (v) => {
    if (v === '' || v === undefined || v === null) return '<em>(empty)</em>';
    if (PERSON_REF_FIELDS.has(field)) {
      const referenced = byId.get(v);
      return referenced ? nameWithMeta(referenced) : escapeHtml(String(v));
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
  const MAX_NAMES_SHOWN = 3;
  const inheritedNames = relativeNames(b, byId);
  const shownNames = inheritedNames.slice(0, MAX_NAMES_SHOWN);
  const extraCount = inheritedNames.length - shownNames.length;
  const namesHtml = shownNames.length
    ? ` (${shownNames.join(', ')}${extraCount > 0 ? `, +${extraCount} more` : ''})`
    : '';

  return `
    <div class="dm-panel-header">
      <h3>Compare &amp; Merge</h3>
    </div>
    <div class="dm-compare-body">
      <div class="dm-compare-heading">
        <span class="dm-compare-col dm-compare-col-keep">
          <span class="dm-target-badge dm-target-badge-keep">Keep</span>
          <span class="dm-compare-name">${nameWithMeta(a)}</span>
        </span>
        <button type="button" id="dm-swap-btn" class="chip" title="Swap which record is kept">Swap</button>
        <span class="dm-compare-col dm-compare-col-remove">
          <span class="dm-target-badge dm-target-badge-remove">Remove</span>
          <span class="dm-compare-name">${nameWithMeta(b)}</span>
        </span>
      </div>
      <div class="dm-field-list">${fieldsHtml}</div>
      <div class="dm-rel-preview">
        ${inheritedCount > 0
          ? `Will also inherit ${inheritedCount} relationship${inheritedCount === 1 ? '' : 's'} from ${nameWithMeta(b)}${namesHtml}.`
          : `${nameWithMeta(b)} has no relationships to inherit.`}
      </div>
      <button type="button" id="dm-merge-btn" class="btn btn-primary">Merge into ${escapeHtml(toLabel(a))}</button>
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
    const resolvedKey = dm.selectedPairKey;
    const previousCandidates = getFilteredSortedCandidates(dm, data);
    const [sortedA, sortedB] = resolvedKey.split('::');
    const keepId = dm.keepFirst ? sortedA : sortedB;
    const dropId = dm.keepFirst ? sortedB : sortedA;
    const command = applyMerge(data, { keepId, dropId, fieldChoices: { ...dm.fieldChoices } });
    if (!command) return;
    pushCommand(dm.undoStack, command);
    dm.dirty = true;
    dm.keepFirst = true;
    dm.fieldChoices = {};
    selectNextCandidate(dm, data, previousCandidates, resolvedKey);
    render();
  });
}
