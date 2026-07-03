import { escapeHtml } from '../../utils.js';
import { renderDataTable, renderSearchBar, renderPagination, renderAdminEmptyState, renderAdminBreadcrumb } from '../shared/components.js';

const GENDER_LABELS = { M: 'Male', F: 'Female' };

export function renderMembersPageMarkup({ members, total, page, pageSize, search, loading }) {
  const columns = [{ label: 'Name' }, { label: 'Gender' }, { label: 'Birthday' }, { label: 'Family Tree' }, { label: 'Owner' }];
  const rows = members.map((member) => [
    `<span class="admin-table-primary">${escapeHtml(member.name)}</span>`,
    `<span class="muted">${escapeHtml(GENDER_LABELS[member.gender] || member.gender || '—')}</span>`,
    `<span class="muted">${escapeHtml(member.birthday != null ? String(member.birthday) : '—')}</span>`,
    `<span class="muted">${escapeHtml(member.treeName)}</span>`,
    `<span class="muted">${escapeHtml(member.ownerEmail || 'Unknown')}</span>`,
  ]);

  const body = loading
    ? '<p class="muted admin-table-empty">Loading family members&hellip;</p>'
    : members.length
      ? `
        ${renderDataTable({ columns, rows, rowKeys: members.map((m) => m.treeId), onRowClickAttr: 'data-member-tree-id', loading: false, startIndex: (page - 1) * pageSize + 1 })}
        ${renderPagination({ page, pageSize, total, idPrefix: 'admin-members' })}
      `
      : renderAdminEmptyState({ title: 'No family members found', description: 'Try a different search.', iconName: 'search' });

  return `
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-dashboard-breadcrumb-btn', label: 'Dashboard' }], current: 'Family Members' })}
    <header class="page-header">
      <div>
        <h1 class="page-title">Family Members</h1>
        <p class="page-subtitle">Every member across all family trees. Click a row to open its family tree.</p>
      </div>
    </header>
    <div class="ticket-filters">
      ${renderSearchBar({ idPrefix: 'admin-members', placeholder: 'Search by name or tree...', value: search })}
    </div>
    ${body}
  `;
}
