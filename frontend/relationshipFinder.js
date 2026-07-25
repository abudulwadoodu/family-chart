// Relationship Finder - a standalone tree-detail page (alongside Media
// Library and Timeline) that lets a user search any person in the tree and
// see, in plain text, how that person relates to a chosen root person - both
// "their relation to you" and "your relation to them" - without a tree
// graph, just a simple high-contrast result card.
//
// Mirrors memberSearch.js's index/search split so lookups stay fast on large
// trees, and reuses the same BFS traversal as backend/utils/findRelationship.js
// (kept as relationshipGraph.js here since the frontend always computes
// client-side against already-fetched tree data, per this codebase's
// convention - see memberSearch.js, mediaLibraryPanel.js, etc.). Unlike
// Media Library/Timeline this page has nothing to fetch or persist, so
// there's no createRelationshipFinderPageState()/loadRelationshipFinderPage()
// pair - the page state lives in this module and is rebuilt from
// state.selectedTreeData on every render.

import { renderTreeBreadcrumb } from './components.js';
import { buildMemberSearchIndex, searchMembers } from './memberSearch.js';
import { getRelationshipPath } from './relationshipGraph.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

const state = {
  index: [],
  data: [],
  rootId: null,
  results: [],
  activeIndex: -1,
  selectedId: null,
};

function getEls() {
  return {
    input: document.querySelector('#relationship-finder-input'),
    clearBtn: document.querySelector('#relationship-finder-clear-btn'),
    resultsEl: document.querySelector('#relationship-finder-results'),
    cardEl: document.querySelector('#relationship-finder-card'),
  };
}

function getPersonLabel(person) {
  const first = person?.data?.['first name'] || '';
  const last = person?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(person?.id ?? '');
}

// Birthday can be stored as a bare year ("1980") or a full date
// ("1980-01-15") - see docs/data-format.md - so just pull the leading year
// rather than risk misparsing an ambiguous date format.
function getBirthYear(person) {
  const birthday = person?.data?.birthday;
  if (!birthday) return null;
  const match = String(birthday).match(/\d{4}/);
  return match ? match[0] : null;
}

function relationshipCardHtml() {
  if (state.selectedId == null || state.rootId == null) return '';

  const result = getRelationshipPath(state.rootId, state.selectedId, state.data);
  const targetPerson = state.data.find((p) => String(p.id) === String(state.selectedId));
  const rootPerson = state.data.find((p) => String(p.id) === String(state.rootId));
  const targetName = getPersonLabel(targetPerson);
  const rootName = getPersonLabel(rootPerson);

  if (!result.found) {
    return `
      <div class="relationship-card relationship-card-empty">
        <div class="relationship-card-title">${escapeHtml(targetName)}</div>
        <div class="relationship-card-empty-text">No relationship path found between ${escapeHtml(rootName)} and ${escapeHtml(targetName)}.</div>
      </div>
    `;
  }

  const birthYear = getBirthYear(targetPerson);
  const metaParts = [birthYear ? `Born ${escapeHtml(birthYear)}` : null].filter(Boolean);

  return `
    <div class="relationship-card">
      <div class="relationship-card-header">
        <div class="relationship-card-name">${escapeHtml(targetName)}</div>
        <div class="relationship-card-kinship">${escapeHtml(result.rootToTarget.short)}</div>
        ${metaParts.length ? `<div class="relationship-card-meta">${metaParts.join(' &middot; ')}</div>` : ''}
      </div>
      <div class="relationship-card-row relationship-card-row-theirs">
        <div class="relationship-card-label">Their relation to you</div>
        <div class="relationship-card-value">${escapeHtml(result.rootToTarget.label)}</div>
      </div>
      <div class="relationship-card-row relationship-card-row-yours">
        <div class="relationship-card-label">Your relation to them</div>
        <div class="relationship-card-value">${escapeHtml(result.targetToRoot.label)}</div>
      </div>
      <div class="relationship-card-distance">${result.distance} step${result.distance === 1 ? '' : 's'} apart in the family tree</div>
    </div>
  `;
}

/**
 * Full page content for the Relationship Finder tree-detail page, matching
 * the shape of renderMediaLibraryPageContent/renderTimelinePageContent.
 * @param {{ data: Array, rootId: string|number, rootLabel?: string, treeName: string }} options
 *   `data` is the full family tree array for the current tree; `rootId` is
 *   the person the relationship is described relative to (the tree's
 *   focused/default person, since person-nodes aren't tied 1:1 to accounts).
 */
export function renderRelationshipFinderPageContent({ data, rootId, treeName }) {
  state.data = Array.isArray(data) ? data : [];
  state.rootId = rootId != null ? String(rootId) : null;
  state.index = buildMemberSearchIndex(state.data);
  if (state.selectedId != null && !state.data.some((p) => String(p.id) === String(state.selectedId))) {
    state.selectedId = null;
  }

  const rootPerson = state.data.find((p) => String(p.id) === String(state.rootId));
  const rootName = getPersonLabel(rootPerson);

  return `
    <div class="relationship-finder-page">
      ${renderTreeBreadcrumb({ treeName, activeTab: 'Relationship Finder' })}
      <header class="page-header">
        <h1 class="page-title">Relationship Finder</h1>
        <p class="page-subtitle">${rootPerson ? `See how anyone in this tree relates to ${escapeHtml(rootName)}.` : 'Search a family member to see how they relate to this tree.'}</p>
      </header>

      <div class="relationship-finder" id="relationship-finder">
        <div class="member-search" id="relationship-finder-search">
          <label class="search-box member-search-box">
            ${icon('search')}
            <input
              type="text"
              id="relationship-finder-input"
              placeholder="Search a family member..."
              autocomplete="off"
              aria-label="Search a family member to see how they're related"
              aria-expanded="false"
              aria-controls="relationship-finder-results"
              role="combobox"
            />
            <button type="button" id="relationship-finder-clear-btn" class="member-search-clear" aria-label="Clear search" hidden>${icon('close')}</button>
          </label>
          <div class="member-search-results" id="relationship-finder-results" role="listbox" hidden></div>
        </div>
        <div id="relationship-finder-card" ${state.selectedId == null ? 'hidden' : ''}>${relationshipCardHtml()}</div>
      </div>
    </div>
  `;
}

// `onBack` navigates back to the tree viewer (breadcrumb tree-name link);
// `onExitTree` navigates all the way out to the My Trees list (breadcrumb
// "My Trees" link) - same contract as attachMediaLibraryPageListeners /
// attachTimelinePageListeners.
export function attachRelationshipFinderPageListeners(onBack, onExitTree) {
  const root = document.querySelector('.relationship-finder-page');
  if (!root) return;

  root.querySelector('#breadcrumb-tree-btn')?.addEventListener('click', onBack);
  root.querySelector('#breadcrumb-trees-btn')?.addEventListener('click', onExitTree);

  const { input, clearBtn } = getEls();
  if (!input || !clearBtn) return;

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    runSearch(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = state.results[Math.max(state.activeIndex, 0)];
      if (target) selectPerson(target.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (input.value) {
        input.value = '';
        clearBtn.hidden = true;
        closeResults();
      } else {
        input.blur();
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    closeResults();
    input.focus();
  });
}

function runSearch(query) {
  if (!query.trim()) {
    closeResults();
    return;
  }
  state.results = searchMembers(state.index, query).filter((entry) => entry.id !== state.rootId);
  state.activeIndex = state.results.length ? 0 : -1;
  renderResults(query);
}

function renderResults(query) {
  const { resultsEl, input } = getEls();
  if (!resultsEl || !input) return;

  resultsEl.hidden = false;
  input.setAttribute('aria-expanded', 'true');

  if (state.results.length === 0) {
    resultsEl.innerHTML = `<div class="member-search-empty">No members found for "${escapeHtml(query.trim())}"</div>`;
    return;
  }

  resultsEl.innerHTML = state.results
    .map((entry, index) => `
      <button
        type="button"
        class="member-search-result-item ${index === state.activeIndex ? 'active' : ''}"
        role="option"
        aria-selected="${index === state.activeIndex}"
        data-id="${escapeHtml(entry.id)}"
      >${highlightMatch(entry.label, query)}</button>
    `)
    .join('');

  resultsEl.querySelectorAll('.member-search-result-item').forEach((btn) => {
    btn.addEventListener('click', () => selectPerson(btn.dataset.id));
  });
}

function highlightMatch(label, query) {
  const q = query.trim();
  if (!q) return escapeHtml(label);
  const at = label.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return escapeHtml(label);
  return (
    escapeHtml(label.slice(0, at)) +
    '<strong>' + escapeHtml(label.slice(at, at + q.length)) + '</strong>' +
    escapeHtml(label.slice(at + q.length))
  );
}

function moveActive(delta) {
  const count = state.results.length;
  if (!count) return;
  state.activeIndex = (state.activeIndex + delta + count) % count;
  document.querySelectorAll('#relationship-finder-results .member-search-result-item').forEach((el, index) => {
    el.classList.toggle('active', index === state.activeIndex);
    el.setAttribute('aria-selected', index === state.activeIndex);
    if (index === state.activeIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

function closeResults() {
  state.results = [];
  state.activeIndex = -1;
  const { resultsEl, input } = getEls();
  if (resultsEl) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
  }
  if (input) input.setAttribute('aria-expanded', 'false');
}

function selectPerson(targetId) {
  if (!targetId) return;
  const { input, clearBtn, cardEl } = getEls();
  closeResults();
  if (input) input.value = '';
  if (clearBtn) clearBtn.hidden = true;

  state.selectedId = targetId;
  if (cardEl) {
    cardEl.hidden = false;
    cardEl.innerHTML = relationshipCardHtml();
  }
}
