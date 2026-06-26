import { icon } from './icons.js';
import { escapeHtml, formatRelativeTime } from './utils.js';

const ROLE_LABELS = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

export function renderSidebarNav({ email, activeView }) {
  const initial = (email || '?').trim().charAt(0).toUpperCase();

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
        <button type="button" class="nav-item ${activeView === 'trees' ? 'nav-item-active' : ''}" id="nav-trees-btn">
          ${icon('trees')}<span class="nav-label">My Trees</span>
        </button>
        <button type="button" class="nav-item ${activeView === 'security' ? 'nav-item-active' : ''}" id="nav-security-btn">
          ${icon('shield')}<span class="nav-label">Security Settings</span>
        </button>
      </nav>
      <div class="sidebar-foot">
        <div class="sidebar-user">
          <span class="user-avatar">${escapeHtml(initial)}</span>
          <span class="user-email" title="${escapeHtml(email)}">${escapeHtml(email)}</span>
        </div>
        <button type="button" id="logout-btn" class="nav-item nav-item-logout">
          ${icon('logout')}<span class="nav-label">Logout</span>
        </button>
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

export function renderPageHeader({ title, subtitle, primaryActionId, primaryActionLabel }) {
  return `
    <header class="page-header">
      <div>
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="page-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      ${
        primaryActionId
          ? `<button type="button" id="${primaryActionId}" class="btn btn-primary">${icon('plus')}<span>${escapeHtml(primaryActionLabel)}</span></button>`
          : ''
      }
    </header>
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

export function renderTreesToolbarRow({ search, sort }) {
  return `
    <div class="trees-toolbar-row">
      <label class="search-box">
        ${icon('search')}
        <input type="search" id="tree-search-input" placeholder="Search trees by name..." value="${escapeHtml(search)}" />
      </label>
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
  ];
  if (tree.role === 'owner') {
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

  return `
    <article class="tree-card" data-tree-id="${tree.id}">
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
        <p class="tree-card-meta tree-card-meta-muted">${escapeHtml(formatRelativeTime(tree.updated_at))}</p>
      </div>
      <div class="tree-card-foot">
        <span class="badge badge-role-${tree.role}">${ROLE_LABELS[tree.role] || tree.role}</span>
        <button type="button" class="btn btn-secondary btn-sm tree-open-btn" data-tree-id="${tree.id}">Open</button>
      </div>
    </article>
  `;
}

export function renderEmptyState({ mode }) {
  if (mode === 'no-results') {
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

  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon('trees')}</div>
      <h2 class="empty-state-title">No Family Trees Yet</h2>
      <p class="empty-state-desc">Create your first family tree to get started. You can import a CSV once it's open.</p>
      <div class="empty-state-actions">
        <button type="button" id="empty-create-btn" class="btn btn-primary">${icon('plus')}<span>Create Tree</span></button>
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
    settingsItems.push({ action: 'download-csv-template', label: 'Download CSV Template', icon: 'download' });
    settingsItems.push({ action: 'download-json-template', label: 'Download JSON Template', icon: 'download' });
  }
  if (isOwner) {
    settingsItems.push({ action: 'rename', label: 'Rename Tree', icon: 'pencil' });
    settingsItems.push({ action: 'delete', label: 'Delete Tree', icon: 'trash', danger: true });
  }

  return `
    <header class="viewer-header">
      <div class="viewer-heading">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <button type="button" id="breadcrumb-trees-btn" class="breadcrumb-link">My Trees</button>
          <span class="breadcrumb-sep">/</span>
          <span class="breadcrumb-current">${escapeHtml(treeName)}</span>
        </nav>
        <div class="viewer-title-row">
          <h1 class="viewer-title">${escapeHtml(treeName)}</h1>
          <span class="badge badge-role-${role}">${ROLE_LABELS[role] || role}</span>
        </div>
      </div>
      <div class="viewer-actions">
        <button type="button" id="save-btn" class="btn btn-primary" ${canEdit ? '' : 'disabled'}>${icon('save')}<span>Save</span></button>
        ${
          canEdit
            ? `<input type="file" id="import-tree-csv-input" accept=".csv,text/csv" hidden />
               <input type="file" id="import-tree-json-input" accept=".json,application/json" hidden />
               <div class="tree-card-menu-wrap">
                 <button type="button" id="import-tree-btn" class="btn btn-secondary menu-trigger" data-menu-trigger="import-options">${icon('upload')}<span>Import</span></button>
                 ${dropdownMenu({
                   id: 'import-options',
                   items: [
                     { action: 'import-csv', label: 'Import CSV', icon: 'upload' },
                     { action: 'import-json', label: 'Import JSON', icon: 'upload' },
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
              { action: 'export-json', label: 'Export JSON', icon: 'download' },
              { action: 'export-csv', label: 'Export CSV', icon: 'download' },
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
    </header>
  `;
}

export function renderViewModeToggle({ viewMode, canEdit }) {
  return `
    <div class="view-mode-toggle">
      <button type="button" id="focused-mode-btn" class="chip ${viewMode === 'focused' ? 'chip-active' : ''}" ${viewMode === 'focused' ? 'disabled' : ''}>Focused</button>
      <button type="button" id="all-nodes-mode-btn" class="chip ${viewMode === 'all-nodes' ? 'chip-active' : ''}" ${viewMode === 'all-nodes' ? 'disabled' : ''}>All Nodes</button>
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
