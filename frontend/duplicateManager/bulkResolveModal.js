// Bulk-resolve flows: tables of duplicate candidates that carry no real
// data-loss decision, so merging them can skip the one-at-a-time Compare &
// Merge review. Two variants share this same table/modal UI:
//   - exact-match: diffFields() returns nothing, so every field already
//     agrees - only which side is kept and which relationships get unioned
//     in, both already handled by applyMerge()'s defaults.
//   - sparse-duplicate: same name, and the side that would be dropped has
//     no relationships and no other data filled in - dropping it loses
//     nothing, even though its (empty) fields technically "differ" from a
//     blank string.
// Surfaced as a modal (see appUX.js's appModal.open) rather than a third
// panel since it's an occasional bulk action, not a persistent part of the
// layout.
import { showModal, showToast } from '../ui.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { toLabel } from '../relationshipDialog.js';
import { diffFields, applyMerge } from './duplicateMerge.js';
import { pushCommand } from './undoStack.js';

// fatherId/motherId are relationship links stored as plain data fields (see
// comparePanel.js's PERSON_REF_FIELDS) rather than in rels.* - a person with
// either set has a relationship to inherit, same as one with parents/
// children/spouses.
function relCount(datum) {
  const rels = datum?.rels || {};
  const relFields = [datum?.data?.fatherId, datum?.data?.motherId].filter(Boolean).length;
  return (rels.parents || []).length + (rels.children || []).length + (rels.spouses || []).length + relFields;
}

function normalizedName(datum) {
  return toLabel(datum).toLowerCase().trim().replace(/\s+/g, ' ');
}

// Fields that don't represent data a merge would lose: identity (name),
// relationship links (already covered by relCount), and merge bookkeeping.
const IGNORED_DATA_FIELDS = new Set(['first name', 'last name', 'fatherId', 'motherId', 'relMeta']);

// True if every field other than name/relationship-links/relMeta is blank -
// i.e. this record carries no data that would be lost by dropping it into a
// same-named twin. Gender is asked as a required field on the add-person
// form, so nearly every record has one set - excluded here the same as name,
// otherwise almost no real placeholder duplicate would ever qualify.
function hasNoOtherData(datum) {
  const data = datum?.data || {};
  return Object.entries(data).every(([key, value]) => {
    if (IGNORED_DATA_FIELDS.has(key) || key === 'gender') return true;
    return value === '' || value === undefined || value === null;
  });
}

// Exact-match candidates only - anything with a conflicting field belongs in
// the one-at-a-time Compare & Merge flow so the user actually sees the
// conflict instead of it being silently auto-resolved.
export function getExactMatchCandidates(candidates, byId) {
  return candidates.filter((candidate) => {
    const a = byId.get(candidate.aId);
    const b = byId.get(candidate.bId);
    if (!a || !b) return false;
    return diffFields(a, b).length === 0;
  });
}

// Same-name pairs where the side that would be dropped is "sparse": no
// relationships to inherit and no other fields filled in. If only one side
// is sparse, that side is reoriented to bId (dropped) regardless of how the
// original candidate ordered them, since applyMerge here always keeps aId.
// If *both* sides are sparse the pair is still eligible - they're identical
// blank duplicates, so which one survives doesn't matter - and the original
// aId/bId order is left as-is.
export function getSparseDuplicateCandidates(candidates, byId) {
  const result = [];
  for (const candidate of candidates) {
    const a = byId.get(candidate.aId);
    const b = byId.get(candidate.bId);
    if (!a || !b) continue;
    if (normalizedName(a) !== normalizedName(b) || !normalizedName(a)) continue;
    // A gender mismatch means these are almost certainly two different
    // people who happen to share a name, not a duplicate to auto-merge -
    // gender is otherwise ignored by hasNoOtherData() since it's always set.
    const genderA = a?.data?.gender;
    const genderB = b?.data?.gender;
    if (genderA && genderB && genderA !== genderB) continue;

    const aSparse = relCount(a) === 0 && hasNoOtherData(a);
    const bSparse = relCount(b) === 0 && hasNoOtherData(b);
    if (!aSparse && !bSparse) continue; // neither side is a clear drop candidate

    result.push(!bSparse && aSparse ? { ...candidate, aId: candidate.bId, bId: candidate.aId } : candidate);
  }
  return result;
}

function birthYearLabel(datum) {
  const raw = datum?.data?.birthday;
  if (!raw) return '';
  const year = new Date(raw).getFullYear();
  return Number.isNaN(year) ? '' : String(year);
}

// Same-name rows are otherwise indistinguishable at a glance (see the
// Saleem/132/134 case that prompted this) - id plus whatever fields are
// actually filled in (parents, location, etc.) give the user something
// concrete to tell two "Ali Khan"s apart by. Different records can have
// different fields set (one has parents, another has a location instead),
// so every non-blank field is shown rather than a fixed subset.
function parentNamesLabel(datum, byId) {
  const father = datum?.data?.fatherId ? byId.get(datum.data.fatherId) : null;
  const mother = datum?.data?.motherId ? byId.get(datum.data.motherId) : null;
  const names = [father, mother].filter(Boolean).map((p) => toLabel(p));
  return names.join(' & ');
}

const DETAIL_FIELD_LABELS = {
  location: 'location',
  occupation: 'occupation',
  notes: 'notes',
  phone: 'phone',
  email: 'email',
  gender: 'gender',
};

function otherFieldDetails(datum) {
  const data = datum?.data || {};
  const skip = new Set(['first name', 'last name', 'fatherId', 'motherId', 'relMeta', 'birthday', 'avatar']);
  return Object.entries(data)
    .filter(([key, value]) => !skip.has(key) && value !== '' && value !== undefined && value !== null)
    .map(([key, value]) => `${DETAIL_FIELD_LABELS[key] || key}: ${value}`);
}

function personCellHtml(datum, byId) {
  const year = birthYearLabel(datum);
  const parents = parentNamesLabel(datum, byId);
  const idLabel = datum?.id !== undefined && datum?.id !== null ? String(datum.id) : '';
  const hasAvatar = Boolean(datum?.data?.avatar);
  const parts = [
    year ? `b. ${year}` : '',
    idLabel ? `id ${idLabel}` : '',
    parents ? `parents: ${parents}` : '',
    ...otherFieldDetails(datum),
    hasAvatar ? 'photo' : '',
  ].filter(Boolean);
  const details = parts.map((part) => escapeHtml(part)).join(' &middot; ');
  return `
    ${escapeHtml(toLabel(datum))}
    ${details ? `<br /><span class="dm-bulk-detail">${details}</span>` : ''}
  `;
}

function renderRow(candidate, byId) {
  const a = byId.get(candidate.aId);
  const b = byId.get(candidate.bId);
  const scorePct = Math.round(candidate.score * 100);
  return `
    <tr class="dm-bulk-row" data-key="${escapeHtml(candidate.key)}">
      <td class="dm-bulk-select-cell">
        <input type="checkbox" class="dm-bulk-row-checkbox" data-key="${escapeHtml(candidate.key)}" checked />
      </td>
      <td>${personCellHtml(a, byId)}</td>
      <td>${personCellHtml(b, byId)}</td>
      <td><span class="dm-score-badge">${scorePct}% match</span></td>
      <td class="dm-bulk-reasons">${candidate.reasons.map((reason) => `<span class="dm-reason-chip">${escapeHtml(reason)}</span>`).join('')}</td>
    </tr>
  `;
}

const MODE_COPY = {
  exact: {
    title: 'Resolve Exact-Match Duplicates',
    message: (count) =>
      `These ${count} pair${count === 1 ? '' : 's'} have no conflicting fields - merging keeps the first-listed record and unions in any relationships from the other.`,
  },
  sparse: {
    title: 'Resolve Empty Duplicates',
    message: (count) =>
      `These ${count} pair${count === 1 ? '' : 's'} share a name, and the "Merge in" record has no relationships and no other data filled in - merging keeps the fuller record and drops the empty one.`,
  },
};

function renderBody(candidates, byId, mode) {
  const copy = MODE_COPY[mode];
  const rows = candidates.map((candidate) => renderRow(candidate, byId)).join('');
  return `
    <button type="button" class="icon-btn modal-close" id="dm-bulk-close-btn" aria-label="Close">${icon('close')}</button>
    <h3>${escapeHtml(copy.title)}</h3>
    <p class="modal-message">${escapeHtml(copy.message(candidates.length))}</p>
    <div class="dm-bulk-table-wrap">
      <table class="dm-bulk-table">
        <thead>
          <tr>
            <th class="dm-bulk-select-cell"><input type="checkbox" id="dm-bulk-select-all" checked /></th>
            <th>Keep</th>
            <th>Merge in</th>
            <th>Match</th>
            <th>Reasons</th>
          </tr>
        </thead>
        <tbody id="dm-bulk-tbody">${rows}</tbody>
      </table>
    </div>
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="dm-bulk-cancel-btn">Cancel</button>
      <button type="button" class="btn btn-primary" id="dm-bulk-merge-btn">Merge selected (<span id="dm-bulk-selected-count">${candidates.length}</span>)</button>
    </div>
  `;
}

function updateMergeButton(root) {
  const count = root.querySelectorAll('.dm-bulk-row-checkbox:checked').length;
  const countEl = root.querySelector('#dm-bulk-selected-count');
  if (countEl) countEl.textContent = String(count);
  const mergeBtn = root.querySelector('#dm-bulk-merge-btn');
  if (mergeBtn) mergeBtn.disabled = count === 0;
}

export function openBulkResolveModal({ candidates, data, dm, render, mode = 'exact' }) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const modal = showModal({ bodyHtml: renderBody(candidates, byId, mode), className: 'modal-dm-bulk-resolve' });
  const root = modal.root;

  root.querySelector('#dm-bulk-close-btn').addEventListener('click', () => modal.close());
  root.querySelector('#dm-bulk-cancel-btn').addEventListener('click', () => modal.close());

  root.querySelector('#dm-bulk-select-all').addEventListener('change', (event) => {
    root.querySelectorAll('.dm-bulk-row-checkbox').forEach((cb) => {
      cb.checked = event.target.checked;
    });
    updateMergeButton(root);
  });

  root.querySelectorAll('.dm-bulk-row-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const all = root.querySelectorAll('.dm-bulk-row-checkbox');
      const checked = root.querySelectorAll('.dm-bulk-row-checkbox:checked');
      const selectAll = root.querySelector('#dm-bulk-select-all');
      selectAll.checked = all.length === checked.length;
      selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
      updateMergeButton(root);
    });
  });

  root.querySelector('#dm-bulk-merge-btn').addEventListener('click', () => {
    const selectedKeys = new Set(
      [...root.querySelectorAll('.dm-bulk-row-checkbox:checked')].map((cb) => cb.dataset.key),
    );
    const toMerge = candidates.filter((candidate) => selectedKeys.has(candidate.key));

    let mergedCount = 0;
    let skippedCount = 0;
    for (const candidate of toMerge) {
      const byIdNow = new Map(data.map((d) => [d.id, d]));
      // A prior merge in this same batch may have already dropped one side
      // (e.g. chained candidates A~B and B~C) - skip rather than error.
      if (!byIdNow.has(candidate.aId) || !byIdNow.has(candidate.bId)) {
        skippedCount += 1;
        continue;
      }
      const command = applyMerge(data, { keepId: candidate.aId, dropId: candidate.bId, fieldChoices: {} });
      if (!command) {
        skippedCount += 1;
        continue;
      }
      pushCommand(dm.undoStack, command);
      mergedCount += 1;
    }

    if (mergedCount > 0) dm.dirty = true;
    modal.close();

    if (mergedCount === 0) {
      showToast('No duplicates were merged.', { type: 'error' });
    } else {
      showToast(
        `Merged ${mergedCount} pair${mergedCount === 1 ? '' : 's'}.${skippedCount ? ` ${skippedCount} skipped (already resolved).` : ''}`,
      );
    }
    render();
  });
}
