import { escapeHtml } from '../../utils.js';
import { renderDataTable, renderSearchBar, renderFilterPanel, renderPagination, renderAdminEmptyState, renderAdminBreadcrumb } from '../shared/components.js';

const ACTION_LABELS = {
  'user.suspended': 'User suspended',
  'user.activated': 'User activated',
  'user.deleted': 'User deleted',
  'user.role_changed': 'User role changed',
  'tree.suspended': 'Family tree disabled',
  'tree.activated': 'Family tree enabled',
  'ticket.updated': 'Ticket updated',
  'settings.changed': 'Settings changed',
};

export function renderAuditLogsPageMarkup({ logs, total, page, pageSize, search, action, actions, loading }) {
  const columns = [{ label: 'Date' }, { label: 'Administrator' }, { label: 'Action' }, { label: 'Target' }, { label: 'Details' }];
  const rows = logs.map((log) => [
    `<span class="muted">${escapeHtml(log.created_at)}</span>`,
    `<span>${escapeHtml(log.admin_email || 'System')}</span>`,
    `<span class="badge badge-audit-action">${escapeHtml(ACTION_LABELS[log.action] || log.action)}</span>`,
    `<span class="muted">${escapeHtml(log.target_type)}${log.target_id ? ` #${escapeHtml(log.target_id)}` : ''}</span>`,
    `<span class="muted admin-audit-details">${log.details ? escapeHtml(JSON.stringify(log.details)) : ''}</span>`,
  ]);

  const actionOptions = [
    { value: 'all', label: 'All actions' },
    ...actions.map((value) => ({ value, label: ACTION_LABELS[value] || value })),
  ];

  const body = loading
    ? '<p class="muted admin-table-empty">Loading audit logs&hellip;</p>'
    : logs.length
      ? `
        ${renderDataTable({ columns, rows, rowKeys: logs.map((l) => l.id), onRowClickAttr: 'data-log-id', loading: false, startIndex: (page - 1) * pageSize + 1 })}
        ${renderPagination({ page, pageSize, total, idPrefix: 'admin-audit-logs' })}
      `
      : renderAdminEmptyState({ title: 'No audit log entries', description: 'Administrative actions will appear here as they happen.', iconName: 'clock' });

  return `
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-dashboard-breadcrumb-btn', label: 'Dashboard' }], current: 'Audit Logs' })}
    <header class="page-header">
      <div>
        <h1 class="page-title">Audit Logs</h1>
        <p class="page-subtitle">A record of administrative actions taken across the platform.</p>
      </div>
    </header>
    <div class="ticket-filters">
      ${renderSearchBar({ idPrefix: 'admin-audit-logs', placeholder: 'Search by admin or target...', value: search })}
      ${renderFilterPanel({ idPrefix: 'admin-audit-logs', filters: [{ id: 'action', label: 'Action', options: actionOptions, value: action }] })}
    </div>
    ${body}
  `;
}
