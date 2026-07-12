import { icon } from '../../icons.js';
import { escapeHtml, formatRelativeTime } from '../../utils.js';
import { renderDataTable, renderSearchBar, renderFilterPanel, renderPagination, renderStatusBadge, renderAdminEmptyState, renderAdminBreadcrumb } from '../shared/components.js';
import { hasPermission } from '../shared/permissions.js';

const STATUS_LABELS = { active: 'Active', suspended: 'Suspended' };
const ROLE_LABELS = { super_admin: 'Super Admin', support_admin: 'Support Admin' };

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '<1 MB';
  return `${mb.toFixed(1)} MB`;
}

export function renderUsersPageMarkup({ users, total, page, pageSize, search, status, adminRole, activity, loading, currentUser }) {
  const columns = [{ label: 'Email' }, { label: 'Role' }, { label: 'Status' }, { label: 'Registered' }, { label: 'Last Login' }, { label: 'Trees' }];
  const rows = users.map((user) => [
    `<span class="admin-table-primary">${escapeHtml(user.email)}</span>`,
    user.admin_role ? `<span class="badge badge-role-admin">${escapeHtml(ROLE_LABELS[user.admin_role] || user.admin_role)}</span>` : '<span class="muted">&mdash;</span>',
    renderStatusBadge(user.status, STATUS_LABELS, 'user-status'),
    `<span class="muted">${escapeHtml(formatRelativeTime(user.created_at).replace('Updated ', ''))}</span>`,
    `<span class="muted">${user.last_login_at ? escapeHtml(formatRelativeTime(user.last_login_at)) : 'Never'}</span>`,
    `<span class="muted">${user.owned_tree_count}</span>`,
  ]);

  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
  ];
  const roleOptions = [
    { value: 'all', label: 'All users' },
    { value: 'admins', label: 'Admins only' },
    { value: 'super_admin', label: 'Super Admin' },
    { value: 'support_admin', label: 'Support Admin' },
  ];
  const activityOptions = [
    { value: 'all', label: 'Any time' },
    { value: 'activeToday', label: 'Active today' },
    { value: 'activeLast30Days', label: 'Active in last 30 days' },
    { value: 'newRegistrations', label: 'Registered in last 7 days' },
  ];

  const body = loading
    ? '<p class="muted admin-table-empty">Loading users&hellip;</p>'
    : users.length
      ? `
        ${renderDataTable({ columns, rows, rowKeys: users.map((u) => u.id), onRowClickAttr: 'data-user-id', loading: false, startIndex: (page - 1) * pageSize + 1 })}
        ${renderPagination({ page, pageSize, total, idPrefix: 'admin-users' })}
      `
      : renderAdminEmptyState({ title: 'No users found', description: 'Try a different search or clear your filters.', iconName: 'search' });

  return `
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-dashboard-breadcrumb-btn', label: 'Dashboard' }], current: 'Users' })}
    <header class="page-header">
      <div>
        <h1 class="page-title">User Management</h1>
        <p class="page-subtitle">Search, review, and manage user accounts.</p>
      </div>
    </header>
    <div class="ticket-filters">
      ${renderSearchBar({ idPrefix: 'admin-users', placeholder: 'Search by email...', value: search })}
      ${renderFilterPanel({
        idPrefix: 'admin-users',
        filters: [
          { id: 'status', label: 'Status', options: statusOptions, value: status },
          { id: 'role', label: 'Role', options: roleOptions, value: adminRole },
          { id: 'activity', label: 'Activity', options: activityOptions, value: activity },
        ],
      })}
    </div>
    ${body}
  `;
}

export function renderUserDetailMarkup({ user, busy, canManageRoles, canDelete }) {
  const ownedTrees = user.owned_trees || [];
  const treesRows = ownedTrees.length
    ? ownedTrees
        .map(
          (tree) => `
      <li class="admin-owned-tree-row">
        <span>${escapeHtml(tree.name)}</span>
        <span class="muted">${tree.member_count} member${tree.member_count === 1 ? '' : 's'}</span>
        <span class="muted">${escapeHtml(formatRelativeTime(tree.updated_at))}</span>
      </li>`
        )
        .join('')
    : '<li class="muted">No owned family trees.</li>';

  const roleOptions = ['', 'support_admin', 'super_admin']
    .map((value) => `<option value="${value}" ${((user.admin_role || '') === value) ? 'selected' : ''}>${value ? ROLE_LABELS[value] : 'Not an admin'}</option>`)
    .join('');

  return `
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-user-back-btn', label: 'Users' }], current: user.email })}
    <div class="admin-detail-grid">
      <section class="card">
        <header class="ticket-detail-header">
          <div>
            <div class="member-info">
              <span class="user-avatar">${escapeHtml((user.email || '?').charAt(0).toUpperCase())}</span>
              <div>
                <h1 class="page-title">${escapeHtml(user.email)}</h1>
                <p class="page-subtitle">Registered ${escapeHtml(formatRelativeTime(user.created_at))}</p>
              </div>
            </div>
          </div>
          <div class="ticket-detail-badges">${renderStatusBadge(user.status, STATUS_LABELS, 'user-status')}</div>
        </header>
        <dl class="admin-detail-list">
          <div><dt>Email verification</dt><dd>${icon('check')} Verified via Cognito</dd></div>
          <div><dt>Last login</dt><dd>${user.last_login_at ? escapeHtml(formatRelativeTime(user.last_login_at)) : 'Never'}</dd></div>
          <div><dt>Storage usage</dt><dd>${formatBytes(user.storage_bytes)}</dd></div>
          <div><dt>Owned family trees</dt><dd>${ownedTrees.length}</dd></div>
        </dl>
        <h2 class="contact-card-title">Owned Family Trees</h2>
        <ul class="admin-owned-tree-list">${treesRows}</ul>
      </section>
      <aside class="ticket-side-panel">
        <section class="card">
          <h2 class="contact-card-title">Account actions</h2>
          <div class="admin-action-list">
            ${
              user.status === 'active'
                ? `<button type="button" id="admin-user-suspend-btn" class="btn btn-secondary" ${busy ? 'disabled' : ''}>Suspend account</button>`
                : `<button type="button" id="admin-user-activate-btn" class="btn btn-secondary" ${busy ? 'disabled' : ''}>Activate account</button>`
            }
            <button type="button" id="admin-user-reset-password-btn" class="btn btn-secondary" ${busy ? 'disabled' : ''}>Send password reset email</button>
            ${canDelete ? `<button type="button" id="admin-user-delete-btn" class="btn btn-danger" ${busy ? 'disabled' : ''}>Delete account</button>` : ''}
          </div>
        </section>
        ${
          canManageRoles
            ? `
        <section class="card">
          <h2 class="contact-card-title">Admin role</h2>
          <label>Role
            <select id="admin-user-role-select" ${busy ? 'disabled' : ''}>${roleOptions}</select>
          </label>
        </section>`
            : ''
        }
      </aside>
    </div>
  `;
}
