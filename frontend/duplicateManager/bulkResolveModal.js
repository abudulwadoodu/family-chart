// Bulk-resolve flow: a table of duplicate candidates whose fields are an
// exact match (diffFields() returns nothing), so merging them carries no
// data-loss decision - only which side is kept and which relationships get
// unioned in, both already handled by applyMerge()'s defaults. Surfaced as a
// modal (see appUX.js's appModal.open) rather than a third panel since it's
// an occasional bulk action, not a persistent part of the layout.
import { showModal, showToast } from '../ui.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { toLabel } from '../relationshipDialog.js';
import { diffFields, applyMerge } from './duplicateMerge.js';
import { pushCommand } from './undoStack.js';

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

function birthYearLabel(datum) {
  const raw = datum?.data?.birthday;
  if (!raw) return '';
  const year = new Date(raw).getFullYear();
  return Number.isNaN(year) ? '' : String(year);
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
      <td>${escapeHtml(toLabel(a))}${birthYearLabel(a) ? ` <span class="dm-bulk-year">(b. ${escapeHtml(birthYearLabel(a))})</span>` : ''}</td>
      <td>${escapeHtml(toLabel(b))}${birthYearLabel(b) ? ` <span class="dm-bulk-year">(b. ${escapeHtml(birthYearLabel(b))})</span>` : ''}</td>
      <td><span class="dm-score-badge">${scorePct}% match</span></td>
      <td class="dm-bulk-reasons">${candidate.reasons.map((reason) => `<span class="dm-reason-chip">${escapeHtml(reason)}</span>`).join('')}</td>
    </tr>
  `;
}

function renderBody(candidates, byId) {
  const rows = candidates.map((candidate) => renderRow(candidate, byId)).join('');
  return `
    <button type="button" class="icon-btn modal-close" id="dm-bulk-close-btn" aria-label="Close">${icon('close')}</button>
    <h3>Resolve Exact-Match Duplicates</h3>
    <p class="modal-message">These ${candidates.length} pair${candidates.length === 1 ? '' : 's'} have no conflicting fields - merging keeps the first-listed record and unions in any relationships from the other.</p>
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

export function openBulkResolveModal({ candidates, data, dm, render }) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const modal = showModal({ bodyHtml: renderBody(candidates, byId), className: 'modal-dm-bulk-resolve' });
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
