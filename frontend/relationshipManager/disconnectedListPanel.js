// Left panel: the "Needs Connection" list. Search/sort/paginate the
// disconnected-members set (or, with the "Show all members" toggle on,
// every member) and let the user multi-select rows (checkbox, shift-click
// range, ctrl/cmd-click toggle, or keyboard) to feed into the builder panel.
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { getDisconnectedMembers, sortDisconnected, isDisconnected, relationSummary } from './disconnectedMembers.js';
import { searchMembers } from '../memberSearch.js';
import { toLabel } from '../relationshipDialog.js';

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

function genderLabel(datum) {
  const g = datum?.data?.gender;
  if (g === 'M') return 'Male';
  if (g === 'F') return 'Female';
  if (g === 'O') return 'Other';
  return 'Unknown';
}

// Exported so main.js's renderRelationshipManagerMode() can compute the
// visible list once and hand it to both this panel and the builder panel
// (which needs to know how many sources are selected for its header).
export function getVisibleDisconnectedList(rm, data, searchIndex) {
  const candidates = rm.showAllMembers ? (Array.isArray(data) ? data : []) : getDisconnectedMembers(data);
  const filtered = rm.disconnectedSearch.trim() && searchIndex
    ? searchMembers(searchIndex, rm.disconnectedSearch, candidates.length).filter((entry) =>
        candidates.some((d) => d.id === entry.id),
      ).map((entry) => candidates.find((d) => d.id === entry.id))
    : candidates;
  return sortDisconnected(filtered, rm.disconnectedSort, rm.recent?.memberIds || []);
}

// Rendered into #rm-disconnected-list-wrap, a container separate from the
// search <input> (and sort <select>) above it. Search-driven updates replace
// only this container's innerHTML - re-rendering the whole panel would
// recreate the input element and drop focus/cursor position after every
// character typed (the input's `value` attribute only sets the *initial*
// value anyway, so it wouldn't even reflect further typing once recreated).
function renderDisconnectedListBody(rm, data, searchIndex) {
  const visible = getVisibleDisconnectedList(rm, data, searchIndex);
  const totalPages = Math.max(1, Math.ceil(visible.length / rm.disconnectedPageSize));
  const page = Math.min(rm.disconnectedPage, totalPages);
  const start = (page - 1) * rm.disconnectedPageSize;
  const pageItems = visible.slice(start, start + rm.disconnectedPageSize);

  const rowsHtml = pageItems.length
    ? pageItems
        .map((datum, index) => {
          const globalIndex = start + index;
          const selected = rm.selectedSourceIds.includes(datum.id);
          const active = rm.activePanel === 'left' && rm.activeIndex === globalIndex;
          const avatar = datum.data?.avatar
            ? `<img class="rm-member-avatar" src="${escapeHtml(datum.data.avatar)}" alt="" />`
            : `<span class="rm-member-avatar rm-member-avatar-placeholder">${icon('user')}</span>`;
          const connected = !isDisconnected(datum);
          const summary = connected ? relationSummary(datum) : '';
          return `
            <li
              class="rm-member-row ${selected ? 'is-selected' : ''} ${active ? 'is-active' : ''}"
              data-id="${escapeHtml(datum.id)}"
              data-index="${globalIndex}"
              role="option"
              aria-selected="${selected}"
              tabindex="${active ? '0' : '-1'}"
            >
              <input type="checkbox" class="rm-member-checkbox" data-id="${escapeHtml(datum.id)}" ${selected ? 'checked' : ''} aria-label="Select ${escapeHtml(toLabel(datum))}" />
              ${avatar}
              <span class="rm-member-info">
                <span class="rm-member-name">${escapeHtml(toLabel(datum))}</span>
                <span class="rm-member-meta">
                  ${escapeHtml(genderLabel(datum))}${birthYearLabel(datum) ? ` &middot; b. ${escapeHtml(birthYearLabel(datum))}` : ''}
                  ${summary ? `<span class="rm-member-connected-badge">${escapeHtml(summary)}</span>` : ''}
                </span>
              </span>
            </li>
          `;
        })
        .join('')
    : `<li class="rm-empty-state">${
        rm.disconnectedSearch
          ? 'No members match your search.'
          : rm.showAllMembers
            ? 'No members in this tree yet.'
            : 'No disconnected members left to connect.'
      }</li>`;

  return `
    <ul class="rm-member-list" id="rm-disconnected-list" role="listbox" aria-multiselectable="true">
      ${rowsHtml}
    </ul>
    <div class="rm-pagination">
      <button type="button" id="rm-disconnected-prev-btn" class="chip" ${page <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="rm-pagination-label">Page ${page} of ${totalPages}</span>
      <button type="button" id="rm-disconnected-next-btn" class="chip" ${page >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;
}

export function renderDisconnectedListPanel(rm, data, searchIndex) {
  const visible = getVisibleDisconnectedList(rm, data, searchIndex);
  const title = rm.showAllMembers ? 'All Members' : 'Needs Connection';

  return `
    <div class="rm-panel-header">
      <h3 id="rm-disconnected-title">${title} <span class="rm-count-badge" id="rm-disconnected-count">${visible.length}</span></h3>
      <label class="search-box rm-search-box">
        ${icon('search')}
        <input
          type="text"
          id="rm-disconnected-search-input"
          placeholder="Search..."
          autocomplete="off"
          aria-label="Search members"
          value="${escapeHtml(rm.disconnectedSearch)}"
        />
      </label>
      <select id="rm-disconnected-sort-select" aria-label="Sort members">
        <option value="name" ${rm.disconnectedSort === 'name' ? 'selected' : ''}>Name</option>
        <option value="birthYear" ${rm.disconnectedSort === 'birthYear' ? 'selected' : ''}>Birth year</option>
        <option value="recent" ${rm.disconnectedSort === 'recent' ? 'selected' : ''}>Recently selected</option>
      </select>
      <label class="rm-show-all-toggle">
        <input type="checkbox" id="rm-show-all-toggle" ${rm.showAllMembers ? 'checked' : ''} />
        Show all members (including already-connected)
      </label>
    </div>
    <div class="rm-panel-toolbar">
      <label class="rm-keep-selection">
        <input type="checkbox" id="rm-keep-selection-toggle" ${rm.keepSelection ? 'checked' : ''} />
        Keep Selection
      </label>
      <span class="rm-selected-count" id="rm-selected-count">${rm.selectedSourceIds.length} selected</span>
    </div>
    <div id="rm-disconnected-list-wrap">${renderDisconnectedListBody(rm, data, searchIndex)}</div>
  `;
}

function toggleRange(rm, visible, fromIndex, toIndex) {
  const [lo, hi] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
  const rangeIds = visible.slice(lo, hi + 1).map((d) => d.id);
  const merged = new Set([...rm.selectedSourceIds, ...rangeIds]);
  rm.selectedSourceIds = Array.from(merged);
}

// Binds listeners inside #rm-disconnected-list-wrap (pagination buttons,
// checkboxes, row clicks). Called after both a full panel render and a
// search-driven partial update, since the latter replaces this subtree too.
function attachListWrapListeners(state, render, data, searchIndex) {
  const rm = state.relationshipManager;
  const list = document.querySelector('#rm-disconnected-list');
  if (!list) return;
  const visible = getVisibleDisconnectedList(rm, data, searchIndex);

  document.querySelector('#rm-disconnected-prev-btn')?.addEventListener('click', () => {
    rm.disconnectedPage = Math.max(1, rm.disconnectedPage - 1);
    render();
  });

  document.querySelector('#rm-disconnected-next-btn')?.addEventListener('click', () => {
    rm.disconnectedPage += 1;
    render();
  });

  list.querySelectorAll('.rm-member-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => event.stopPropagation());
    checkbox.addEventListener('change', () => {
      const id = checkbox.dataset.id;
      if (checkbox.checked) {
        if (!rm.selectedSourceIds.includes(id)) rm.selectedSourceIds.push(id);
      } else {
        rm.selectedSourceIds = rm.selectedSourceIds.filter((existing) => existing !== id);
      }
      render();
    });
  });

  list.querySelectorAll('.rm-member-row').forEach((row) => {
    row.addEventListener('click', (event) => {
      const id = row.dataset.id;
      const index = Number(row.dataset.index);
      rm.activePanel = 'left';
      rm.activeIndex = index;

      if (event.shiftKey && rm.lastClickedIndex !== null) {
        toggleRange(rm, visible, rm.lastClickedIndex, index);
      } else if (event.ctrlKey || event.metaKey) {
        if (rm.selectedSourceIds.includes(id)) {
          rm.selectedSourceIds = rm.selectedSourceIds.filter((existing) => existing !== id);
        } else {
          rm.selectedSourceIds.push(id);
        }
      } else {
        rm.selectedSourceIds = rm.selectedSourceIds.includes(id) && rm.selectedSourceIds.length === 1 ? [] : [id];
      }
      rm.lastClickedIndex = index;
      render();
    });
  });
}

// Debounced so a fast typist doesn't re-filter on every single keystroke,
// but never calls the full render() - only #rm-disconnected-list-wrap and
// the count badge are replaced, so the search <input> above them keeps
// focus and cursor position no matter how long the debounce takes to fire.
const debouncedSearch = debounce((state, render, data, searchIndex) => {
  const rm = state.relationshipManager;
  rm.disconnectedPage = 1;

  const wrap = document.querySelector('#rm-disconnected-list-wrap');
  if (!wrap) {
    render();
    return;
  }
  wrap.innerHTML = renderDisconnectedListBody(rm, data, searchIndex);
  const countBadge = document.querySelector('#rm-disconnected-count');
  if (countBadge) countBadge.textContent = String(getVisibleDisconnectedList(rm, data, searchIndex).length);
  attachListWrapListeners(state, render, data, searchIndex);
});

export function attachDisconnectedListListeners(state, render, data, searchIndex) {
  const rm = state.relationshipManager;

  document.querySelector('#rm-disconnected-search-input')?.addEventListener('input', (event) => {
    rm.disconnectedSearch = event.target.value;
    debouncedSearch(state, render, data, searchIndex);
  });

  document.querySelector('#rm-disconnected-sort-select')?.addEventListener('change', (event) => {
    rm.disconnectedSort = event.target.value;
    render();
  });

  document.querySelector('#rm-show-all-toggle')?.addEventListener('change', (event) => {
    rm.showAllMembers = event.target.checked;
    rm.disconnectedPage = 1;
    render();
  });

  document.querySelector('#rm-keep-selection-toggle')?.addEventListener('change', (event) => {
    rm.keepSelection = event.target.checked;
  });

  attachListWrapListeners(state, render, data, searchIndex);
}
