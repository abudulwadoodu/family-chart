// "Member Directory" - a nested Tree View mode (Tree View options menu's View
// group, alongside Focused/All Nodes/Relationship Finder - see
// renderPrimaryTabSwitcher in components.js) showing every person in the open
// tree as a searchable Card grid or List table. Routed through #FamilyChart
// exactly like relationship-finder/relationship-manager/duplicate-manager/
// settings (see main.js's renderChart dispatcher and
// renderMemberDirectoryViewMode) - a plain viewMode, not its own dashboardView.
//
// Data comes straight from `state.selectedTreeData` (the full tree, already
// loaded client-side for the chart itself) rather than a network fetch - same
// reasoning as relationshipFinder.js: the data's already in memory, so a
// GET round trip would just be redundant latency.
import { renderPageHeader } from './components.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { showModal } from './ui.js';
import { getRelativesSummary } from './memberSearch.js';

const GENDER_LABELS = { M: 'Male', F: 'Female', U: 'Unknown' };

// Module-level state, not part of main.js's giant `state` object - same
// pattern as relationshipFinder.js's own `state`. `view`/`search` persist
// across re-renders within a session but reset on reload, same as that
// module's personA/personB picks.
const state = { view: 'card', search: '' };

function memberName(person) {
  const data = person?.data || {};
  return [data['first name'], data['last name']].filter(Boolean).join(' ').trim() || 'Unnamed';
}

function vitalYears(data) {
  const born = data.birthday ? String(data.birthday).slice(0, 4) : null;
  const died = data.death ? String(data.death).slice(0, 4) : null;
  const isLiving = !data.death;
  if (!born && !died) return 'Dates unknown';
  if (isLiving) return born ? `b. ${born}` : 'Dates unknown';
  return `${born || '?'} – ${died || '?'}`;
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

function avatarHtml(name, avatarUrl) {
  if (avatarUrl) {
    return `<img class="directory-avatar-img" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" />`;
  }
  return `<span class="directory-avatar-fallback">${escapeHtml(initials(name).toUpperCase())}</span>`;
}

// `byId` is a Map<id, Datum> over the full tree - same lookup
// relationshipFinderCombobox.js passes to getRelativesSummary to resolve
// "Child of X; Spouse of Y"-style names from raw rels ids.
function toDirectoryMember(person, byId) {
  const data = person?.data || {};
  return {
    id: person.id,
    name: memberName(person),
    gender: data.gender || null,
    years: vitalYears(data),
    avatar: data.avatar || null,
    relatives: getRelativesSummary(person, byId),
  };
}

// Read-only profile popup for a directory card/row - shows the same field
// set as the chart's own person editor (setFields in main.js's renderChart)
// minus avatar (already shown as the modal's photo), but through
// showModal/appUX.js's generic <dialog> engine instead of f3's EditTree:
// EditTree is wired directly into a live chart's D3 store (its history
// controls even throw if `.f3-nav-cont` isn't in the DOM - see
// src/core/edit.ts), so it can't be opened without a chart underneath.
// Member Directory intentionally has no chart mounted (state.chart/editor
// are null while it's showing - see renderMemberDirectoryViewMode in
// main.js), so "View Profile" opens this instead of navigating to Focused
// mode just to reach the chart's own popup.
const PROFILE_FIELDS = [
  { id: 'location', label: 'Location' },
  { id: 'email', label: 'Email' },
  { id: 'notes', label: 'Notes' },
];

function renderProfileRow(label, value) {
  if (!value) return '';
  return `
    <div class="member-profile-row">
      <span class="member-profile-row-label">${escapeHtml(label)}</span>
      <span class="member-profile-row-value">${escapeHtml(String(value))}</span>
    </div>
  `;
}

function renderProfileModalBody(person, byId) {
  const data = person?.data || {};
  const name = memberName(person);
  const relatives = getRelativesSummary(person, byId);
  const fieldsHtml = [renderProfileRow('Immediate Relations', relatives), ...PROFILE_FIELDS.map(({ id, label }) => renderProfileRow(label, data[id]))].join('');

  return `
    <button type="button" class="icon-btn modal-close" id="member-profile-close-btn" aria-label="Close">${icon('close')}</button>
    <div class="member-profile-modal-header">
      <div class="directory-avatar member-profile-avatar">${avatarHtml(name, data.avatar)}</div>
      <div>
        <h3 id="modal-title" class="member-profile-name">${escapeHtml(name)}</h3>
        <p class="muted member-profile-meta">${escapeHtml(GENDER_LABELS[data.gender] || 'Unknown')} &middot; ${escapeHtml(vitalYears(data))}</p>
      </div>
    </div>
    <div class="member-profile-fields">
      ${fieldsHtml || '<p class="muted">No further details on file.</p>'}
    </div>
  `;
}

export function openMemberProfileModal(person, byId) {
  if (!person) return;
  const modal = showModal({ bodyHtml: renderProfileModalBody(person, byId), className: 'modal-member-profile' });
  modal.root.querySelector('#member-profile-close-btn')?.addEventListener('click', modal.close);
}

function renderToolbar() {
  return `
    <div class="directory-toolbar">
      <label class="search-box directory-search-box">
        ${icon('search')}
        <input type="search" id="directory-search-input" placeholder="Search members by name..." value="${escapeHtml(state.search)}" />
      </label>
      <div class="directory-view-toggle" role="group" aria-label="Directory view">
        <button type="button" class="icon-btn directory-view-btn ${state.view === 'card' ? 'directory-view-btn-active' : ''}" data-view="card" aria-label="Card view" aria-pressed="${state.view === 'card'}" data-tooltip="Card view" data-tooltip-pos="bottom">
          ${icon('image')}
        </button>
        <button type="button" class="icon-btn directory-view-btn ${state.view === 'list' ? 'directory-view-btn-active' : ''}" data-view="list" aria-label="List view" aria-pressed="${state.view === 'list'}" data-tooltip="List view" data-tooltip-pos="bottom">
          ${icon('list')}
        </button>
      </div>
    </div>
  `;
}

function renderCardGrid(members) {
  if (!members.length) return '<p class="muted directory-empty">No members match your search.</p>';
  return `
    <div class="directory-grid">
      ${members
        .map(
          (m) => `
        <article class="directory-card" data-member-id="${escapeHtml(String(m.id))}" tabindex="0">
          <div class="directory-avatar">${avatarHtml(m.name, m.avatar)}</div>
          <h3 class="directory-card-name">${escapeHtml(m.name)}</h3>
          <p class="directory-card-years muted">${escapeHtml(m.years)}</p>
          <p class="directory-card-gender muted">${escapeHtml(GENDER_LABELS[m.gender] || 'Unknown')}</p>
          ${m.relatives ? `<p class="directory-card-relatives">${escapeHtml(m.relatives)}</p>` : ''}
        </article>
      `
        )
        .join('')}
    </div>
  `;
}

function renderTable(members) {
  if (!members.length) return '<p class="muted directory-empty">No members match your search.</p>';
  return `
    <table class="directory-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Gender</th>
          <th>Birth / Death</th>
          <th>Immediate Relations</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${members
          .map(
            (m) => `
          <tr data-member-id="${escapeHtml(String(m.id))}">
            <td>
              <div class="directory-table-name-cell">
                <span class="directory-avatar directory-avatar-sm">${avatarHtml(m.name, m.avatar)}</span>
                <span>${escapeHtml(m.name)}</span>
              </div>
            </td>
            <td class="muted">${escapeHtml(GENDER_LABELS[m.gender] || 'Unknown')}</td>
            <td class="muted">${escapeHtml(m.years)}</td>
            <td class="muted directory-table-relatives">${m.relatives ? escapeHtml(m.relatives) : '&mdash;'}</td>
            <td>
              <button type="button" class="btn-link directory-view-profile-btn" data-member-id="${escapeHtml(String(m.id))}">View Profile</button>
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function getFilteredMembers(people) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const needle = state.search.trim().toLowerCase();
  const members = people.map((p) => toDirectoryMember(p, byId)).filter((m) => !needle || m.name.toLowerCase().includes(needle));
  members.sort((a, b) => a.name.localeCompare(b.name));
  return members;
}

function renderResults(people) {
  const members = getFilteredMembers(people);
  return state.view === 'list' ? renderTable(members) : renderCardGrid(members);
}

// `data` is the full family tree array for the current tree (state.selectedTreeData
// in main.js), same convention as relationshipFinder.js's renderRelationshipFinderPageContent.
// The results (card grid/table) live in their own #directory-results
// container, separate from the search input/view toggle above them -
// attachMemberDirectoryPageListeners's search handler re-renders only that
// inner container on every keystroke, rather than main.js's rerender (a full
// innerHTML replace of the whole page) which would tear down and recreate
// the <input> itself and drop focus/cursor mid-type.
export function renderMemberDirectoryPageContent({ data }) {
  const people = Array.isArray(data) ? data : [];

  return `
    <div class="member-directory-page">
      ${renderPageHeader({ title: 'Member Directory', subtitle: 'Every person in this tree, at a glance.' })}
      ${renderToolbar()}
      <div id="directory-results">${renderResults(people)}</div>
    </div>
  `;
}

// The breadcrumb/tabs/Editing dropdown are shared chrome owned by
// attachTreeViewerHeaderListeners (see main.js) - same as
// relationship-finder/relationship-manager/duplicate-manager/settings, this
// only wires the panel's own search input, view toggle, and card/row clicks.
// `data` is the same full tree array passed to renderMemberDirectoryPageContent
// - needed here (not just memberId) so "View Profile" can open
// openMemberProfileModal with the full person record in place, rather than
// main.js having to navigate to the chart to reach a profile popup.
export function attachMemberDirectoryPageListeners({ data, rerender } = {}) {
  const root = document.querySelector('.member-directory-page');
  if (!root) return;

  const people = Array.isArray(data) ? data : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const openProfile = (memberId) => {
    const person = people.find((p) => String(p.id) === memberId);
    openMemberProfileModal(person, byId);
  };

  function bindResultListeners(resultsEl) {
    resultsEl.querySelectorAll('.directory-card, .directory-view-profile-btn, .directory-table tr[data-member-id]').forEach((el) => {
      el.addEventListener('click', () => openProfile(el.dataset.memberId));
      if (el.classList.contains('directory-card')) {
        el.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openProfile(el.dataset.memberId);
          }
        });
      }
    });
  }

  function rerenderResults() {
    const resultsEl = root.querySelector('#directory-results');
    if (!resultsEl) return;
    resultsEl.innerHTML = renderResults(people);
    bindResultListeners(resultsEl);
  }

  root.querySelector('#directory-search-input')?.addEventListener('input', (event) => {
    state.search = event.target.value;
    rerenderResults();
  });

  root.querySelectorAll('.directory-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      rerender?.();
    });
  });

  const resultsEl = root.querySelector('#directory-results');
  if (resultsEl) bindResultListeners(resultsEl);
}
