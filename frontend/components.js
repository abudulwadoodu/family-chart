import { icon } from './icons.js';
import { escapeHtml, formatRelativeTime } from './utils.js';

const ROLE_LABELS = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

// Shared across the Contact Us page and the legal pages/footer, so the
// support address only needs to be configured in one env var.
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@example.com';

/**
 * A labeled two-option Light/Dark segmented control. `activeTheme` just
 * decides which option renders as pressed - the caller (main.js) owns the
 * actual theme state and re-renders this after a switch.
 * @param {{ activeTheme: 'dark' | 'light', idPrefix?: string }} options
 */
export function renderThemeToggle({ activeTheme, idPrefix = 'theme-toggle' }) {
  return `
    <div class="theme-toggle" role="radiogroup" aria-label="Color theme">
      <button
        type="button"
        id="${idPrefix}-light-btn"
        class="theme-toggle-option ${activeTheme === 'light' ? 'theme-toggle-option-active' : ''}"
        role="radio"
        aria-checked="${activeTheme === 'light'}"
        data-theme-option="light"
      >${icon('sun')}<span>Light</span></button>
      <button
        type="button"
        id="${idPrefix}-dark-btn"
        class="theme-toggle-option ${activeTheme === 'dark' ? 'theme-toggle-option-active' : ''}"
        role="radio"
        aria-checked="${activeTheme === 'dark'}"
        data-theme-option="dark"
      >${icon('moon')}<span>Dark</span></button>
    </div>
  `;
}

export function renderSidebarNav({ email, activeView, isAdmin, activeTheme, collapsed }) {
  const initial = (email || '?').trim().charAt(0).toUpperCase();
  const isRequestsActive = activeView === 'myRequests' || activeView === 'pendingRequests';
  const isSupportActive = activeView === 'contact' || activeView === 'myTickets' || activeView === 'ticketDetail';

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-head">
        <div class="sidebar-brand">
          <span class="sidebar-logo">${icon('logo')}</span>
          <span class="sidebar-wordmark">Family Chart</span>
        </div>
        <button type="button" id="sidebar-close-btn" class="icon-btn sidebar-close" aria-label="Close navigation">${icon('close')}</button>
      </div>
      <nav class="sidebar-nav" aria-label="Primary">
        <button type="button" class="nav-item ${activeView === 'trees' ? 'nav-item-active' : ''}" id="nav-trees-btn" title="My Trees">
          ${icon('trees')}<span class="nav-label">My Trees</span>
        </button>
        <button type="button" class="nav-item ${activeView === 'security' ? 'nav-item-active' : ''}" id="nav-security-btn" title="Security Settings">
          ${icon('shield')}<span class="nav-label">Security Settings</span>
        </button>
        <button type="button" class="nav-item ${isRequestsActive ? 'nav-item-active' : ''}" id="nav-requests-btn" title="Requests">
          ${icon('list')}<span class="nav-label">Requests</span>
        </button>
        <button type="button" class="nav-item ${isSupportActive ? 'nav-item-active' : ''}" id="nav-support-btn" title="Support">
          ${icon('mail')}<span class="nav-label">Support</span>
        </button>
        ${
          isAdmin
            ? `<button type="button" class="nav-item ${activeView === 'admin' ? 'nav-item-active' : ''}" id="nav-admin-btn" title="Admin">
                ${icon('settings')}<span class="nav-label">Admin</span>
              </button>`
            : ''
        }
      </nav>
      <button
        type="button"
        id="sidebar-collapse-btn"
        class="sidebar-collapse-btn"
        title="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}"
        aria-pressed="${Boolean(collapsed)}"
        aria-label="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}"
      >${icon('chevronRight')}</button>
      <div class="sidebar-foot">
        <div class="sidebar-profile">
          <button
            type="button"
            id="sidebar-profile-btn"
            class="sidebar-profile-trigger"
            data-menu-trigger="sidebar-profile-menu"
            title="${escapeHtml(email)}"
            aria-haspopup="true"
          >
            <span class="user-avatar">${escapeHtml(initial)}</span>
            <span class="user-email">${escapeHtml(email)}</span>
            ${icon('chevronDown')}
          </button>
          <div class="dropdown-menu sidebar-profile-menu" id="sidebar-profile-menu" data-menu-id="sidebar-profile-menu">
            <div class="sidebar-profile-menu-theme">
              ${renderThemeToggle({ activeTheme, idPrefix: 'sidebar-theme-toggle' })}
            </div>
            <button type="button" id="logout-btn" class="dropdown-item dropdown-item-danger" title="Logout">
              ${icon('logout')}<span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
  `;
}

export function renderMobileTopbar() {
  return `
    <div class="mobile-topbar">
      <button type="button" id="sidebar-open-btn" class="icon-btn" aria-label="Open navigation">${icon('menu')}</button>
      <span class="mobile-topbar-title">${icon('logo')} Family Chart</span>
    </div>
  `;
}

export function renderPageHeader({
  title,
  subtitle,
  primaryActionId,
  primaryActionLabel,
  secondaryActionId,
  secondaryActionLabel,
  importMenu,
  templateMenu,
}) {
  return `
    <header class="page-header">
      <div>
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="page-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <div class="page-header-actions">
        ${
          templateMenu
            ? `<div class="tree-card-menu-wrap">
                 <button type="button" id="${templateMenu.triggerId}" class="btn btn-secondary menu-trigger" data-menu-trigger="${templateMenu.id}">${icon('download')}<span>${escapeHtml(templateMenu.label)}</span></button>
                 ${dropdownMenu({ id: templateMenu.id, items: templateMenu.items })}
               </div>`
            : ''
        }
        ${
          importMenu
            ? `<div class="tree-card-menu-wrap">
                 <button type="button" id="${importMenu.triggerId}" class="btn btn-secondary menu-trigger" data-menu-trigger="${importMenu.id}">${icon('upload')}<span>${escapeHtml(importMenu.label)}</span></button>
                 ${dropdownMenu({ id: importMenu.id, items: importMenu.items })}
               </div>`
            : secondaryActionId
              ? `<button type="button" id="${secondaryActionId}" class="btn btn-secondary">${icon('upload')}<span>${escapeHtml(secondaryActionLabel)}</span></button>`
              : ''
        }
        ${
          primaryActionId
            ? `<button type="button" id="${primaryActionId}" class="btn btn-primary">${icon('plus')}<span>${escapeHtml(primaryActionLabel)}</span></button>`
            : ''
        }
      </div>
    </header>
  `;
}

// Underline tab row switching between sibling views inside one sidebar nav
// item's section (e.g. Requests -> My Requests / Pending Requests). Each tab
// is `{ id, label, icon }`; `activeId` picks the pressed one. Sits above the
// section's own page header/content, which is left untouched.
export function renderSectionTabs({ tabs, activeId, idPrefix = 'section-tab' }) {
  return `
    <div class="section-tabs" role="tablist">
      ${tabs
        .map(
          (tab) => `
        <button
          type="button"
          class="section-tab"
          role="tab"
          id="${idPrefix}-${tab.id}"
          data-tab-id="${tab.id}"
          aria-selected="${tab.id === activeId}"
          tabindex="${tab.id === activeId ? '0' : '-1'}"
        >${tab.icon ? icon(tab.icon) : ''}<span>${escapeHtml(tab.label)}</span></button>
      `
        )
        .join('')}
    </div>
  `;
}

export function renderCreateTreeCard() {
  return `
    <div class="toolbar-cards toolbar-cards-single">
      <section class="action-card">
        <div class="action-card-icon">${icon('folderPlus')}</div>
        <div class="action-card-body">
          <h2 class="action-card-title">Create a tree</h2>
          <p class="action-card-desc">Start a brand new family tree from scratch.</p>
          <form id="create-tree-form" class="action-card-form">
            <input id="create-tree-name-input" name="name" placeholder="e.g. Smith Family Tree" maxlength="120" required />
            <button type="submit" class="btn btn-primary">Create</button>
          </form>
        </div>
      </section>
    </div>
  `;
}

// Empty-state layout (zero trees on the account): the global "find your
// family" search is embedded directly inside the empty container instead of
// living in its own card above it, since there's no tree grid yet to
// separate it from. A "skip search and create" link is the only way to
// reach tree creation here - the redundant "+ Create Tree" button was
// removed since the page header's "+ New Tree" already covers that action.
export function renderTreesEmptyStateMarkup({ query, loading, searched, results }) {
  const body = loading
    ? `<p class="muted join-search-status">Searching...</p>`
    : !searched
      ? ''
      : results.length === 0
        ? `<p class="muted join-search-status">No matching trees found.</p>`
        : `<div class="join-search-results">${results.map(renderJoinResultCard).join('')}</div>`;

  return `
    <div class="empty-state empty-state-with-search">
      <div class="empty-state-icon">${icon('search')}</div>
      <h2 class="empty-state-title">Find your family first</h2>
      <p class="empty-state-desc">Search by tree name or a family member's first or last name to see if your family is already on Family Chart.</p>
      <form id="join-search-form" class="empty-state-search-form">
        <label class="search-box discover-search-box">
          ${icon('search')}
          <input id="join-search-input" type="search" name="query" placeholder="e.g. Smith or Smith Family Tree" maxlength="120" value="${escapeHtml(query)}" />
        </label>
        <button type="submit" class="btn btn-primary">Search</button>
      </form>
      ${body}
      <p class="empty-state-skip"><button type="button" id="skip-search-create-btn" class="link-btn">Or, skip search and create a new tree.</button></p>
    </div>
  `;
}

// Discover-search shown once the account already has trees. Collapsed by
// default to a plain text link (so it doesn't visually compete with the
// primary "Search trees by name..." box in the toolbar row); clicking it
// swaps in the actual search form, still styled with the accent color
// (discover-search-box) so it reads as "search everyone's trees" rather
// than "filter my trees".
export function renderCompactJoinSearch({ query, expanded }) {
  if (!expanded) {
    return `<button type="button" id="join-search-reveal-btn" class="link-btn discover-search-link">${icon('search')}<span>Discover other family branches</span></button>`;
  }

  return `
    <form id="join-search-form" class="discover-search-form">
      <label class="search-box discover-search-box" title="Search the entire database for other family trees, not just yours">
        ${icon('search')}
        <input id="join-search-input" type="search" name="query" placeholder="Discover other family branches..." maxlength="120" value="${escapeHtml(query)}" />
      </label>
    </form>
  `;
}

// Results panel for the compact active-state search - rendered into its own
// container below the toolbar row so it doesn't shove the tree grid down
// while empty, and is hidden entirely until a search has actually run.
export function renderCompactJoinSearchResults({ loading, searched, results }) {
  if (!loading && !searched) return '';

  const body = loading
    ? `<p class="muted join-search-status">Searching...</p>`
    : results.length === 0
      ? `<p class="muted join-search-status">No matching trees found.</p>`
      : `<div class="join-search-results">${results.map(renderJoinResultCard).join('')}</div>`;

  return `<div class="discover-search-results-panel">${body}</div>`;
}

// "Trees you may belong to" section on the tree-list landing page - distinct
// from renderCompactJoinSearchResults (results of an explicit name/tree
// search): these are matches surfaced automatically because a person-node's
// email matches the logged-in user's own email. Dismissible; see
// loadDiscoveryMatches/handleDismissDiscovery in main.js for the dismissal
// logic. Every entry here is always membershipStatus 'none' by construction
// (the backend already excludes members/pending requests), so its cards
// always show a plain "Request to Join" button, unlike renderJoinResultCard.
export function renderDiscoverySectionMarkup({ trees }) {
  if (!trees.length) return '';
  return `
    <section class="discovery-section" id="discovery-section">
      <div class="discovery-section-header">
        <h3 class="discovery-section-title">${icon('user')} Trees you may belong to</h3>
        <button type="button" class="icon-btn" id="discovery-dismiss-btn" aria-label="Dismiss">${icon('close')}</button>
      </div>
      <p class="discovery-section-desc">We found your email address in these family trees. Request to join if one of them is yours.</p>
      <div class="discovery-result-list">
        ${trees.map(renderDiscoveryResultCard).join('')}
      </div>
    </section>
  `;
}

function renderDiscoveryResultCard(tree) {
  return `
    <div class="join-result-card" data-tree-id="${tree.id}">
      <div class="join-result-info">
        <p class="join-result-title">${escapeHtml(tree.name)}</p>
        <p class="join-result-meta">Owned by ${escapeHtml(tree.ownerEmail)}</p>
      </div>
      <div class="join-result-actions">
        <button type="button" class="btn btn-primary btn-sm discovery-join-request-btn" data-tree-id="${tree.id}">Request to Join</button>
      </div>
    </div>
  `;
}

function renderJoinResultCard(tree) {
  const action =
    tree.membershipStatus === 'member'
      ? `<button type="button" class="btn btn-secondary btn-sm" disabled>Already a Member</button>`
      : tree.membershipStatus === 'pending'
        ? `<button type="button" class="btn btn-secondary btn-sm" disabled>Request Pending</button>`
        : `<button type="button" class="btn btn-primary btn-sm join-request-btn" data-tree-id="${tree.id}">Request to Join</button>`;

  return `
    <div class="join-result-card" data-tree-id="${tree.id}">
      <div class="join-result-info">
        <p class="join-result-title">${escapeHtml(tree.name)}</p>
        <p class="join-result-meta">Owned by ${escapeHtml(tree.ownerEmail)}</p>
      </div>
      <div class="join-result-actions">
        ${action}
      </div>
    </div>
  `;
}

export function renderJoinRoleModalBody({ treeName }) {
  return `
    ${modalCloseButton('join-role-modal-close-btn')}
    <h3 id="modal-title">Request to Join "${escapeHtml(treeName)}"</h3>
    <form id="join-role-form" class="stack">
      <label>Do you want to request Viewer or Editor access?
        <select name="role" id="join-role-select">
          <option value="viewer" selected>Viewer</option>
          <option value="editor">Editor</option>
        </select>
      </label>
      <label>Message <span class="label-optional">(optional)</span>
        <textarea name="message" id="join-role-message-input" rows="3" maxlength="500" placeholder="Let the owner know who you are, e.g. &quot;I'm your cousin on the Smith side.&quot;"></textarea>
      </label>
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="join-role-modal-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Send Request</button>
      </div>
    </form>
  `;
}

// Modal for an existing member asking the owner to change their role. Only
// offers the role(s) they don't already have - a viewer only sees "Editor",
// so the form can't be submitted requesting the role they already hold.
export function renderRoleChangeModalBody({ treeName, currentRole }) {
  const otherRole = currentRole === 'editor' ? 'viewer' : 'editor';
  const otherRoleLabel = ROLE_LABELS[otherRole] || otherRole;

  return `
    ${modalCloseButton('role-change-modal-close-btn')}
    <h3 id="modal-title">Request Different Access to "${escapeHtml(treeName)}"</h3>
    <p class="modal-message">You are currently a <strong>${escapeHtml(ROLE_LABELS[currentRole] || currentRole)}</strong> on this tree.</p>
    <form id="role-change-form" class="stack">
      <label>Requested role
        <select name="role" id="role-change-select">
          <option value="${otherRole}" selected>${escapeHtml(otherRoleLabel)}</option>
        </select>
      </label>
      <label>Message <span class="label-optional">(optional)</span>
        <textarea name="message" id="role-change-message-input" rows="3" maxlength="500" placeholder="Let the owner know why you'd like this changed."></textarea>
      </label>
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="role-change-modal-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Send Request</button>
      </div>
    </form>
  `;
}

// "Pending Requests" dashboard view: incoming join requests across every
// tree the current user owns, with inline Approve/Reject actions.
export function renderPendingRequestsPageMarkup({ loading, requests }) {
  const body = loading
    ? `<p class="muted">Loading requests...</p>`
    : requests.length === 0
      ? `
        <div class="empty-state">
          <div class="empty-state-icon">${icon('mail')}</div>
          <h2 class="empty-state-title">No Pending Requests</h2>
          <p class="empty-state-desc">When someone asks to join one of your family trees, it'll show up here.</p>
        </div>`
      : `<div class="pending-request-list">${requests.map(renderPendingRequestRow).join('')}</div>`;

  return `
    ${renderPageHeader({ title: 'Pending Requests', subtitle: 'Review requests to join your family trees.' })}
    ${body}
  `;
}

function renderPendingRequestRow(request) {
  const messageBlock = request.message
    ? `<p class="pending-request-message">&ldquo;${escapeHtml(request.message)}&rdquo;</p>`
    : '';
  const actionText =
    request.request_type === 'role_change'
      ? `<span class="muted">wants to change their role on</span> ${escapeHtml(request.tree_name)} <span class="muted">to</span>`
      : `<span class="muted">wants to join</span> ${escapeHtml(request.tree_name)} <span class="muted">as</span>`;

  return `
    <div class="pending-request-row" data-request-id="${request.id}">
      <div class="pending-request-info">
        <p class="pending-request-title">${escapeHtml(request.sender_email)} ${actionText}</p>
        <p class="pending-request-meta">
          <span class="badge badge-role-${request.role_requested}">${escapeHtml(request.role_requested)}</span>
          <span class="muted">${escapeHtml(formatRelativeTime(request.created_at))}</span>
        </p>
        ${messageBlock}
      </div>
      <div class="pending-request-actions">
        <button type="button" class="btn btn-secondary btn-sm pending-request-reject-btn" data-request-id="${request.id}">Reject</button>
        <button type="button" class="btn btn-primary btn-sm pending-request-approve-btn" data-request-id="${request.id}">Approve</button>
      </div>
    </div>
  `;
}

const SENT_REQUEST_STATUS_LABELS = {
  pending: { label: 'Pending', className: 'badge-role-viewer' },
  approved: { label: 'Approved', className: 'badge-role-owner' },
  rejected: { label: 'Rejected', className: 'badge-role-editor' },
};

// "My Requests" dashboard view: every join request the current user has
// sent (any status), so a rejection isn't a silent dead end - the requester
// can see it happened instead of just re-finding "Request to Join" in search.
export function renderMyRequestsPageMarkup({ loading, requests }) {
  const body = loading
    ? `<p class="muted">Loading your requests...</p>`
    : requests.length === 0
      ? `
        <div class="empty-state">
          <div class="empty-state-icon">${icon('mail')}</div>
          <h2 class="empty-state-title">No Requests Sent</h2>
          <p class="empty-state-desc">Search for a family tree from the homepage to request access.</p>
        </div>`
      : `<div class="pending-request-list">${requests.map(renderSentRequestRow).join('')}</div>`;

  return `
    ${renderPageHeader({ title: 'My Requests', subtitle: 'Track the status of trees you have asked to join.' })}
    ${body}
  `;
}

function renderSentRequestRow(request) {
  const status = SENT_REQUEST_STATUS_LABELS[request.status] || SENT_REQUEST_STATUS_LABELS.pending;
  const messageBlock = request.message
    ? `<p class="pending-request-message">&ldquo;${escapeHtml(request.message)}&rdquo;</p>`
    : '';
  const titlePrefix = request.request_type === 'role_change' ? 'Role change on' : '';

  return `
    <div class="pending-request-row" data-request-id="${request.id}">
      <div class="pending-request-info">
        <p class="pending-request-title">${titlePrefix ? `<span class="muted">${titlePrefix}</span> ` : ''}${escapeHtml(request.tree_name)} <span class="muted">owned by</span> ${escapeHtml(request.owner_email)}</p>
        <p class="pending-request-meta">
          <span class="badge badge-role-${request.role_requested}">${escapeHtml(request.role_requested)}</span>
          <span class="badge ${status.className}">${escapeHtml(status.label)}</span>
          <span class="muted">${escapeHtml(formatRelativeTime(request.updated_at))}</span>
        </p>
        ${messageBlock}
      </div>
    </div>
  `;
}

// discoverSearchHtml is an optional slot (renderCompactJoinSearch's markup)
// placed between the personal filter and the sort dropdown, so both search
// boxes sit in the same sub-header row - visually side by side, but styled
// distinctly (see .discover-search-box) so it's clear one filters your own
// trees and the other searches the whole database.
export function renderTreesToolbarRow({ search, sort, discoverSearchHtml = '' }) {
  return `
    <div class="trees-toolbar-row">
      <label class="search-box">
        ${icon('search')}
        <input type="search" id="tree-search-input" placeholder="Search trees by name..." value="${escapeHtml(search)}" />
      </label>
      ${discoverSearchHtml}
      <label class="sort-box">
        <span class="sort-box-label">Sort by</span>
        <select id="tree-sort-select">
          <option value="updated" ${sort === 'updated' ? 'selected' : ''}>Recently Updated</option>
          <option value="alpha" ${sort === 'alpha' ? 'selected' : ''}>Alphabetical</option>
          <option value="created" ${sort === 'created' ? 'selected' : ''}>Creation Date</option>
        </select>
      </label>
    </div>
  `;
}

function dropdownMenu({ id, items }) {
  return `
    <div class="dropdown-menu" data-menu-id="${id}">
      ${items
        .map(
          (item) => `
        <button type="button" class="dropdown-item ${item.danger ? 'dropdown-item-danger' : ''}" data-action="${item.action}">
          ${icon(item.icon)}<span>${escapeHtml(item.label)}</span>
        </button>`
        )
        .join('')}
    </div>
  `;
}

export function renderTreeCard(tree, { renaming } = {}) {
  const menuId = `tree-${tree.id}`;
  const items = [
    { action: 'export-json', label: 'Export JSON', icon: 'download' },
    { action: 'export-csv', label: 'Export CSV', icon: 'download' },
    { action: 'export-gedcom', label: 'Export GEDCOM', icon: 'download' },
  ];
  if (tree.role === 'owner') {
    items.unshift({ action: 'tree-settings', label: 'Tree Settings', icon: 'settings' });
    items.unshift({ action: 'rename', label: 'Rename', icon: 'pencil' });
    items.push({ action: 'delete', label: 'Delete', icon: 'trash', danger: true });
  }

  const titleBlock = renaming
    ? `
      <form class="tree-rename-form" data-tree-id="${tree.id}">
        <input type="text" name="name" value="${escapeHtml(tree.name)}" maxlength="120" required autofocus />
        <div class="tree-rename-actions">
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
          <button type="button" class="btn btn-ghost btn-sm rename-cancel-btn" data-tree-id="${tree.id}">Cancel</button>
        </div>
      </form>`
    : `<h3 class="tree-card-title" data-tree-id="${tree.id}">${escapeHtml(tree.name)}</h3>`;

  const memberLabel = `${tree.member_count} member${tree.member_count === 1 ? '' : 's'}`;
  const updatedLabel = formatRelativeTime(tree.updated_at);

  return `
    <article class="tree-card tree-card-clickable" data-tree-id="${tree.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(tree.name)}">
      <div class="tree-card-top">
        <div class="tree-card-icon">${icon('trees')}</div>
        <div class="tree-card-menu-wrap">
          <button type="button" class="icon-btn menu-trigger" data-menu-trigger="${menuId}" aria-label="Tree actions">${icon('kebab')}</button>
          ${dropdownMenu({ id: menuId, items })}
        </div>
      </div>
      <div class="tree-card-body">
        ${titleBlock}
        <p class="tree-card-meta">${escapeHtml(memberLabel)}</p>
        <p class="tree-card-meta tree-card-meta-muted">${escapeHtml(updatedLabel)}</p>
      </div>
      <div class="tree-card-foot">
        <span class="badge badge-role-${tree.role}">${ROLE_LABELS[tree.role] || tree.role}</span>
        <button type="button" class="btn btn-secondary btn-sm tree-open-btn" data-tree-id="${tree.id}">Open</button>
      </div>
    </article>
  `;
}

// Only used when the account has trees but the personal name filter matches
// none of them - the true "zero trees on the account" case is handled by
// renderTreesEmptyStateMarkup instead, which embeds the discover-search UI.
export function renderEmptyState({ mode: _mode }) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon('search')}</div>
      <h2 class="empty-state-title">No trees match your search</h2>
      <p class="empty-state-desc">Try a different name, or clear your search to see all trees.</p>
      <div class="empty-state-actions">
        <button type="button" id="empty-clear-search-btn" class="btn btn-secondary">Clear search</button>
      </div>
    </div>
  `;
}

export function renderSkeletonGrid(count = 6) {
  return `
    <div class="tree-grid-inner" aria-hidden="true">
      ${Array.from({ length: count })
        .map(
          () => `
        <div class="tree-card skeleton-card">
          <div class="skeleton-line skeleton-icon"></div>
          <div class="skeleton-line skeleton-title"></div>
          <div class="skeleton-line skeleton-text"></div>
          <div class="skeleton-line skeleton-text short"></div>
        </div>`
        )
        .join('')}
    </div>
  `;
}

export function renderTreeViewerHeader({ treeName, role }) {
  const canEdit = role === 'owner' || role === 'editor';
  const isOwner = role === 'owner';

  const settingsItems = [];
  if (canEdit) {
    settingsItems.push({ action: 'download-csv-template-blank', label: 'Download Blank CSV Template', icon: 'download' });
    settingsItems.push({ action: 'download-csv-template-sample', label: 'Download Sample CSV Template', icon: 'download' });
    settingsItems.push({ action: 'rename', label: 'Rename Tree', icon: 'pencil' });
  }
  if (isOwner) {
    settingsItems.push({ action: 'delete', label: 'Delete Tree', icon: 'trash', danger: true });
  }

  return `
    <header class="viewer-header">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <button type="button" id="breadcrumb-trees-btn" class="breadcrumb-link">My Trees</button>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current">${escapeHtml(treeName)}</span>
      </nav>
      <div class="viewer-title-row">
        <div class="viewer-title-group">
          <h1 class="viewer-title">${escapeHtml(treeName)}</h1>
          ${
            canEdit
              ? `<button type="button" id="rename-tree-inline-btn" class="icon-btn viewer-title-edit-btn" aria-label="Edit tree name" title="Edit tree name">${icon('pencil')}</button>`
              : ''
          }
          ${
            !isOwner
              ? `<span class="badge badge-role-${role} badge-with-tooltip" tabindex="0">
                   ${ROLE_LABELS[role] || role}
                   <span class="badge-tooltip" role="tooltip">
                     Want different access? <button type="button" id="request-role-change-btn" class="badge-tooltip-link">Request a change</button>
                   </span>
                 </span>`
              : `<span class="badge badge-role-${role}">${ROLE_LABELS[role] || role}</span>`
          }
        </div>
        <div class="viewer-title-actions">
          ${renderMemberSearch()}
          <button type="button" id="save-btn" class="btn btn-primary" ${canEdit ? '' : 'disabled'}>${icon('save')}<span>Save</span></button>
          ${
            canEdit
              ? `<input type="file" id="import-tree-json-input" accept=".json,application/json" hidden />
                 <div class="tree-card-menu-wrap">
                   <button type="button" id="import-tree-btn" class="btn btn-secondary menu-trigger" data-menu-trigger="import-options">${icon('upload')}<span>Import</span></button>
                   ${dropdownMenu({
                     id: 'import-options',
                     items: [
                       { action: 'import-csv', label: 'Import CSV', icon: 'upload' },
                       { action: 'import-json', label: 'Import JSON', icon: 'upload' },
                       { action: 'import-gedcom', label: 'Import GEDCOM', icon: 'upload' },
                     ],
                   })}
                 </div>`
              : ''
          }
          <div class="tree-card-menu-wrap">
            <button type="button" id="export-tree-btn" class="btn btn-secondary menu-trigger" data-menu-trigger="export-options">${icon('download')}<span>Export</span></button>
            ${dropdownMenu({
              id: 'export-options',
              items: [
                { action: 'export-image', label: 'Export as Image / PDF', icon: 'image' },
                { action: 'export-json', label: 'Export JSON', icon: 'download' },
                { action: 'export-csv', label: 'Export CSV', icon: 'download' },
                { action: 'export-gedcom', label: 'Export GEDCOM', icon: 'download' },
              ],
            })}
          </div>
          ${isOwner ? `<button type="button" id="share-tree-btn" class="btn btn-secondary">${icon('share')}<span>Share</span></button>` : ''}
          ${
            settingsItems.length
              ? `<div class="tree-card-menu-wrap">
                  <button type="button" class="icon-btn menu-trigger" data-menu-trigger="viewer-settings" aria-label="Tree settings">${icon('settings')}</button>
                  ${dropdownMenu({ id: 'viewer-settings', items: settingsItems })}
                </div>`
              : ''
          }
        </div>
      </div>
    </header>
  `;
}

export function renderViewModeToggle({ viewMode, canEdit, isOwner }) {
  return `
    <div class="view-mode-toggle">
      <div class="view-mode-toggle-group">
        <button type="button" id="focused-mode-btn" class="chip ${viewMode === 'focused' ? 'chip-active' : ''}" ${viewMode === 'focused' ? 'disabled' : ''}>Focused</button>
        <button type="button" id="all-nodes-mode-btn" class="chip ${viewMode === 'all-nodes' ? 'chip-active' : ''}" ${viewMode === 'all-nodes' ? 'disabled' : ''}>All Nodes</button>
        <button type="button" id="relationship-manager-mode-btn" class="chip ${viewMode === 'relationship-manager' ? 'chip-active' : ''}" ${viewMode === 'relationship-manager' ? 'disabled' : ''}>Relationships</button>
        <button type="button" id="duplicate-manager-mode-btn" class="chip ${viewMode === 'duplicate-manager' ? 'chip-active' : ''}" ${viewMode === 'duplicate-manager' ? 'disabled' : ''}>Duplicates</button>
        ${
          isOwner
            ? `<button type="button" id="tree-settings-mode-btn" class="chip ${viewMode === 'settings' ? 'chip-active' : ''}" ${viewMode === 'settings' ? 'disabled' : ''}>Settings</button>`
            : ''
        }
      </div>
      <div class="view-mode-toggle-divider" aria-hidden="true"></div>
      <div class="view-mode-toggle-group">
        ${renderMediaLibraryButton()}
        ${renderTimelineButton()}
      </div>
    </div>
  `;
}

export function renderCanvasFloatingControls() {
  return `
    <div class="canvas-floating-controls" id="canvas-floating-controls">
      <button type="button" id="reset-view-btn" class="icon-btn canvas-floating-btn" title="Reset to the tree's default view" aria-label="Reset view">
        ${icon('home')}
      </button>
      <span class="canvas-floating-sep" aria-hidden="true"></span>
      <button type="button" id="focus-mode-btn" class="icon-btn canvas-floating-btn" title="Maximize (F)" aria-label="Maximize family tree" aria-pressed="false">
        ${icon('maximize')}
      </button>
    </div>
  `;
}

function renderMediaLibraryButton() {
  return `
    <button type="button" id="media-library-btn" class="chip" title="Photos, videos, and documents for this tree">
      ${icon('image')}<span>Media Library</span>
    </button>
  `;
}

function renderTimelineButton() {
  return `
    <button type="button" id="timeline-btn" class="chip" title="Events for this tree">
      ${icon('clock')}<span>Timeline</span>
    </button>
  `;
}

export function renderMemberSearch() {
  return `
    <div class="member-search" id="member-search">
      <label class="search-box member-search-box">
        ${icon('search')}
        <input
          type="text"
          id="member-search-input"
          placeholder="Search members..."
          autocomplete="off"
          aria-label="Search members"
          aria-expanded="false"
          aria-controls="member-search-results"
          role="combobox"
        />
        <button type="button" id="member-search-clear-btn" class="member-search-clear" aria-label="Clear search" hidden>${icon('close')}</button>
      </label>
      <div class="member-search-results" id="member-search-results" role="listbox" hidden></div>
    </div>
  `;
}

const MEMBER_ROLE_LABELS = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

function modalCloseButton(id = 'share-modal-close-btn') {
  return `<button type="button" id="${id}" class="icon-btn modal-close" aria-label="Close">${icon('close')}</button>`;
}

export function renderRenameModalBody({ name }) {
  return `
    ${modalCloseButton('rename-modal-close-btn')}
    <h3 id="modal-title">Rename Tree</h3>
    <form id="rename-tree-form" class="stack">
      <label>Tree name
        <input type="text" name="name" value="${escapeHtml(name)}" maxlength="120" required autofocus />
      </label>
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="rename-modal-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `;
}

export function renderShareModalBody({ treeName, permissions, loading, error, formError }) {
  if (loading) {
    return `
      ${modalCloseButton()}
      <h3 id="modal-title">Share "${escapeHtml(treeName)}"</h3>
      <p class="modal-message">Loading collaborators...</p>
    `;
  }

  const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : '';
  const formErrorHtml = formError ? `<p class="error">${escapeHtml(formError)}</p>` : '';

  const rows = permissions
    .map((permission) => {
      const isOwnerRow = permission.role === 'owner';
      const actions = isOwnerRow
        ? ''
        : `
          <select class="member-role-select" data-user-id="${permission.user_id}" aria-label="Role for ${escapeHtml(permission.email)}">
            <option value="editor" ${permission.role === 'editor' ? 'selected' : ''}>Editor</option>
            <option value="viewer" ${permission.role === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
          <button type="button" class="btn btn-ghost btn-sm" data-remove-user-id="${permission.user_id}">Remove</button>
        `;

      return `
        <div class="member-row">
          <div class="member-info">
            <span class="user-avatar user-avatar-sm">${escapeHtml((permission.email || '?').charAt(0).toUpperCase())}</span>
            <div>
              <p class="member-email">${escapeHtml(permission.email)}</p>
              <p class="member-meta">
                <span class="badge badge-role-${permission.role}">${MEMBER_ROLE_LABELS[permission.role] || permission.role}</span>
              </p>
            </div>
          </div>
          <div class="member-actions">${actions}</div>
        </div>
      `;
    })
    .join('');

  return `
    ${modalCloseButton()}
    <h3 id="modal-title">Share "${escapeHtml(treeName)}"</h3>
    <p class="modal-message">Invite someone by email and choose what they can do.</p>
    <form id="share-form" class="share-form">
      <input type="email" id="share-email-input" name="email" placeholder="name@example.com" required />
      <select id="share-role-select" name="role">
        <option value="editor">Editor</option>
        <option value="viewer" selected>Viewer</option>
      </select>
      <button type="submit" class="btn btn-primary">Share</button>
    </form>
    ${formErrorHtml}
    <div class="member-list">${rows || '<p class="muted">No collaborators yet.</p>'}</div>
    ${errorHtml}
  `;
}

// ---------------------------------------------------------------------------
// Contact Us page
// ---------------------------------------------------------------------------

export const SUPPORT_CATEGORIES = [
  'General Question',
  'Technical Support',
  'Bug Report',
  'Feature Request',
  'Account Issue',
  'Billing',
  'Other',
];

const CONTACT_FAQS = [
  {
    question: 'How do I recover my account?',
    answer: 'Use the Forgot Password option on the login page.',
  },
  {
    question: 'How do I share a family tree?',
    answer: 'Open a tree and click the Share button.',
  },
  {
    question: 'Can I export my data?',
    answer: 'Yes. Export options are available within each family tree.',
  },
];

export function renderContactPageMarkup({ email }) {
  return `
    <div class="contact-page">
      <section class="contact-hero">
        <div class="contact-hero-icon">${icon('mail')}</div>
        <h1 class="page-title">Contact Us</h1>
        <p class="contact-hero-subtitle">We're happy to answer your questions, receive your feedback, and help you get the most out of Family Chart.</p>
      </section>
      <div class="contact-grid" id="contact-grid">
        ${renderContactFormCard({ email })}
        ${renderContactInfoCard()}
      </div>
      ${renderContactFaq()}
    </div>
  `;
}

function renderContactFormCard({ email }) {
  const categoryOptions = SUPPORT_CATEGORIES.map(
    (category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
  ).join('');

  return `
    <section class="card contact-form-card">
      <h2 class="contact-card-title">Send us a message</h2>
      <p class="contact-form-replyto muted">Replies will be sent to <strong>${escapeHtml(email || 'your account email')}</strong>.</p>
      <form id="contact-form" class="contact-form" novalidate>
        <label>Subject
          <input type="text" name="subject" id="contact-subject-input" maxlength="120" placeholder="A short summary of your request" aria-required="true" />
          <span class="field-error" id="contact-subject-error" role="alert"></span>
        </label>
        <label>Category
          <select name="category" id="contact-category-input" aria-required="true">
            <option value="" disabled selected>Select a topic&hellip;</option>
            ${categoryOptions}
          </select>
          <span class="field-error" id="contact-category-error" role="alert"></span>
        </label>
        <label>Message
          <textarea name="message" id="contact-message-input" rows="6" maxlength="5000" aria-required="true" placeholder="Tell us what's on your mind (minimum 20 characters)&hellip;"></textarea>
          <span class="field-error" id="contact-message-error" role="alert"></span>
        </label>
        <label>Attachment <span class="label-optional">(optional &mdash; image, PDF, or text file, up to 10MB)</span>
          <div class="contact-file-row">
            <input type="file" name="file" id="contact-file-input" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,image/*,application/pdf,text/plain" hidden />
            <button type="button" id="contact-file-trigger-btn" class="btn btn-secondary btn-sm">${icon('upload')}<span>Choose file</span></button>
            <span class="contact-file-name" id="contact-file-name">No file selected</span>
            <button type="button" id="contact-file-remove-btn" class="icon-btn" aria-label="Remove attachment" hidden>${icon('close')}</button>
          </div>
          <span class="field-error" id="contact-file-error" role="alert"></span>
        </label>
        <div class="contact-honeypot" aria-hidden="true">
          <label>Company
            <input type="text" name="website" id="contact-website-input" tabindex="-1" autocomplete="off" />
          </label>
        </div>
        <p id="contact-form-error" class="error" role="alert"></p>
        <button type="submit" id="contact-submit-btn" class="btn btn-primary contact-submit-btn"><span>Send Message</span></button>
      </form>
    </section>
  `;
}

function renderContactInfoCard() {
  return `
    <aside class="card contact-info-card">
      <h2 class="contact-card-title">Other ways to reach us</h2>
      <ul class="contact-info-list">
        <li>
          <span class="contact-info-icon">${icon('mail')}</span>
          <div>
            <p class="contact-info-label">Support Email</p>
            <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" class="contact-info-value">${escapeHtml(SUPPORT_EMAIL)}</a>
          </div>
        </li>
        <li>
          <span class="contact-info-icon">${icon('clock')}</span>
          <div>
            <p class="contact-info-label">Response Time</p>
            <p class="contact-info-value">Typically within 24&ndash;48 hours</p>
          </div>
        </li>
        <li>
          <span class="contact-info-icon">${icon('github')}</span>
          <div>
            <p class="contact-info-label">GitHub Issues</p>
            <a href="https://github.com/abudulwadoodu/family-chart/issues" target="_blank" rel="noopener noreferrer" class="contact-info-value">Report an issue ${icon('external')}</a>
          </div>
        </li>
      </ul>
    </aside>
  `;
}

function renderContactFaq() {
  return `
    <section class="contact-faq">
      <h2 class="contact-faq-title">Frequently asked questions</h2>
      ${CONTACT_FAQS.map(
        (faq) => `
        <details class="faq-item">
          <summary>${escapeHtml(faq.question)}<span class="faq-chevron">${icon('chevronDown')}</span></summary>
          <p>${escapeHtml(faq.answer)}</p>
        </details>
      `
      ).join('')}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Application footer
// ---------------------------------------------------------------------------

// Legal/info pages routed via the `data-internal-link` SPA navigation handler
// in main.js. Add future pages (Help Center, About, Security, Cookie Policy,
// etc.) here so they appear in the footer everywhere automatically.
const FOOTER_LINKS = [
  { label: 'Terms & Conditions', path: '/terms' },
  { label: 'Privacy Policy', path: '/privacy' },
];

// `showLinks: false` is for auth screens (sign in/up, forgot/reset password):
// those already carry a contextual Terms/Privacy acknowledgement right in
// the card (see the auth-legal-disclaimer in renderAuthShell), so the footer
// there shows only the copyright line to avoid showing the same links twice.
export function renderFooter({ variant = 'default', showLinks = true } = {}) {
  const year = new Date().getFullYear();
  const nav = showLinks
    ? `
      <nav class="app-footer-links" aria-label="Legal and support">
        ${FOOTER_LINKS.map((link) => `<a href="${link.path}" data-internal-link="${link.path}" class="app-footer-link">${escapeHtml(link.label)}</a>`).join('')}
        <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" data-contact-link class="app-footer-link">Contact Us</a>
      </nav>
    `
    : '';

  return `
    <footer class="app-footer app-footer-${variant}">
      <div class="app-footer-inner">
        <span class="app-footer-copyright">&copy; ${year} Family Chart. All rights reserved.</span>
        ${nav}
      </div>
    </footer>
  `;
}
