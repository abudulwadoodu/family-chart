import { escapeHtml, formatRelativeTime } from '../../utils.js';
import { renderDataTable, renderSearchBar, renderPagination, renderAdminEmptyState, renderAdminBreadcrumb } from '../shared/components.js';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '<1 MB';
  return `${mb.toFixed(1)} MB`;
}

export function renderTreesPageMarkup({ trees, total, page, pageSize, search, loading }) {
  const columns = [{ label: 'Name' }, { label: 'Owner' }, { label: 'Members' }, { label: 'Collaborators' }, { label: 'Storage' }, { label: 'Last Updated' }];
  const rows = trees.map((tree) => [
    `<span class="admin-table-primary">${escapeHtml(tree.name)}</span>`,
    `<span class="muted">${escapeHtml(tree.owner_email || 'Unknown')}</span>`,
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

export function renderTreeDetailMarkup({ tree, collaborators, backLabel = 'Family Trees' }) {
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
        </header>
        <dl class="admin-detail-list">
          <div><dt>Members</dt><dd>${tree.member_count}</dd></div>
          <div><dt>Storage used</dt><dd>${formatBytes(tree.storage_bytes)}</dd></div>
          <div><dt>Created</dt><dd>${escapeHtml(formatRelativeTime(tree.created_at))}</dd></div>
          <div><dt>Last updated</dt><dd>${escapeHtml(formatRelativeTime(tree.updated_at))}</dd></div>
        </dl>
        <p class="muted">This is a read-only view. Tree contents cannot be edited from the admin panel.</p>
        <button type="button" id="admin-tree-view-btn" class="btn btn-secondary">View tree (read-only)</button>
        <div id="admin-tree-viewer-mount" class="admin-tree-viewer-mount" hidden></div>
      </section>
      <aside class="ticket-side-panel">
        <section class="card">
          <h2 class="contact-card-title">Collaborators</h2>
          <ul class="admin-owned-tree-list">${collaboratorRows}</ul>
        </section>
      </aside>
    </div>
  `;
}
