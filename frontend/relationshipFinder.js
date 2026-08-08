// Relationship Finder - a Tree View mode (alongside Focused/All Nodes/
// Relationships/Duplicates/Settings, reachable from the Tree View options
// menu's View group - see renderPrimaryTabSwitcher) that lets a user pick
// any two people in the tree (Person A/Person B) and see how they relate:
// a plain-language summary sentence, step-count/category badges, and a
// visual node-by-node path between them.
//
// v1 only compared "any member vs. the tree's focused/root person" via a
// single search box (see git history for the old single-box version). v2
// generalizes that to arbitrary pairs - getRelationshipPath() already
// accepted two arbitrary ids, so this only required a second combobox (see
// relationshipFinderCombobox.js) and surfacing the node/edge chain the BFS
// traversal was already computing (see relationshipGraph.js).
//
// Reuses the same BFS traversal as backend/utils/findRelationship.js (kept
// as relationshipGraph.js here since the frontend always computes
// client-side against already-fetched tree data, per this codebase's
// convention - see memberSearch.js, mediaLibraryPanel.js, etc.).

import { renderPageHeader } from './components.js';
import { createPersonCombobox } from './relationshipFinderCombobox.js';
import { getRelationshipPath } from './relationshipGraph.js';
import { getLabel } from './memberSearch.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

const state = {
  data: [],
  personAId: null,
  personBId: null,
  initialized: false,
};

let comboboxA = null;
let comboboxB = null;

function getInitials(person) {
  const label = getLabel(person).trim();
  if (!label) return '?';
  const parts = label.split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

function avatarHtml(person) {
  const avatarUrl = person?.data?.avatar;
  return avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" />`
    : `<span class="relationship-path-avatar-fallback">${escapeHtml(getInitials(person))}</span>`;
}

// Un-capitalizes just the leading word so a chain like "Sister's son" reads
// naturally spliced mid-sentence ("...of your sister's son").
function decapitalize(str) {
  if (!str) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
}

// "<Person B> is the <short relation> of <Person A>['s <chain>]" - e.g.
// "Asharaf is the father-in-law of your sister's son's son". Uses
// rootToTarget.chain (the plain step chain with no " / Short" suffix, see
// relationshipGraph.js) rather than .label, which sometimes has that suffix
// appended and would read oddly spliced into a sentence.
//
// In-law relations are always skipped from this "A's chain" splice: the
// chain for an in-law path (e.g. "husband's mother") already names the same
// relationship "mother-in-law" describes end-to-end, not an intermediate
// person of A's - splicing it in as "of A's husband's mother" either just
// restates the same fact twice or, when the chain didn't fully collapse
// (e.g. aunt-in-law), reads as an unrelated/garbled relation entirely.
function summarySentence(result, personAName, personBName) {
  const { rootToTarget, distance } = result;
  if (distance === 0) return `${escapeHtml(personBName)} and ${escapeHtml(personAName)} are the same person.`;

  const relation = rootToTarget.short.toLowerCase();
  const isInLaw = relation.endsWith('-in-law');
  if (isInLaw || !rootToTarget.chain || rootToTarget.chain.toLowerCase() === relation) {
    return `${escapeHtml(personBName)} is the ${escapeHtml(relation)} of ${escapeHtml(personAName)}.`;
  }
  return `${escapeHtml(personBName)} is the ${escapeHtml(relation)} of ${escapeHtml(personAName)}'s ${escapeHtml(decapitalize(rootToTarget.chain))}.`;
}

function relationshipResultHtml() {
  if (state.personAId == null || state.personBId == null) {
    return `<p class="relationship-card-empty-text">Pick two people above to see how they're related.</p>`;
  }
  if (state.personAId === state.personBId) {
    return `<p class="relationship-card-empty-text">Pick two different people to compare.</p>`;
  }

  const result = getRelationshipPath(state.personAId, state.personBId, state.data);
  const personA = state.data.find((p) => String(p.id) === String(state.personAId));
  const personB = state.data.find((p) => String(p.id) === String(state.personBId));
  const personAName = getLabel(personA);
  const personBName = getLabel(personB);

  if (!result.found) {
    return `
      <div class="relationship-card relationship-card-empty">
        <p class="relationship-card-empty-text">No relationship path found between ${escapeHtml(personAName)} and ${escapeHtml(personBName)}.</p>
      </div>
    `;
  }

  const { nodes, edges, distance, category } = result;

  return `
    <div class="relationship-card relationship-card-v2">
      <p class="relationship-card-summary">${summarySentence(result, personAName, personBName)}</p>
      <div class="relationship-card-badges">
        <span class="rf-badge">${distance} step${distance === 1 ? '' : 's'} apart</span>
        <span class="rf-badge rf-badge-category">${escapeHtml(category)}</span>
      </div>
      <div class="relationship-path" role="list" aria-label="Relationship path from ${escapeHtml(personAName)} to ${escapeHtml(personBName)}">
        ${nodes.map((person, i) => `
          ${i > 0 ? `
            <div class="relationship-path-edge" role="listitem">
              <span class="relationship-path-edge-line" aria-hidden="true"></span>
              <span class="relationship-path-edge-label">${escapeHtml(edges[i - 1])}</span>
            </div>
          ` : ''}
          <div class="relationship-path-node" role="listitem">
            <span class="relationship-path-avatar">${avatarHtml(person)}</span>
            <span class="relationship-path-name">${escapeHtml(getLabel(person))}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderResult() {
  const el = document.querySelector('#relationship-finder-result');
  if (!el) return;
  el.innerHTML = relationshipResultHtml();
}

function renderPickers() {
  const elA = document.querySelector('#rf-person-a');
  const elB = document.querySelector('#rf-person-b');
  if (!elA || !elB) return;
  elA.innerHTML = comboboxA.render({ selectedId: state.personAId });
  elB.innerHTML = comboboxB.render({ selectedId: state.personBId });
  comboboxA.attach(elA);
  comboboxB.attach(elB);
}

/**
 * Full panel content for the Relationship Finder Tree View mode - rendered
 * into #FamilyChart in place of the chart canvas, same as
 * relationship-manager/duplicate-manager/settings (see
 * renderRelationshipFinderViewMode in main.js). The tree breadcrumb/tabs/
 * Editing dropdown all live in the shared chrome above this.
 * @param {{ data: Array, rootId: string|number }} options
 *   `data` is the full family tree array for the current tree; `rootId`
 *   seeds Person A the first time this panel is opened for a tree (the
 *   tree's focused/default person, since person-nodes aren't tied 1:1 to
 *   accounts) - it does not override a Person A the user already picked on
 *   a later re-render.
 */
export function renderRelationshipFinderPageContent({ data, rootId }) {
  const nextData = Array.isArray(data) ? data : [];
  const treeChanged = nextData !== state.data;
  state.data = nextData;

  if (!state.initialized || treeChanged) {
    state.personAId = rootId != null ? String(rootId) : null;
    state.personBId = null;
    state.initialized = true;
  }
  if (state.personAId != null && !state.data.some((p) => String(p.id) === String(state.personAId))) {
    state.personAId = null;
  }
  if (state.personBId != null && !state.data.some((p) => String(p.id) === String(state.personBId))) {
    state.personBId = null;
  }

  return `
    <div class="relationship-finder-page">
      ${renderPageHeader({
        subtitle: 'Find the relationship between any two people in this tree.',
      })}

      <div class="relationship-finder" id="relationship-finder">
        <div class="rf-picker-row">
          <div class="rf-picker" id="rf-person-a"></div>
          <button type="button" id="rf-swap-btn" class="rf-swap-btn" aria-label="Swap Person A and Person B" title="Swap">${icon('swap')}</button>
          <div class="rf-picker" id="rf-person-b"></div>
        </div>
        <div id="relationship-finder-result">${relationshipResultHtml()}</div>
      </div>
    </div>
  `;
}

// The breadcrumb/tabs/Editing dropdown are shared chrome owned by
// attachTreeViewerHeaderListeners (see main.js) - same as
// relationship-manager/duplicate-manager/settings, this only wires the
// panel's own two comboboxes + swap button.
export function attachRelationshipFinderPageListeners() {
  const root = document.querySelector('.relationship-finder-page');
  if (!root) return;

  comboboxA = createPersonCombobox({
    id: 'a',
    label: 'Person A',
    data: state.data,
    excludeId: () => state.personBId,
    onSelect: (id) => {
      state.personAId = id;
      renderResult();
    },
  });
  comboboxB = createPersonCombobox({
    id: 'b',
    label: 'Person B',
    data: state.data,
    excludeId: () => state.personAId,
    onSelect: (id) => {
      state.personBId = id;
      renderResult();
    },
  });

  renderPickers();

  const swapBtn = document.querySelector('#rf-swap-btn');
  swapBtn?.addEventListener('click', () => {
    [state.personAId, state.personBId] = [state.personBId, state.personAId];
    renderPickers();
    renderResult();
  });
}
