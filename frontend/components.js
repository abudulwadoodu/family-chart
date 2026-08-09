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

export function renderSidebarNav({ activeView, isAdmin, collapsed }) {
  const isRequestsActive =
    activeView === 'myRequests' ||
    activeView === 'pendingRequests' ||
    activeView === 'myClaims' ||
    activeView === 'manageClaims';
  const isSupportActive = activeView === 'contact' || activeView === 'myTickets' || activeView === 'ticketDetail';

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-head">
        <div class="sidebar-brand">
          <span class="sidebar-logo">${icon('logo')}</span>
          <span class="sidebar-wordmark">Family Chart</span>
        </div>
        <button type="button" id="sidebar-close-btn" class="icon-btn sidebar-close" aria-label="Close navigation" data-tooltip="Close navigation" data-tooltip-pos="bottom">${icon('close')}</button>
      </div>
      <nav class="sidebar-nav" aria-label="Primary">
        <button type="button" class="nav-item ${activeView === 'trees' ? 'nav-item-active' : ''}" id="nav-trees-btn" data-tooltip="My Trees">
          ${icon('trees')}<span class="nav-label">My Trees</span>
        </button>
        <button type="button" class="nav-item ${activeView === 'security' ? 'nav-item-active' : ''}" id="nav-security-btn" data-tooltip="Security Settings">
          ${icon('shield')}<span class="nav-label">Security Settings</span>
        </button>
        <button type="button" class="nav-item ${isRequestsActive ? 'nav-item-active' : ''}" id="nav-requests-btn" data-tooltip="Requests">
          ${icon('list')}<span class="nav-label">Requests</span>
        </button>
        <button type="button" class="nav-item ${isSupportActive ? 'nav-item-active' : ''}" id="nav-support-btn" data-tooltip="Support">
          ${icon('mail')}<span class="nav-label">Support</span>
        </button>
        ${
          isAdmin
            ? `<button type="button" class="nav-item ${activeView === 'admin' ? 'nav-item-active' : ''}" id="nav-admin-btn" data-tooltip="Admin">
                ${icon('settings')}<span class="nav-label">Admin</span>
              </button>`
            : ''
        }
      </nav>
      <button
        type="button"
        id="sidebar-collapse-btn"
        class="sidebar-collapse-btn"
        data-tooltip="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}"
        data-tooltip-pos="right"
        aria-pressed="${Boolean(collapsed)}"
        aria-label="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}"
      >${icon('chevronRight')}</button>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
  `;
}

// The bell (family feed trigger, tree pages only) + avatar/email/theme
// toggle/logout popover, reusing the same dropdown-menu/data-menu-trigger
// mechanism as every other menu in the app. Factored out so renderTopbar can
// pass `hasTree: true` on the tree-detail pages without duplicating the
// profile-menu markup.
export function renderHeaderUserCluster({ email, activeTheme, hasTree }) {
  const initial = (email || '?').trim().charAt(0).toUpperCase();
  return `
    ${
      hasTree
        ? `<button type="button" id="feed-notification-btn" class="icon-btn" aria-label="Family feed" data-tooltip="Family feed" data-tooltip-pos="bottom">${icon('bell')}</button>
           <span class="header-divider" aria-hidden="true"></span>`
        : ''
    }
    <div class="profile-menu-wrap">
      <button
        type="button"
        id="profile-menu-btn"
        class="profile-trigger"
        data-menu-trigger="profile-menu"
        data-tooltip="${escapeHtml(email)}"
        data-tooltip-pos="bottom"
        aria-haspopup="true"
      >
        <span class="user-avatar">${escapeHtml(initial)}</span>
        ${icon('chevronDown')}
      </button>
      <div class="dropdown-menu profile-menu" id="profile-menu" data-menu-id="profile-menu">
        <div class="profile-menu-header">
          <span class="user-avatar user-avatar-lg">${escapeHtml(initial)}</span>
          <span class="profile-menu-email" title="${escapeHtml(email)}">${escapeHtml(email)}</span>
        </div>
        <div class="dropdown-divider"></div>
        <div class="profile-menu-theme">
          ${renderThemeToggle({ activeTheme, idPrefix: 'topbar-theme-toggle' })}
        </div>
        <div class="dropdown-divider"></div>
        <button type="button" id="logout-btn" class="dropdown-item dropdown-item-danger" title="Logout">
          ${icon('logout')}<span>Logout</span>
        </button>
      </div>
    </div>
  `;
}

// Global top bar - page title (or, for the My Trees/Requests/Support
// sections, that section's tab switcher - see tabsHtml below) on the left,
// user cluster on the right. Rendered once inside .main-area (above
// .content), so it's present above every page, including every tree-scoped
// page (Tree Canvas/Media Library/Timeline/every Tree View mode - Focused/All
// Nodes/Relationship Finder/Relationships/Duplicates/Settings) - passing
// `treeName` swaps the left slot to that tree's breadcrumb (always just "My
// Trees / <tree name>" - see renderTreeBreadcrumb's default `activeTab: null`)
// + a member-count/last-updated info popover instead of a plain title, and
// `hasTree` adds the family-feed notification bell next to the profile
// avatar, so this one persistent bar now covers what those pages used to
// render as their own separate first row (renderTreeDetailHeaderTop, since
// removed - see main.js's renderDashboard). `leftLabel` is that page's title -
// main.js's renderDashboard computes it per-view (Security Settings, Create a
// Tree, etc.), falling back to the selected tree's name only for Timeline's
// event-detail drill-in, which keeps its own breadcrumb below this bar
// instead (see renderTreeBreadcrumb's `activeTab`/`detailLabel`, used
// directly there rather than through this component).
// `tabsHtml` (see renderTopbarTabs) takes over the same left slot instead of
// leftLabel for the three sections with sibling views (My Trees/Private
// Vault, Requests, Support) - one wouldn't make sense next to the other,
// since the active tab's label already says which page this is.
export function renderTopbar({
  email,
  activeTheme,
  leftLabel,
  tabsHtml = '',
  treeName = null,
  memberCount = null,
  updatedAt = null,
  hasTree = false,
}) {
  let leftHtml;
  if (treeName) {
    const infoParts = [];
    if (typeof memberCount === 'number') infoParts.push(`${memberCount} member${memberCount === 1 ? '' : 's'}`);
    if (updatedAt) infoParts.push(formatRelativeTime(updatedAt));
    const infoHtml = infoParts.length
      ? `<button type="button" class="header-info-trigger" data-tooltip="${escapeHtml(infoParts.join(' • '))}" data-tooltip-pos="bottom" aria-label="Tree info">${icon('info')}</button>`
      : '';
    leftHtml = `
      <div class="app-topbar-tree-title">
        ${renderTreeBreadcrumb({ treeName })}
        ${infoHtml}
      </div>
    `;
  } else {
    leftHtml = tabsHtml || (leftLabel ? `<span class="app-topbar-title">${escapeHtml(leftLabel)}</span>` : '');
  }

  return `
    <header class="app-topbar">
      ${leftHtml}
      <div class="app-topbar-spacer"></div>
      ${renderHeaderUserCluster({ email, activeTheme, hasTree })}
    </header>
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

// `title` is optional and left unset by every current caller (Security
// Settings, Pending/My Requests) - their page title now lives in the
// persistent renderTopbar instead (see main.js's renderDashboard
// topbarTitle), so this just renders the descriptive subtitle line with the
// same spacing the title+subtitle pairing used to have.
export function renderPageHeader({ title, subtitle }) {
  return `
    <header class="page-header">
      <div>
        ${title ? `<h1 class="page-title">${escapeHtml(title)}</h1>` : ''}
        <p class="page-subtitle">${escapeHtml(subtitle)}</p>
      </div>
    </header>
  `;
}

// Segmented-pill tab switcher between sibling views inside one sidebar nav
// item's section (e.g. Requests -> My Requests / Pending Requests). Each tab
// is `{ id, label, icon, tooltip? }` - `tooltip` is optional and carries any
// longer description of the tab (e.g. the "My Trees" tab's tagline, which
// used to live on the sidebar nav item's own tooltip - see nav-trees-btn in
// renderSidebarNav - before it moved here to leave that tooltip as just the
// short "My Trees" label). `activeId` picks the pressed one. Fills
// renderTopbar's left slot in place of a plain title (see its `tabsHtml`),
// reusing the same .segmented-control/.segmented-option pill look as the
// Tree View/Media/Events switcher (see renderPrimaryTabSwitcher) so every
// "tabs living in a header bar" spot in the app shares one visual pattern,
// instead of the old underline row (renderSectionTabs) that used to sit
// above the page content as its own extra row.
export function renderTopbarTabs({ tabs, activeId, idPrefix = 'section-tab' }) {
  return `
    <div class="segmented-control topbar-tabs" role="tablist">
      ${tabs
        .map(
          (tab) => `
        <button
          type="button"
          class="segmented-option ${tab.id === activeId ? 'segmented-option-active' : ''}"
          role="tab"
          id="${idPrefix}-${tab.id}"
          data-tab-id="${tab.id}"
          aria-selected="${tab.id === activeId}"
          tabindex="${tab.id === activeId ? '0' : '-1'}"
          ${tab.tooltip ? `data-tooltip="${escapeHtml(tab.tooltip)}" data-tooltip-pos="bottom"` : ''}
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
// reach tree creation here - "+ New Tree" itself only lives in the toolbar
// row next to Search/Sort (see renderTreesToolbarRow), which isn't rendered
// until the account has at least one tree.
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

// Discover-search shown once the account already has trees - the "Members"
// mode of the merged search box in the toolbar row (see renderTreesToolbarRow
// and its search-mode-select), searching the whole database by tree name or
// a family member's first/last name rather than just the caller's own trees.
// Styled with the accent color (discover-search-box) so it reads as "search
// everyone's trees" rather than "filter my trees".
export function renderCompactJoinSearch({ query }) {
  return `
    <form id="join-search-form" class="discover-search-form">
      <label class="search-box discover-search-box" title="Search the entire database for other family trees, not just yours">
        ${icon('search')}
        <input id="join-search-input" type="search" name="query" placeholder="Search by a family member's name..." maxlength="120" value="${escapeHtml(query)}" />
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
    ${renderPageHeader({ subtitle: 'Review requests to join your family trees.' })}
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

// "Manage Claims" dashboard view: incoming "this is me" member claims across
// every tree the current user owns - same markup shape as
// renderPendingRequestsPageMarkup (reuses the pending-request-* classes)
// since it's the identity-claim analog of a join request.
export function renderManageClaimsPageMarkup({ loading, claims }) {
  const body = loading
    ? `<p class="muted">Loading claims...</p>`
    : claims.length === 0
      ? `
        <div class="empty-state">
          <div class="empty-state-icon">${icon('user')}</div>
          <h2 class="empty-state-title">No Pending Claims</h2>
          <p class="empty-state-desc">When someone claims a person in one of your family trees as themselves, it'll show up here.</p>
        </div>`
      : `<div class="pending-request-list">${claims.map(renderPendingClaimRow).join('')}</div>`;

  return `
    ${renderPageHeader({ title: 'Manage Claims', subtitle: 'Review "this is me" claims on your family trees.' })}
    ${body}
  `;
}

function renderPendingClaimRow(claim) {
  const memberLabel = claim.member_name ? escapeHtml(claim.member_name) : 'a person';

  return `
    <div class="pending-request-row" data-claim-id="${claim.id}">
      <div class="pending-request-info">
        <p class="pending-request-title">${escapeHtml(claim.user_email)} <span class="muted">claims to be</span> ${memberLabel} <span class="muted">in</span> ${escapeHtml(claim.tree_name)}</p>
        <p class="pending-request-meta">
          <span class="muted">${escapeHtml(formatRelativeTime(claim.created_at))}</span>
        </p>
      </div>
      <div class="pending-request-actions">
        <button type="button" class="btn btn-secondary btn-sm pending-claim-reject-btn" data-claim-id="${claim.id}">Reject</button>
        <button type="button" class="btn btn-primary btn-sm pending-claim-approve-btn" data-claim-id="${claim.id}">Approve</button>
      </div>
    </div>
  `;
}

const SENT_CLAIM_STATUS_LABELS = {
  pending: { label: 'Pending', className: 'badge-role-viewer' },
  approved: { label: 'Approved', className: 'badge-role-owner' },
  rejected: { label: 'Rejected', className: 'badge-role-editor' },
  withdrawn: { label: 'Withdrawn', className: 'badge-role-editor' },
};

// "My Claims" dashboard view: every member claim the current user has
// proposed (any status) - mirrors renderMyRequestsPageMarkup.
export function renderMyClaimsPageMarkup({ loading, claims }) {
  const body = loading
    ? `<p class="muted">Loading your claims...</p>`
    : claims.length === 0
      ? `
        <div class="empty-state">
          <div class="empty-state-icon">${icon('user')}</div>
          <h2 class="empty-state-title">No Claims Sent</h2>
          <p class="empty-state-desc">Open a family tree and use "This is me" on your own person card to claim it.</p>
        </div>`
      : `<div class="pending-request-list">${claims.map(renderSentClaimRow).join('')}</div>`;

  return `
    ${renderPageHeader({ title: 'My Claims', subtitle: 'Track the status of people you have claimed as yourself.' })}
    ${body}
  `;
}

function renderSentClaimRow(claim) {
  const status = SENT_CLAIM_STATUS_LABELS[claim.status] || SENT_CLAIM_STATUS_LABELS.pending;
  const memberLabel = claim.member_name ? escapeHtml(claim.member_name) : 'a person';

  return `
    <div class="pending-request-row" data-claim-id="${claim.id}">
      <div class="pending-request-info">
        <p class="pending-request-title">${memberLabel} <span class="muted">in</span> ${escapeHtml(claim.tree_name)}</p>
        <p class="pending-request-meta">
          <span class="badge ${status.className}">${escapeHtml(status.label)}</span>
          <span class="muted">${escapeHtml(formatRelativeTime(claim.updated_at))}</span>
        </p>
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
    ${renderPageHeader({ subtitle: 'Track the status of trees you have asked to join.' })}
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

// Icon-only Download Template/Import/New Tree actions. Rendered inline in
// .trees-toolbar-right next to the sort trigger (see renderTreesToolbarRow
// below) once the account has at least one tree; the zero-tree empty state
// has no sort control to sit next to, so it still gets its own standalone
// row via renderTreesActionBar (main.js's renderTreeGrid empty branch) -
// see handleTreesLandingHeaderAction. Private Vault used to live here too
// as a "More Options" kebab menu (its only entry) - it's now the My
// Trees/Private Vault tab switcher in the top bar instead (see
// renderTopbarTabs' isTreesSection in main.js's renderDashboard), so the
// kebab was dropped rather than left with one redundant item.
export function renderTreesActionButtons() {
  return `
    <div class="tree-card-menu-wrap">
      <button type="button" id="download-template-btn" class="icon-btn menu-trigger" data-menu-trigger="landing-template-options" data-tooltip="Download Template" aria-label="Download Template">${icon('download')}</button>
      ${dropdownMenu({
        id: 'landing-template-options',
        items: [
          { action: 'download-csv-template-blank', label: 'Blank CSV Template', icon: 'download' },
          { action: 'download-csv-template-sample', label: 'Sample CSV Template', icon: 'download' },
        ],
      })}
    </div>
    <div class="tree-card-menu-wrap">
      <button type="button" id="import-tree-cta" class="icon-btn menu-trigger" data-menu-trigger="landing-import-options" data-tooltip="Import" aria-label="Import">${icon('upload')}</button>
      ${dropdownMenu({
        id: 'landing-import-options',
        items: [
          { action: 'import-csv', label: 'Import CSV', icon: 'upload' },
          { action: 'import-gedcom', label: 'Import GEDCOM', icon: 'upload' },
        ],
      })}
    </div>
    <button type="button" id="new-tree-cta" class="icon-btn" data-tooltip="New Tree" aria-label="New Tree">${icon('plus')}</button>
  `;
}

// Standalone row used only for the zero-tree empty state (see renderTreesActionButtons above).
export function renderTreesActionBar() {
  return `<div class="trees-action-bar">${renderTreesActionButtons()}</div>`;
}

// Row 3: the personal tree-name filter and the "Discover other family
// branches" member/tree search now share one box - search-mode-select picks
// which underlying form is visible (see the .search-box-group/hidden dance
// in main.js's renderTreeGrid) - plus a sort trigger (icon + dropdown menu,
// replacing the old plain-text "Sort by" <select>) and the Download
// Template/Import/New Tree/More Options actions (renderTreesActionButtons
// above), grouped together on the right. Only rendered once the account
// already has at least one tree (see renderTreeGrid in main.js), since the
// zero-tree empty state has its own create-tree entry point
// (renderTreesEmptyStateMarkup's "skip search and create" link) and gets
// renderTreesActionBar's standalone row instead.
export function renderTreesToolbarRow({ search, sort, searchMode = 'trees', joinSearchHtml = '' }) {
  const sortLabels = { updated: 'Recently Updated', alpha: 'Alphabetical', created: 'Creation Date' };
  return `
    <div class="trees-toolbar-row">
      <div class="search-box-group">
        <label class="search-box" ${searchMode === 'members' ? 'hidden' : ''}>
          ${icon('search')}
          <input type="search" id="tree-search-input" placeholder="Search trees by name..." value="${escapeHtml(search)}" />
        </label>
        <div class="discover-search-slot" ${searchMode === 'trees' ? 'hidden' : ''}>${joinSearchHtml}</div>
        <select id="tree-search-mode-select" class="search-mode-select" data-tooltip="Search your own trees, or discover other family trees by a member's name" data-tooltip-pos="bottom">
          <option value="trees" ${searchMode === 'trees' ? 'selected' : ''}>Trees</option>
          <option value="members" ${searchMode === 'members' ? 'selected' : ''}>Members</option>
        </select>
      </div>
      <div class="trees-toolbar-right">
        <div class="tree-card-menu-wrap">
          <button type="button" id="tree-sort-btn" class="icon-btn menu-trigger" data-menu-trigger="tree-sort-menu" data-tooltip="Sort: ${escapeHtml(sortLabels[sort] || sortLabels.updated)}" aria-label="Sort trees">${icon('sort')}</button>
          ${dropdownMenu({
            id: 'tree-sort-menu',
            items: [
              { action: 'sort-updated', label: 'Recently Updated', icon: 'clock', active: sort === 'updated' },
              { action: 'sort-alpha', label: 'Alphabetical', icon: 'list', active: sort === 'alpha' },
              { action: 'sort-created', label: 'Creation Date', icon: 'folderPlus', active: sort === 'created' },
            ],
          })}
        </div>
        ${renderTreesActionButtons()}
      </div>
    </div>
  `;
}

export function dropdownMenu({ id, items }) {
  return `
    <div class="dropdown-menu" data-menu-id="${id}">
      ${items
        .map(
          (item) => `
        <button type="button" class="dropdown-item ${item.danger ? 'dropdown-item-danger' : ''} ${item.active ? 'dropdown-item-active' : ''}" data-action="${item.action}">
          ${icon(item.icon)}<span>${escapeHtml(item.label)}</span>
        </button>`
        )
        .join('')}
    </div>
  `;
}

export function renderTreeCard(tree, { renaming } = {}) {
  const menuId = `tree-${tree.id}`;
  const isDisabled = tree.status === 'disabled';
  // Every other card action (settings, rename, delete, exports) calls a
  // requireTreeRole-gated route, which 403s for every role - including the
  // owner - once a tree is disabled (see authorizeTree.js). "Enable tree"
  // uses the owner-status route instead, which deliberately bypasses that
  // middleware precisely so this is reachable; it's the one action that
  // still works, so it's the only one offered here.
  const items = isDisabled
    ? tree.role === 'owner'
      ? [{ action: 'enable-tree', label: 'Enable tree', icon: 'settings' }]
      : []
    : [
        { action: 'export-json', label: 'Export JSON', icon: 'download' },
        { action: 'export-csv', label: 'Export CSV', icon: 'download' },
        { action: 'export-gedcom', label: 'Export GEDCOM', icon: 'download' },
      ];
  if (!isDisabled && tree.role === 'owner') {
    items.unshift({ action: 'share', label: 'Share', icon: 'share' });
    items.unshift({ action: 'tree-settings', label: 'Tree Settings', icon: 'settings' });
    items.unshift({ action: 'rename', label: 'Rename', icon: 'pencil' });
    items.push({ action: 'vault-snapshot', label: 'Save to Vault', icon: 'lock' });
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
  // formatRelativeTime falls back to a literal "Last updated: Unknown" string
  // when the tree has no (or an unparseable) updated_at - that sentinel isn't
  // useful information for the user, so the whole meta line is dropped
  // instead of ever rendering "Unknown".
  const updatedLabel = formatRelativeTime(tree.updated_at);
  const hasUpdatedLabel = updatedLabel !== 'Last updated: Unknown';

  return `
    <article class="tree-card tree-card-clickable${isDisabled ? ' tree-card-disabled' : ''}" data-tree-id="${tree.id}" data-tree-status="${escapeHtml(tree.status || 'active')}" tabindex="0" role="button" aria-label="Open ${escapeHtml(tree.name)}">
      <div class="tree-card-top">
        <div class="tree-card-icon">${icon('trees')}</div>
        <div class="tree-card-menu-wrap">
          ${
            items.length
              ? `
          <button type="button" class="icon-btn menu-trigger" data-menu-trigger="${menuId}" aria-label="Tree actions">${icon('kebab')}</button>
          ${dropdownMenu({ id: menuId, items })}`
              : ''
          }
        </div>
      </div>
      <div class="tree-card-body">
        ${titleBlock}
        <p class="tree-card-meta">${escapeHtml(memberLabel)}</p>
        ${hasUpdatedLabel ? `<p class="tree-card-meta tree-card-meta-muted">${escapeHtml(updatedLabel)}</p>` : ''}
      </div>
      <div class="tree-card-foot">
        <span class="badge badge-role-${tree.role}">${ROLE_LABELS[tree.role] || tree.role}</span>
        ${isDisabled ? '<span class="badge badge-status-disabled">Disabled</span>' : ''}
        <span class="tree-card-arrow" aria-hidden="true">${icon('chevronRight')}</span>
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

// `activeTab` is null for every core Tree View mode (Focused/All Nodes/
// Relationship Finder/Relationships/Duplicates/Settings - renderTopbar always
// calls this with just `treeName`, see below), or a label like 'Media
// Library'/'Timeline' when a sibling full-page panel is open. In the latter
// case the tree name becomes a clickable breadcrumb segment
// (id="breadcrumb-tree-btn") that routes back to the core tree view, since
// "My Trees" alone no longer reaches it in one click. `detailLabel` is an
// optional 4th segment (e.g. an event's title on the Timeline detail view) -
// when present, `activeTab` itself becomes a clickable link
// (id="breadcrumb-tab-btn") back to its list view, and `detailLabel` becomes
// the new current (non-clickable) segment. Only used directly by the
// Timeline event-detail sub-view (timelinePanel.js) today, which still
// renders its own compact header rather than going through
// renderTopbar/renderAppHeader (see main.js's renderDashboard).
export function renderTreeBreadcrumb({ treeName, activeTab = null, detailLabel = null }) {
  return `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <button type="button" id="breadcrumb-trees-btn" class="breadcrumb-link">My Trees</button>
      <span class="breadcrumb-sep">/</span>
      ${
        activeTab
          ? `<button type="button" id="breadcrumb-tree-btn" class="breadcrumb-link">${escapeHtml(treeName)}</button>
             <span class="breadcrumb-sep">/</span>
             ${
               detailLabel
                 ? `<button type="button" id="breadcrumb-tab-btn" class="breadcrumb-link">${escapeHtml(activeTab)}</button>
                    <span class="breadcrumb-sep">/</span>
                    <span class="breadcrumb-current">${escapeHtml(detailLabel)}</span>`
                 : `<span class="breadcrumb-current">${escapeHtml(activeTab)}</span>`
             }`
          : `<span class="breadcrumb-current">${escapeHtml(treeName)}</span>`
      }
    </nav>
  `;
}

// Combines Share, the old separate Import/Export buttons, and the standalone
// header gear menu's Rename/Settings/Save to Vault/Delete Tree/CSV templates
// into one icon-only "More" dropdown (see renderAppHeader) - Share used to be
// its own button next to this menu; it's now that menu's first item so Row 2
// only has to carry the Editing dropdown and this one icon. Relationships/
// Duplicates used to live here too (a "Tools" group) but moved into the Tree
// View options menu's Manage Data section instead (see
// renderPrimaryTabSwitcher) so they're not duplicated across two menus.
export function renderManageDataMenu({ canEdit, isOwner, viewMode }) {
  const shareGroup = isOwner ? [{ action: 'share', label: 'Share', icon: 'share' }] : [];
  const importGroup = canEdit
    ? [
        { action: 'import-csv', label: 'Import CSV', icon: 'upload' },
        { action: 'import-json', label: 'Import JSON', icon: 'upload' },
        { action: 'import-gedcom', label: 'Import GEDCOM', icon: 'upload' },
      ]
    : [];
  const exportGroup = [
    { action: 'export-image', label: 'Export as Image / PDF', icon: 'image' },
    { action: 'export-json', label: 'Export JSON', icon: 'download' },
    { action: 'export-csv', label: 'Export CSV', icon: 'download' },
    { action: 'export-gedcom', label: 'Export GEDCOM', icon: 'download' },
  ];
  const treeGroup = [];
  if (canEdit) {
    treeGroup.push({ action: 'rename', label: 'Rename Tree', icon: 'pencil' });
    treeGroup.push({ action: 'download-csv-template-blank', label: 'Download Blank CSV Template', icon: 'download' });
    treeGroup.push({ action: 'download-csv-template-sample', label: 'Download Sample CSV Template', icon: 'download' });
  }
  if (isOwner) {
    // The tree's default-focus settings panel (viewMode 'settings'), not
    // "Tree Settings" the modal.
    treeGroup.push({ action: 'settings', label: 'Settings', icon: 'settings', active: viewMode === 'settings' });
    treeGroup.push({ action: 'vault-snapshot', label: 'Save to Vault', icon: 'lock' });
    treeGroup.push({ action: 'delete', label: 'Delete Tree', icon: 'trash', danger: true });
  }
  const renderItems = (items) =>
    items
      .map(
        (item) => `
      <button type="button" class="dropdown-item ${item.active ? 'dropdown-item-active' : ''} ${item.danger ? 'dropdown-item-danger' : ''}" data-action="${item.action}">
        ${icon(item.icon)}<span>${escapeHtml(item.label)}</span>
      </button>`
      )
      .join('');
  const renderGroup = (label, items) => `
    <div class="dropdown-group-label">${escapeHtml(label)}</div>
    ${renderItems(items)}
  `;

  return `
    <div class="tree-card-menu-wrap">
      <button type="button" id="tree-more-options-btn" class="icon-btn menu-trigger" data-menu-trigger="tree-more-options" aria-label="More options">
        ${icon('kebab')}
      </button>
      <div class="dropdown-menu" data-menu-id="tree-more-options">
        ${shareGroup.length ? renderItems(shareGroup) : ''}
        ${shareGroup.length ? '<div class="dropdown-divider"></div>' : ''}
        ${importGroup.length ? renderGroup('Import', importGroup) : ''}
        ${importGroup.length ? '<div class="dropdown-divider"></div>' : ''}
        ${renderGroup('Export', exportGroup)}
        ${treeGroup.length ? '<div class="dropdown-divider"></div>' : ''}
        ${treeGroup.length ? renderGroup('Tree', treeGroup) : ''}
      </div>
    </div>
  `;
}

// Subtle status readout that replaces the old always-blue Save button.
// Editors/owners get live "Saving.../Saved/Unsaved changes" text (driven by
// scheduleAutoSave() in main.js); viewers get nothing since there's never
// anything for them to save. Clicking it while in the "error" state retries
// the save immediately (see #autosave-status click handler in main.js).
export function renderAutoSaveStatus({ canEdit }) {
  if (!canEdit) return '';
  return `
    <button type="button" id="autosave-status" class="autosave-status" data-state="saved" title="All changes saved">
      <span class="autosave-status-dot" aria-hidden="true"></span>
      <span class="autosave-status-text">Saved</span>
    </button>
  `;
}

// Google-Docs-style Editing/Viewing dropdown for owners/editors, replacing
// the plain role badge those two roles used to show - lets someone who
// *can* edit deliberately browse read-only (state.treeViewOnly in main.js,
// gated through canEditSelectedTree()) without switching accounts or losing
// their actual role. Viewers have no edit permission to toggle away from in
// the first place, so they keep the plain badge + "Request a change"
// tooltip instead of a dropdown.
function renderRoleModeControl({ role, viewOnly }) {
  if (role !== 'owner' && role !== 'editor') {
    return `
      <span class="badge badge-role-${role} badge-with-tooltip" tabindex="0">
        ${ROLE_LABELS[role] || role}
        <span class="badge-tooltip" role="tooltip">
          Want different access? <button type="button" id="request-role-change-btn" class="badge-tooltip-link">Request a change</button>
        </span>
      </span>
    `;
  }
  return `
    <div class="role-mode-wrap">
      <button type="button" id="role-mode-btn" class="role-mode-trigger" data-menu-trigger="role-mode-menu" aria-haspopup="true">
        ${icon(viewOnly ? 'eye' : 'pencil')}<span>${viewOnly ? 'Viewing' : 'Editing'}</span>${icon('chevronDown')}
      </button>
      <div class="dropdown-menu role-mode-menu" id="role-mode-menu" data-menu-id="role-mode-menu">
        <button type="button" class="dropdown-item ${!viewOnly ? 'dropdown-item-active' : ''}" data-role-mode="edit">
          ${icon('pencil')}<span>Editing</span>
        </button>
        <button type="button" class="dropdown-item ${viewOnly ? 'dropdown-item-active' : ''}" data-role-mode="view">
          ${icon('eye')}<span>Viewing</span>
        </button>
      </div>
    </div>
  `;
}

// The tree-detail toolbar shared by every tree-detail page (Tree Canvas,
// Media Library, Timeline) - the Tree View/Media/Events switcher (see
// renderPrimaryTabSwitcher) plus, for Media/Events, their filter pills
// (`centerHtml` - renderMediaLibraryFilterPills/renderTimelineFilterPills in
// their own files) anchor left; Saved status, that tab's action button(s)
// (`actionsHtml` - renderMediaLibraryActions/renderTimelineActions),
// renderRoleModeControl's Editing/Viewing dropdown, and the merged
// Share/Manage Data "More" menu (see renderManageDataMenu) anchor right.
// There's no tree title/rename button here - Rename Tree lives in that More
// dropdown instead of a standalone inline pencil button. The breadcrumb +
// notification bell that used to sit in a first row above this one now live
// in the persistent global renderTopbar instead (see main.js's
// renderDashboard/renderTreeDetailHeader), so this is the whole of the
// tree-detail chrome below that bar.
export function renderAppHeader({
  role,
  viewMode,
  primaryTab = 'tree',
  viewOnly = false,
  canEdit,
  isOwner,
  centerHtml = '',
  actionsHtml = '',
}) {
  return `
    <header class="app-primary-bar">
      <div class="primary-bar-left">
        <div class="header-island header-island--pill">
          <div id="primary-tab-switcher">${renderPrimaryTabSwitcher({ primaryTab, viewMode, canEdit })}</div>
        </div>
        ${centerHtml ? `<div class="header-island header-island--tool">${centerHtml}</div>` : ''}
      </div>
      <div class="primary-bar-right header-island header-island--tool">
        ${renderAutoSaveStatus({ canEdit })}
        ${actionsHtml}
        ${renderRoleModeControl({ role, viewOnly })}
        ${canEdit ? `<input type="file" id="import-tree-json-input" accept=".json,application/json" hidden />` : ''}
        ${renderManageDataMenu({ canEdit, isOwner, viewMode })}
      </div>
    </header>
  `;
}

// Three top-level destinations - Tree View, Media, and Events - as one
// segmented control, anchoring Row 2 left (see renderAppHeader). `primaryTab`
// ('tree' | 'media' | 'events') is a pure display concern - which one reads
// as active - tracked in state.treeToolbarPrimaryTab by main.js and
// independent of the actual viewMode/dashboardView; clicking an option is
// what actually navigates. Tree View's label and caret are separate click
// targets sharing one pill (see .segmented-option-group): the label switches
// to Tree View like Media/Events do, the caret opens a menu of two groups:
// View (Focused/All Nodes/Relationship Finder/Member Directory - formerly a
// standalone row of chips, see the old renderTreeViewSubtoggle) and Manage Data
// (Relationships/Duplicates, moved here from the Manage Data "More" dropdown's
// old Tools group so they're not duplicated across two menus) - reuses the
// original #focused-mode-btn/#all-nodes-mode-btn/#relationship-finder-btn ids
// so main.js's setupViewModeToggle wiring didn't need to change, just where
// these buttons physically live. `canEdit` (see renderAppHeader/
// canEditSelectedTree - false for plain viewers and for owners/editors
// currently toggled to "Viewing") disables the Manage Data group: Relationships/
// Duplicates exist to merge/connect people, so they're pointless (and were
// previously reachable but silently read-only) in view mode.
export function renderPrimaryTabSwitcher({ primaryTab, viewMode, canEdit }) {
  const manageDataDisabledAttrs = canEdit ? '' : 'disabled title="Available to editors only"';
  return `
    <div class="segmented-control" role="tablist" aria-label="Primary views">
      <div class="segmented-dropdown-wrap">
        <div class="segmented-option-group ${primaryTab === 'tree' ? 'segmented-option-active' : ''}" role="tab" aria-selected="${primaryTab === 'tree'}">
          <button type="button" id="primary-tab-tree-btn" class="segmented-option-label">Tree View</button>
          <button
            type="button"
            id="tree-view-mode-btn"
            class="segmented-option-caret"
            data-menu-trigger="tree-view-mode-menu"
            aria-haspopup="true"
            aria-label="Tree View options"
          >${icon('chevronDown')}</button>
        </div>
        <div class="dropdown-menu" id="tree-view-mode-menu" data-menu-id="tree-view-mode-menu">
          <div class="dropdown-group-label">View</div>
          <button type="button" id="focused-mode-btn" class="dropdown-item ${viewMode === 'focused' ? 'dropdown-item-active' : ''}">
            ${icon('crosshair')}<span>Focused</span>
          </button>
          <button type="button" id="all-nodes-mode-btn" class="dropdown-item ${viewMode === 'all-nodes' ? 'dropdown-item-active' : ''}">
            ${icon('list')}<span>All Nodes</span>
          </button>
          <button type="button" id="relationship-finder-btn" class="dropdown-item ${viewMode === 'relationship-finder' ? 'dropdown-item-active' : ''}" title="Find how two people in this tree are related">
            ${icon('share')}<span>Relationship Finder</span>
          </button>
          <button type="button" id="member-directory-btn" class="dropdown-item ${viewMode === 'member-directory' ? 'dropdown-item-active' : ''}" title="Browse every person in this tree as cards or a list">
            ${icon('user')}<span>Member Directory</span>
          </button>
          <div class="dropdown-divider"></div>
          <div class="dropdown-group-label">Manage Data</div>
          <button type="button" id="relationship-manager-btn" class="dropdown-item ${viewMode === 'relationship-manager' ? 'dropdown-item-active' : ''}" ${manageDataDisabledAttrs}>
            ${icon('share')}<span>Relationships</span>
          </button>
          <button type="button" id="duplicate-manager-btn" class="dropdown-item ${viewMode === 'duplicate-manager' ? 'dropdown-item-active' : ''}" ${manageDataDisabledAttrs}>
            ${icon('unlink')}<span>Duplicates</span>
          </button>
        </div>
      </div>
      <button type="button" id="primary-tab-media-btn" class="segmented-option ${primaryTab === 'media' ? 'segmented-option-active' : ''}" role="tab" aria-selected="${primaryTab === 'media'}">
        Media
      </button>
      <button type="button" id="primary-tab-events-btn" class="segmented-option ${primaryTab === 'events' ? 'segmented-option-active' : ''}" role="tab" aria-selected="${primaryTab === 'events'}">
        Events
      </button>
    </div>
  `;
}

// `cardStyle` ('circle' | 'rect', see cardStyle.js) and `orientation`
// ('vertical' | 'horizontal', see treeOrientation.js) pick these toggles'
// initial icon/tooltip/pressed-state so a page refresh reflects whatever the
// viewer last chose on this device, without waiting on a click to sync it.
// Every role sees the same buttons - both are per-browser display
// preferences, not something owners lock down for editors/viewers.
export function renderCanvasFloatingControls({ cardStyle = 'circle', orientation = 'vertical' } = {}) {
  const isCircle = cardStyle !== 'rect';
  const isHorizontal = orientation === 'horizontal';
  return `
    <div class="canvas-floating-controls" id="canvas-floating-controls">
      <button type="button" id="reset-view-btn" class="icon-btn canvas-floating-btn" title="Reset to the tree's default view" aria-label="Reset view">
        ${icon('home')}
      </button>
      <span class="canvas-floating-sep" aria-hidden="true"></span>
      <button
        type="button"
        id="card-style-toggle-btn"
        class="icon-btn canvas-floating-btn"
        title="${isCircle ? 'Switch to rectangle cards' : 'Switch to circle cards'}"
        aria-label="Toggle person card style"
        aria-pressed="${isCircle}"
      >${icon(isCircle ? 'user' : 'list')}</button>
      <span class="canvas-floating-sep" aria-hidden="true"></span>
      <button
        type="button"
        id="tree-orientation-toggle-btn"
        class="icon-btn canvas-floating-btn"
        title="${isHorizontal ? 'Switch to vertical tree' : 'Switch to horizontal tree'}"
        aria-label="Toggle tree orientation"
        aria-pressed="${isHorizontal}"
      >${icon(isHorizontal ? 'treeHorizontal' : 'treeVertical')}</button>
      <span class="canvas-floating-sep" aria-hidden="true"></span>
      <button type="button" id="focus-mode-btn" class="icon-btn canvas-floating-btn" title="Maximize (F)" aria-label="Maximize family tree" aria-pressed="false">
        ${icon('maximize')}
      </button>
    </div>
  `;
}

// Floats top-left over the tree canvas (see .member-search in styles.css and
// renderTreeCanvasMarkup in main.js) rather than living in the shared header
// row - `shortcutLabel` is computed in main.js (platform-specific ⌘K/Ctrl+K)
// and shown inside the box until the user actually types something, at which
// point main.js's attachMemberSearchListeners swaps it for the clear button.
export function renderMemberSearch({ shortcutLabel = 'Ctrl+K' } = {}) {
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
        <kbd class="member-search-shortcut" id="member-search-shortcut" aria-hidden="true">${escapeHtml(shortcutLabel)}</kbd>
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

export function renderVaultSnapshotModalBody({ treeName }) {
  return `
    ${modalCloseButton('vault-snapshot-modal-close-btn')}
    <h3 id="modal-title">Save to Vault</h3>
    <p class="muted">Save an instant private backup of "${escapeHtml(treeName)}" to your vault.</p>
    <form id="vault-snapshot-form" class="stack">
      <label>Description <span class="muted">(optional)</span>
        <textarea name="description" maxlength="2000" rows="3" placeholder="What's notable about this snapshot?" autofocus></textarea>
      </label>
      <div class="modal-actions row">
        <button type="button" class="btn btn-ghost" id="vault-snapshot-modal-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">${icon('save')}<span>Save to Vault</span></button>
      </div>
    </form>
  `;
}

// General Link Access control: link disabled (default) vs. anyone holding the
// link can view read-only. Only rendered for the owner - editors/viewers see
// the Share modal's collaborator list but never the raw share_token, since
// holding it grants read access (see backend/routes/trees.js's /share-link
// routes, all owner-only).
function renderShareLinkSection({ shareLink, shareLinkBusy, shareLinkError, passcodeDrawerOpen }) {
  if (!shareLink) return '';

  const isViewAccess = shareLink.link_access === 'view';
  const linkUrl = shareLink.share_token ? `${window.location.origin}/tree/t/${shareLink.share_token}` : '';
  const errorHtml = shareLinkError ? `<p class="error">${escapeHtml(shareLinkError)}</p>` : '';
  const passcodeEnabled = Boolean(shareLink.passcode_enabled);
  const emailVerificationRequired = Boolean(shareLink.email_verification_required);
  // The drawer's open/close intent is tracked client-side (shareModalState.passcodeDrawerOpen
  // in main.js) rather than derived purely from passcodeEnabled - every other checkbox/button
  // in this modal triggers a full refreshShareModal() re-render, which would otherwise wipe out
  // an in-progress (not-yet-saved) passcode entry and flip the checkbox back off.
  const passcodeDrawerVisible = Boolean(passcodeDrawerOpen);
  const passcodeChecked = passcodeEnabled || passcodeDrawerVisible;

  return `
    <div class="share-link-section">
      <p class="share-link-access-label" id="share-link-access-label">General Link Access</p>
      <div class="share-link-access-group" role="radiogroup" aria-labelledby="share-link-access-label">
        <label class="share-link-access-card ${!isViewAccess ? 'share-link-access-card-selected' : ''}">
          <input type="radio" name="share-link-access" value="restricted" ${!isViewAccess ? 'checked' : ''} ${shareLinkBusy ? 'disabled' : ''} />
          <span class="share-link-access-card-body">
            <span class="share-link-access-card-title">Restricted (Link Sharing Off)</span>
            <span class="share-link-access-card-desc">Only explicitly invited people can access.</span>
          </span>
        </label>
        <label class="share-link-access-card ${isViewAccess ? 'share-link-access-card-selected' : ''}">
          <input type="radio" name="share-link-access" value="view" ${isViewAccess ? 'checked' : ''} ${shareLinkBusy ? 'disabled' : ''} />
          <span class="share-link-access-card-body">
            <span class="share-link-access-card-title">Anyone with the link can View</span>
            <span class="share-link-access-card-desc">Anyone with the share URL can view read-only data.</span>
          </span>
        </label>
      </div>
      ${
        isViewAccess
          ? `
        <div class="share-link-row">
          <input type="text" id="share-link-url-input" class="share-link-url-input" value="${escapeHtml(linkUrl)}" readonly />
          <div class="share-link-row-actions">
            <button type="button" id="copy-share-link-btn" class="btn btn-secondary btn-sm" aria-label="Copy link" title="Copy link">${icon('link')}<span>Copy</span></button>
            <button type="button" id="reset-share-link-btn" class="btn btn-secondary btn-sm" aria-label="Reset link" title="Reset link" ${shareLinkBusy ? 'disabled' : ''}>${icon('refresh')}<span>Reset</span></button>
          </div>
        </div>
        <div class="share-link-security-section">
          <p class="share-link-security-header">Security Guardrails</p>
          <div class="share-link-passcode-row">
            <label class="share-link-passcode-toggle">
              <input type="checkbox" id="share-link-passcode-toggle" ${passcodeChecked ? 'checked' : ''} ${shareLinkBusy ? 'disabled' : ''} />
              <span>Require Passcode to View</span>
            </label>
            ${
              passcodeEnabled
                ? `<button type="button" id="change-share-link-passcode-btn" class="btn-link" ${shareLinkBusy ? 'disabled' : ''}>Change Passcode</button>`
                : ''
            }
          </div>
          <form id="share-link-passcode-form" class="share-link-passcode-drawer" ${passcodeDrawerVisible ? '' : 'hidden'}>
            <p class="share-link-passcode-drawer-title">${passcodeEnabled ? 'Update Passcode' : 'Set Passcode'}</p>
            <div class="share-link-row">
              <input
                type="text"
                id="share-link-passcode-input"
                class="share-link-passcode-input"
                placeholder="Passcode (4-64 characters)"
                autocomplete="off"
                minlength="4"
                maxlength="64"
              />
              <button type="submit" class="btn btn-primary btn-sm" ${shareLinkBusy ? 'disabled' : ''}>Save</button>
              <button type="button" id="cancel-share-link-passcode-btn" class="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </form>
          <div class="share-link-passcode-row">
            <label class="share-link-passcode-toggle">
              <input type="checkbox" id="share-link-email-verification-toggle" ${emailVerificationRequired ? 'checked' : ''} ${shareLinkBusy ? 'disabled' : ''} />
              <span>Require Email Verification to View</span>
            </label>
          </div>
        </div>
      `
          : ''
      }
      ${errorHtml}
    </div>
    <div class="modal-divider"></div>
  `;
}

// Distinct verified-viewer rows for the owner-only "Access History" tab (see
// GET /:id/access-log). A blocked row still shows here (it isn't hidden or
// removed - blocking is forward-looking only, see design.md open question 4)
// so the owner can see who they've blocked and reverse it.
function renderAccessHistoryTab({ accessLog, accessLogLoading, accessLogError }) {
  if (accessLogLoading) {
    return '<p class="modal-message">Loading access history...</p>';
  }

  const errorHtml = accessLogError ? `<p class="error">${escapeHtml(accessLogError)}</p>` : '';

  if (!accessLog || accessLog.length === 0) {
    return `<p class="muted">No verified views yet.</p>${errorHtml}`;
  }

  const rows = accessLog
    .map((entry) => {
      const viewCount = Number(entry.view_count) || 0;
      const lastViewed = entry.last_viewed_at ? new Date(entry.last_viewed_at).toLocaleString() : 'Unknown';
      const actionAttr = entry.blocked
        ? `data-access-log-unblock-email="${escapeHtml(entry.viewer_email)}"`
        : `data-access-log-block-email="${escapeHtml(entry.viewer_email)}"`;
      const actionLabel = entry.blocked ? 'Unblock' : 'Block';

      return `
        <div class="member-row">
          <div class="member-info">
            <span class="user-avatar user-avatar-sm">${escapeHtml((entry.viewer_email || '?').charAt(0).toUpperCase())}</span>
            <div>
              <p class="member-email">${escapeHtml(entry.viewer_email)}</p>
              <p class="member-meta">
                Last viewed ${escapeHtml(lastViewed)} &middot; ${viewCount} view${viewCount === 1 ? '' : 's'}
                ${entry.blocked ? '<span class="badge badge-role-viewer">Blocked</span>' : ''}
              </p>
            </div>
          </div>
          <div class="member-actions">
            <button type="button" class="btn btn-ghost btn-sm" ${actionAttr}>${actionLabel}</button>
          </div>
        </div>
      `;
    })
    .join('');

  return `<div class="member-list">${rows}</div>${errorHtml}`;
}

export function renderShareModalBody({
  treeName,
  permissions,
  loading,
  error,
  formError,
  isOwnerViewing,
  shareLink,
  shareLinkBusy,
  shareLinkError,
  passcodeDrawerOpen = false,
  shareModalTab = 'members',
  accessLog = [],
  accessLogLoading = false,
  accessLogError = '',
}) {
  if (loading) {
    return `
      ${modalCloseButton()}
      <h3 id="modal-title">Share "${escapeHtml(treeName)}"</h3>
      <p class="modal-message">Loading collaborators...</p>
    `;
  }

  const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : '';
  const formErrorHtml = formError ? `<p class="error">${escapeHtml(formError)}</p>` : '';

  // Only the owner can manage link sharing / see who has viewed via the link
  // (same gating as the raw share_token below).
  const tabsHtml = isOwnerViewing
    ? `
    <div class="share-modal-tabs" role="tablist">
      <button type="button" class="share-modal-tab ${shareModalTab !== 'link-sharing' ? 'share-modal-tab-active' : ''}" data-share-modal-tab="members" role="tab" aria-selected="${shareModalTab !== 'link-sharing'}">Invited People</button>
      <button type="button" class="share-modal-tab ${shareModalTab === 'link-sharing' ? 'share-modal-tab-active' : ''}" data-share-modal-tab="link-sharing" role="tab" aria-selected="${shareModalTab === 'link-sharing'}">Link Sharing</button>
    </div>
  `
    : '';

  if (isOwnerViewing && shareModalTab === 'link-sharing') {
    return `
      ${modalCloseButton()}
      <h3 id="modal-title">Share "${escapeHtml(treeName)}"</h3>
      ${tabsHtml}
      ${renderShareLinkSection({ shareLink, shareLinkBusy, shareLinkError, passcodeDrawerOpen })}
      <p class="share-link-access-label">Access History</p>
      ${renderAccessHistoryTab({ accessLog, accessLogLoading, accessLogError })}
    `;
  }

  const rows = permissions
    .map((permission) => {
      const isOwnerRow = permission.role === 'owner';
      const menuId = `member-role-menu-${permission.user_id}`;
      const roleLabel = MEMBER_ROLE_LABELS[permission.role] || permission.role;

      const actions = isOwnerRow || !isOwnerViewing
        ? ''
        : `
          <div class="member-role-menu-wrap">
            <button
              type="button"
              class="btn btn-ghost btn-sm menu-trigger member-role-trigger"
              data-menu-trigger="${menuId}"
              aria-label="Change role or access for ${escapeHtml(permission.email)}"
            >${escapeHtml(roleLabel)}${icon('chevronDown')}</button>
            <div class="dropdown-menu member-role-menu" data-menu-id="${menuId}">
              <button type="button" class="dropdown-item" data-role-option="editor" data-user-id="${permission.user_id}">
                ${permission.role === 'editor' ? icon('check') : '<span class="dropdown-item-icon-spacer"></span>'}<span>Editor</span>
              </button>
              <button type="button" class="dropdown-item" data-role-option="viewer" data-user-id="${permission.user_id}">
                ${permission.role === 'viewer' ? icon('check') : '<span class="dropdown-item-icon-spacer"></span>'}<span>Viewer</span>
              </button>
              ${
                isOwnerViewing
                  ? `
                <div class="dropdown-divider"></div>
                <button type="button" class="dropdown-item" data-transfer-owner-user-id="${permission.user_id}">
                  <span class="dropdown-item-icon-spacer"></span><span>Transfer ownership</span>
                </button>
              `
                  : ''
              }
              <div class="dropdown-divider"></div>
              <button type="button" class="dropdown-item dropdown-item-danger" data-remove-user-id="${permission.user_id}">
                <span class="dropdown-item-icon-spacer"></span><span>Remove access</span>
              </button>
            </div>
          </div>
        `;

      return `
        <div class="member-row">
          <div class="member-info">
            <span class="user-avatar user-avatar-sm">${escapeHtml((permission.email || '?').charAt(0).toUpperCase())}</span>
            <div>
              <p class="member-email">${escapeHtml(permission.email)}</p>
              <p class="member-meta">
                <span class="badge badge-role-${permission.role}">${roleLabel}</span>
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
    ${tabsHtml}
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

// `anonymous: true` is for the public /support page (signed-out visitors,
// see renderSupportPageAnonymous in main.js): there's no account email to
// reply to, so it swaps the "replies sent to" line for an editable email
// field the visitor fills in themselves. Everything else - fields,
// validation hookup, honeypot - is shared with the authenticated dashboard
// Contact Us page so the two never drift apart.
export function renderContactFormCard({ email, anonymous = false }) {
  const categoryOptions = SUPPORT_CATEGORIES.map(
    (category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
  ).join('');

  const emailFieldHtml = anonymous
    ? `
        <label>Your email
          <input type="email" name="email" id="contact-email-input" maxlength="254" placeholder="you@example.com" aria-required="true" />
          <span class="field-error" id="contact-email-error" role="alert"></span>
        </label>`
    : '';
  const replyToHtml = anonymous
    ? ''
    : `<p class="contact-form-replyto muted">Replies will be sent to <strong>${escapeHtml(email || 'your account email')}</strong>.</p>`;

  return `
    <section class="card contact-form-card">
      <h2 class="contact-card-title">Send us a message</h2>
      ${replyToHtml}
      <form id="contact-form" class="contact-form" novalidate data-anonymous="${anonymous ? 'true' : 'false'}">
        ${emailFieldHtml}
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
