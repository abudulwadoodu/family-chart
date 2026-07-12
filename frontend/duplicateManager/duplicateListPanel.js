// Left panel: list of candidate duplicate pairs found by duplicateDetection.js.
// Mirrors relationshipManager/disconnectedListPanel.js's row/avatar rendering
// conventions. Search/sort were added once trees started surfacing enough
// candidate pairs that scanning the raw list stopped being practical.
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { toLabel } from '../relationshipDialog.js';
import { findDuplicateCandidates, pairKey, sortDuplicateCandidates } from './duplicateDetection.js';
import { getExactMatchCandidates, getSparseDuplicateCandidates, openBulkResolveModal } from './bulkResolveModal.js';
import { saveDismissed } from './state.js';

function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

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
// every data change instead of tracking invalidation manually. Excludes
// search/sort so callers needing the full pre-filter set (e.g. the compare
// panel's selected-pair lookup) aren't affected by what the user typed.
export function getVisibleCandidates(dm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  return findDuplicateCandidates(data)
    .map((candidate) => ({ ...candidate, key: pairKey(candidate.aId, candidate.bId) }))
    .filter((candidate) => !dm.dismissed.includes(candidate.key))
    .filter((candidate) => byId.has(candidate.aId) && byId.has(candidate.bId));
}

// Applies the panel's search box and sort dropdown on top of
// getVisibleCandidates(). Search matches either person's name or any reason
// chip, since "same birth year" / "2 shared relatives" are often what a user
// remembers about a pair, not just the name.
export function getFilteredSortedCandidates(dm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const candidates = getVisibleCandidates(dm, data);
  const query = dm.search.trim().toLowerCase();

  const filtered = query
    ? candidates.filter((candidate) => {
        const a = byId.get(candidate.aId);
        const b = byId.get(candidate.bId);
        const haystack = [toLabel(a), toLabel(b), ...candidate.reasons].join(' ').toLowerCase();
        return haystack.includes(query);
      })
    : candidates;

  return sortDuplicateCandidates(filtered, dm.sort, byId);
}

// After dismissing or merging the selected pair, moves selection to whatever
// candidate now sits at the same position in the list - so the user can
// keep working down the list without re-clicking after every action. Takes
// the pre-action list (captured before the mutation) so it knows where the
// resolved pair used to sit; `data` is read fresh since a merge already
// mutated it in place by the time this runs.
export function selectNextCandidate(dm, data, previousCandidates, resolvedKey) {
  const index = previousCandidates.findIndex((c) => c.key === resolvedKey);
  const remaining = getFilteredSortedCandidates(dm, data);
  if (remaining.length === 0) {
    dm.selectedPairKey = null;
    return;
  }
  const nextIndex = Math.min(Math.max(index, 0), remaining.length - 1);
  dm.selectedPairKey = remaining[nextIndex].key;
}

function renderDuplicateListBody(dm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const candidates = getFilteredSortedCandidates(dm, data);

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
    : `<li class="dm-empty-state">${dm.search ? 'No duplicates match your search.' : 'No likely duplicates found.'}</li>`;

  return `<ul class="dm-pair-list" id="dm-pair-list" role="listbox">${rowsHtml}</ul>`;
}

function renderBulkBanner(dm, data, canEdit) {
  if (!canEdit) return '';
  const byId = new Map(data.map((d) => [d.id, d]));
  const visible = getVisibleCandidates(dm, data);
  const exactMatches = getExactMatchCandidates(visible, byId);
  const sparseDuplicates = getSparseDuplicateCandidates(visible, byId);

  const banners = [];
  if (exactMatches.length > 0) {
    banners.push(`
      <div class="dm-bulk-banner" id="dm-bulk-banner">
        <span>${exactMatches.length} pair${exactMatches.length === 1 ? '' : 's'} match exactly - no conflicting fields.</span>
        <button type="button" class="chip" id="dm-bulk-resolve-btn">Resolve all&hellip;</button>
      </div>
    `);
  }
  if (sparseDuplicates.length > 0) {
    banners.push(`
      <div class="dm-bulk-banner" id="dm-bulk-sparse-banner">
        <span>${sparseDuplicates.length} pair${sparseDuplicates.length === 1 ? '' : 's'} share a name and have no relationships to inherit.</span>
        <button type="button" class="chip" id="dm-bulk-sparse-resolve-btn">Resolve all&hellip;</button>
      </div>
    `);
  }
  return banners.join('');
}

export function renderDuplicateListPanel(dm, data, { canEdit = false } = {}) {
  const count = getFilteredSortedCandidates(dm, data).length;

  return `
    <div class="dm-panel-header">
      <h3>Possible Duplicates <span class="rm-count-badge" id="dm-pair-count">${count}</span></h3>
      ${renderBulkBanner(dm, data, canEdit)}
      <label class="search-box dm-search-box">
        ${icon('search')}
        <input
          type="text"
          id="dm-pair-search-input"
          placeholder="Search..."
          autocomplete="off"
          aria-label="Search possible duplicates"
          value="${escapeHtml(dm.search)}"
        />
      </label>
      <div class="sort-box">
        <span class="sort-box-label">Sort by</span>
        <select id="dm-pair-sort-select" aria-label="Sort possible duplicates">
          <option value="score" ${dm.sort === 'score' ? 'selected' : ''}>Match strength</option>
          <option value="name" ${dm.sort === 'name' ? 'selected' : ''}>Name</option>
          <option value="birthYear" ${dm.sort === 'birthYear' ? 'selected' : ''}>Birth year</option>
        </select>
      </div>
    </div>
    <div id="dm-pair-list-wrap">${renderDuplicateListBody(dm, data)}</div>
  `;
}

// Binds listeners inside #dm-pair-list-wrap (dismiss buttons, row selection).
// Called after both a full panel render and a search-driven partial update,
// since the latter replaces this subtree too.
function attachListWrapListeners(state, render) {
  const dm = state.duplicateManager;
  const data = state.selectedTreeData;
  const list = document.querySelector('#dm-pair-list');
  if (!list) return;

  list.querySelectorAll('.dm-dismiss-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const key = btn.dataset.key;
      const wasSelected = dm.selectedPairKey === key;
      const previousCandidates = getFilteredSortedCandidates(dm, data);
      if (!dm.dismissed.includes(key)) {
        dm.dismissed.push(key);
        saveDismissed(state.selectedTreeId, dm.dismissed);
      }
      if (wasSelected) {
        dm.keepFirst = true;
        dm.fieldChoices = {};
        selectNextCandidate(dm, data, previousCandidates, key);
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

// Debounced so a fast typist doesn't re-filter on every single keystroke,
// but never calls the full render() - only #dm-pair-list-wrap and the count
// badge are replaced, so the search <input> above them keeps focus and
// cursor position no matter how long the debounce takes to fire.
const debouncedSearch = debounce((state, render, data) => {
  const dm = state.duplicateManager;
  const wrap = document.querySelector('#dm-pair-list-wrap');
  if (!wrap) {
    render();
    return;
  }
  wrap.innerHTML = renderDuplicateListBody(dm, data);
  const countBadge = document.querySelector('#dm-pair-count');
  if (countBadge) countBadge.textContent = String(getFilteredSortedCandidates(dm, data).length);
  attachListWrapListeners(state, render);
});

export function attachDuplicateListListeners(state, render) {
  const dm = state.duplicateManager;
  const data = state.selectedTreeData;

  document.querySelector('#dm-pair-search-input')?.addEventListener('input', (event) => {
    dm.search = event.target.value;
    debouncedSearch(state, render, data);
  });

  document.querySelector('#dm-pair-sort-select')?.addEventListener('change', (event) => {
    dm.sort = event.target.value;
    render();
  });

  document.querySelector('#dm-bulk-resolve-btn')?.addEventListener('click', () => {
    const byId = new Map(data.map((d) => [d.id, d]));
    const candidates = getExactMatchCandidates(getVisibleCandidates(dm, data), byId);
    if (candidates.length === 0) return;
    openBulkResolveModal({ candidates, data, dm, render, mode: 'exact' });
  });

  document.querySelector('#dm-bulk-sparse-resolve-btn')?.addEventListener('click', () => {
    const byId = new Map(data.map((d) => [d.id, d]));
    const candidates = getSparseDuplicateCandidates(getVisibleCandidates(dm, data), byId);
    if (candidates.length === 0) return;
    openBulkResolveModal({ candidates, data, dm, render, mode: 'sparse' });
  });

  attachListWrapListeners(state, render);
}
