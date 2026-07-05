// Right panel: the connected family tree as a collapsible hierarchy, so
// users can see existing structure before connecting someone to it. No
// existing component renders this - the f3 chart is canvas/SVG, not a
// collapsible list - so this is fully new. Read-only: no validator/mutation
// calls, it only ever selects a person as the builder panel's target.
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { buildMemberSearchIndex, searchMembers } from '../memberSearch.js';

function toLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum?.id ?? '');
}

export function buildHierarchyRoots(data) {
  return data.filter((d) => (d.rels?.parents || []).length === 0 && ((d.rels?.children || []).length > 0 || (d.rels?.spouses || []).length > 0));
}

function ancestorChainIds(datum, byId) {
  const ids = [];
  let current = datum;
  const visiting = new Set();
  while (current && (current.rels?.parents || []).length > 0) {
    const parentId = current.rels.parents[0];
    if (visiting.has(parentId)) break;
    visiting.add(parentId);
    ids.push(parentId);
    current = byId.get(parentId);
  }
  return ids;
}

function renderNode(datum, byId, expandedIds, highlightId, visiting = new Set()) {
  const id = datum.id;
  if (visiting.has(id)) return '';
  const nextVisiting = new Set(visiting);
  nextVisiting.add(id);

  const children = (datum.rels?.children || []).map((cid) => byId.get(cid)).filter(Boolean);
  const spouses = (datum.rels?.spouses || []).map((sid) => byId.get(sid)).filter(Boolean);
  const hasChildren = children.length > 0;
  const expanded = expandedIds.has(id);
  const isHighlighted = highlightId === id;

  const spouseBadge = spouses.length
    ? `<span class="rm-tree-spouse-badge" title="Spouse of ${escapeHtml(spouses.map(toLabel).join(', '))}">${icon('share')} ${escapeHtml(spouses.map(toLabel).join(', '))}</span>`
    : '';

  const childrenHtml = hasChildren && expanded
    ? `<ul class="rm-tree-node-children">${children.map((child) => renderNode(child, byId, expandedIds, highlightId, nextVisiting)).join('')}</ul>`
    : '';

  return `
    <li class="rm-tree-node">
      <div class="rm-tree-row ${isHighlighted ? 'is-highlighted' : ''}" data-id="${escapeHtml(id)}" tabindex="-1">
        ${
          hasChildren
            ? `<button type="button" class="rm-tree-toggle" data-id="${escapeHtml(id)}" aria-label="${expanded ? 'Collapse' : 'Expand'}">${icon(expanded ? 'chevronDown' : 'chevronRight')}</button>`
            : `<span class="rm-tree-toggle-spacer"></span>`
        }
        <span class="rm-tree-name" data-select-id="${escapeHtml(id)}">${escapeHtml(toLabel(datum))}</span>
        ${spouseBadge}
      </div>
      ${childrenHtml}
    </li>
  `;
}

// Rendered into #rm-tree-panel-body, a container separate from the search
// <input> above it. The search listener below updates only this container's
// innerHTML - re-rendering the whole panel would recreate the input and drop
// focus/cursor position after every character typed.
function renderTreeBody(rm, data) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const roots = buildHierarchyRoots(data);

  return roots.length
    ? `<ul class="rm-tree-root-list">${roots.map((root) => renderNode(root, byId, rm.tree.expandedIds, rm.tree.highlightId)).join('')}</ul>`
    : `<p class="rm-empty-state">No connected family members yet.</p>`;
}

export function renderTreeHierarchyPanel(rm, data) {
  return `
    <div class="rm-panel-header">
      <h3>Existing Family Tree</h3>
      <label class="search-box rm-search-box">
        ${icon('search')}
        <input type="text" id="rm-tree-search-input" placeholder="Search tree..." autocomplete="off" value="${escapeHtml(rm.tree.search)}" />
      </label>
    </div>
    <div class="rm-tree-panel-body" id="rm-tree-panel-body">${renderTreeBody(rm, data)}</div>
  `;
}

function attachTreeBodyListeners(state, render, onSelectTarget) {
  const rm = state.relationshipManager;
  document.querySelectorAll('.rm-tree-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (rm.tree.expandedIds.has(id)) rm.tree.expandedIds.delete(id);
      else rm.tree.expandedIds.add(id);
      render();
    });
  });

  document.querySelectorAll('.rm-tree-name').forEach((el) => {
    el.addEventListener('click', () => onSelectTarget?.(el.dataset.selectId));
  });
}

export function attachTreeHierarchyListeners(state, render, onSelectTarget) {
  const rm = state.relationshipManager;
  const data = state.selectedTreeData;
  const byId = new Map(data.map((d) => [d.id, d]));

  document.querySelector('#rm-tree-search-input')?.addEventListener('input', (event) => {
    rm.tree.search = event.target.value;
    const query = event.target.value.trim();
    if (!query) {
      rm.tree.highlightId = null;
    } else {
      const index = buildMemberSearchIndex(data);
      const [match] = searchMembers(index, query, 1);
      if (match) {
        ancestorChainIds(byId.get(match.id), byId).forEach((id) => rm.tree.expandedIds.add(id));
        rm.tree.highlightId = match.id;
      }
    }

    const body = document.querySelector('#rm-tree-panel-body');
    if (!body) {
      render();
      return;
    }
    body.innerHTML = renderTreeBody(rm, data);
    attachTreeBodyListeners(state, render, onSelectTarget);
    requestAnimationFrame(() => {
      document.querySelector(`.rm-tree-row[data-id="${CSS.escape(rm.tree.highlightId || '')}"]`)?.scrollIntoView({ block: 'center' });
    });
  });

  attachTreeBodyListeners(state, render, onSelectTarget);
}
