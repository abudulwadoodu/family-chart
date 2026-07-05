// Left panel: list of candidate duplicate pairs found by duplicateDetection.js.
// Mirrors relationshipManager/disconnectedListPanel.js's row/avatar rendering
// conventions, but there's no search/paginate step here since candidates are
// a small pre-scored, pre-filtered set rather than the whole member list.
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { toLabel } from '../relationshipDialog.js';
import { findDuplicateCandidates, pairKey } from './duplicateDetection.js';

function birthYearLabel(datum) {
  const raw = datum?.data?.birthday;
  if (!raw) return '';
  const year = new Date(raw).getFullYear();
  return Number.isNaN(year) ? '' : String(year);
}

function avatarHtml(datum) {
  return datum?.data?.avatar
    ? `<img class="dm-member-avatar" src="${escapeHtml(datum.data.avatar)}" alt="" />`
    : `<span class="dm-member-avatar dm-member-avatar-placeholder">${icon('user')}</span>`;
}

// Recomputed whenever the panel renders (on entering the view, after a
// merge/undo, or after a dismiss) rather than cached in state - the scan is
// cheap enough (bucketed by surname, see duplicateDetection.js) to redo on
// every data change instead of tracking invalidation manually.
export function getVisibleCandidates(dm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  return findDuplicateCandidates(data)
    .map((candidate) => ({ ...candidate, key: pairKey(candidate.aId, candidate.bId) }))
    .filter((candidate) => !dm.dismissed.includes(candidate.key))
    .filter((candidate) => byId.has(candidate.aId) && byId.has(candidate.bId));
}

export function renderDuplicateListPanel(dm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const candidates = getVisibleCandidates(dm, data);

  const rowsHtml = candidates.length
    ? candidates
        .map((candidate) => {
          const a = byId.get(candidate.aId);
          const b = byId.get(candidate.bId);
          const active = dm.selectedPairKey === candidate.key;
          const scorePct = Math.round(candidate.score * 100);
          return `
            <li class="dm-pair-row ${active ? 'is-active' : ''}" data-key="${escapeHtml(candidate.key)}" role="option" aria-selected="${active}" tabindex="0">
              <div class="dm-pair-people">
                <span class="dm-pair-person">${avatarHtml(a)}<span class="dm-member-name">${escapeHtml(toLabel(a))}</span></span>
                <span class="dm-pair-vs">&harr;</span>
                <span class="dm-pair-person">${avatarHtml(b)}<span class="dm-member-name">${escapeHtml(toLabel(b))}</span></span>
              </div>
              <div class="dm-pair-meta">
                ${birthYearLabel(a) ? `<span>b. ${escapeHtml(birthYearLabel(a))}</span>` : ''}
                <span class="dm-score-badge">${scorePct}% match</span>
              </div>
              <div class="dm-pair-reasons">
                ${candidate.reasons.map((reason) => `<span class="dm-reason-chip">${escapeHtml(reason)}</span>`).join('')}
              </div>
              <button type="button" class="chip dm-dismiss-btn" data-key="${escapeHtml(candidate.key)}">Not a duplicate</button>
            </li>
          `;
        })
        .join('')
    : `<li class="dm-empty-state">No likely duplicates found.</li>`;

  return `
    <div class="dm-panel-header">
      <h3>Possible Duplicates <span class="rm-count-badge">${candidates.length}</span></h3>
    </div>
    <ul class="dm-pair-list" id="dm-pair-list" role="listbox">${rowsHtml}</ul>
  `;
}

export function attachDuplicateListListeners(state, render) {
  const dm = state.duplicateManager;
  const data = state.selectedTreeData;
  const list = document.querySelector('#dm-pair-list');
  if (!list) return;

  list.querySelectorAll('.dm-dismiss-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const key = btn.dataset.key;
      if (!dm.dismissed.includes(key)) dm.dismissed.push(key);
      if (dm.selectedPairKey === key) {
        dm.selectedPairKey = null;
        dm.keepFirst = true;
        dm.fieldChoices = {};
      }
      render();
    });
  });

  list.querySelectorAll('.dm-pair-row').forEach((row) => {
    const selectRow = () => {
      dm.selectedPairKey = row.dataset.key;
      dm.keepFirst = true;
      dm.fieldChoices = {};
      render();
    };
    row.addEventListener('click', selectRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRow();
      }
    });
  });
}
