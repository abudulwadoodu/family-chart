import { escapeHtml, formatRelativeTime } from '../../utils.js';
import { renderDataTable, renderSearchBar, renderPagination, renderAdminEmptyState, renderAdminBreadcrumb, renderStatusBadge } from '../shared/components.js';

const TREE_STATUS_LABELS = { active: 'Active', disabled: 'Disabled' };

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '<1 MB';
  return `${mb.toFixed(1)} MB`;
}

export function renderTreesPageMarkup({ trees, total, page, pageSize, search, loading }) {
  const columns = [{ label: 'Name' }, { label: 'Owner' }, { label: 'Status' }, { label: 'Members' }, { label: 'Collaborators' }, { label: 'Storage' }, { label: 'Last Updated' }];
  const rows = trees.map((tree) => [
    `<span class="admin-table-primary">${escapeHtml(tree.name)}</span>`,
    `<span class="muted">${escapeHtml(tree.owner_email || 'Unknown')}</span>`,
    renderStatusBadge(tree.status || 'active', TREE_STATUS_LABELS, 'tree-status'),
    `<span class="muted">${tree.member_count}</span>`,
    `<span class="muted">${tree.collaborator_count}</span>`,
    `<span class="muted">${formatBytes(tree.storage_bytes)}</span>`,
    `<span class="muted">${escapeHtml(formatRelativeTime(tree.updated_at))}</span>`,
  ]);

  const body = loading
    ? '<p class="muted admin-table-empty">Loading family trees&hellip;</p>'
    : trees.length
      ? `
        ${renderDataTable({ columns, rows, rowKeys: trees.map((t) => t.id), onRowClickAttr: 'data-tree-id', loading: false, startIndex: (page - 1) * pageSize + 1 })}
        ${renderPagination({ page, pageSize, total, idPrefix: 'admin-trees' })}
      `
      : renderAdminEmptyState({ title: 'No family trees found', description: 'Try a different search.', iconName: 'search' });

  return `
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-dashboard-breadcrumb-btn', label: 'Dashboard' }], current: 'Family Trees' })}
    <header class="page-header">
      <div>
        <h1 class="page-title">Family Tree Management</h1>
        <p class="page-subtitle">Read-only overview of every family tree. Tree data cannot be modified here.</p>
      </div>
    </header>
    <div class="ticket-filters">
      ${renderSearchBar({ idPrefix: 'admin-trees', placeholder: 'Search by tree name or owner...', value: search })}
    </div>
    ${body}
  `;
}

export function renderTreeDetailMarkup({ tree, collaborators, backLabel = 'Family Trees', busy, canSuspend }) {
  const collaboratorRows = collaborators.length
    ? collaborators
        .map(
          (c) => `
      <li class="admin-owned-tree-row">
        <span>${escapeHtml(c.email)}</span>
        <span class="badge badge-role-${c.role}">${escapeHtml(c.role)}</span>
      </li>`
        )
        .join('')
    : '<li class="muted">No collaborators.</li>';

  return `
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-tree-back-btn', label: backLabel }], current: tree.name })}
    <div class="admin-detail-grid">
      <section class="card">
        <header class="ticket-detail-header">
          <div>
            <h1 class="page-title">${escapeHtml(tree.name)}</h1>
            <p class="page-subtitle">Owned by ${escapeHtml(tree.owner_email || 'Unknown')}</p>
          </div>
          <div class="ticket-detail-badges">${renderStatusBadge(tree.status || 'active', TREE_STATUS_LABELS, 'tree-status')}</div>
        </header>
        <dl class="admin-detail-list">
          <div><dt>Members</dt><dd>${tree.member_count}</dd></div>
          <div><dt>Storage used</dt><dd>${formatBytes(tree.storage_bytes)}</dd></div>
          <div><dt>Created</dt><dd>${escapeHtml(formatRelativeTime(tree.created_at))}</dd></div>
          <div><dt>Last updated</dt><dd>${escapeHtml(formatRelativeTime(tree.updated_at))}</dd></div>
        </dl>
        <p class="muted">Tree contents are read-only in the admin panel. Disabling a tree blocks the owner and all collaborators from opening it, without touching its data.</p>
        <button type="button" id="admin-tree-view-btn" class="btn btn-secondary">View tree (read-only)</button>
        <div id="admin-tree-viewer-mount" class="admin-tree-viewer-mount" hidden></div>
      </section>
      <aside class="ticket-side-panel">
        ${
          canSuspend
            ? `
        <section class="card">
          <h2 class="contact-card-title">Tree actions</h2>
          <div class="admin-action-list">
            ${
              (tree.status || 'active') === 'active'
                ? `<button type="button" id="admin-tree-disable-btn" class="btn btn-secondary" ${busy ? 'disabled' : ''}>Disable tree</button>`
                : `<button type="button" id="admin-tree-enable-btn" class="btn btn-secondary" ${busy ? 'disabled' : ''}>Enable tree</button>`
            }
          </div>
        </section>`
            : ''
        }
        <section class="card">
          <h2 class="contact-card-title">Collaborators</h2>
          <ul class="admin-owned-tree-list">${collaboratorRows}</ul>
        </section>
      </aside>
    </div>
  `;
}
