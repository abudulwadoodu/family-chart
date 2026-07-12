import { escapeHtml } from '../../utils.js';
import { renderDataTable, renderSearchBar, renderFilterPanel, renderPagination, renderAdminEmptyState, renderAdminBreadcrumb } from '../shared/components.js';

const ACTION_LABELS = {
  'user.suspended': 'User suspended',
  'user.activated': 'User activated',
  'user.deleted': 'User deleted',
  'user.role_changed': 'User role changed',
  'tree.suspended': 'Family tree disabled',
  'tree.activated': 'Family tree enabled',
  'access_override.granted': 'Access override granted',
  'access_override.revoked': 'Access override revoked',
  'ticket.updated': 'Ticket updated',
  'settings.changed': 'Settings changed',
  ROLE_UPDATE: 'Role update',
  OVERRIDE_GRANTED: 'Override granted',
  OVERRIDE_REVOKED: 'Override revoked',
  TREE_DISABLED: 'Tree disabled',
};

// old_values/new_values are only populated by logAuditEvent (see
// services/auditLog.js) - legacy recordAuditLog rows have null here and
// fall back to the existing `details` cell instead.
function renderForensicDetail(log) {
  if (!log.old_values && !log.new_values) return '';
  const keys = [...new Set([...Object.keys(log.old_values || {}), ...Object.keys(log.new_values || {})])];
  const diffRows = keys
    .map((key) => {
      const before = log.old_values?.[key];
      const after = log.new_values?.[key];
      return `
        <div class="admin-audit-diff-row">
          <span class="admin-audit-diff-key">${escapeHtml(key)}</span>
          <span class="admin-audit-diff-before">${escapeHtml(before === undefined ? '—' : JSON.stringify(before))}</span>
          <span class="admin-audit-diff-arrow">&rarr;</span>
          <span class="admin-audit-diff-after">${escapeHtml(after === undefined ? '—' : JSON.stringify(after))}</span>
        </div>`;
    })
    .join('');

  const metaParts = [];
  if (log.ip_address) metaParts.push(`IP: ${escapeHtml(log.ip_address)}`);
  if (log.user_agent) metaParts.push(`User agent: ${escapeHtml(log.user_agent)}`);
  const meta = metaParts.length ? `<div class="admin-audit-diff-meta muted">${metaParts.join(' · ')}</div>` : '';

  return `<div class="admin-audit-diff">${diffRows}${meta}</div>`;
}

export function renderAuditLogsPageMarkup({ logs, total, page, pageSize, search, action, actions, loading, expandedLogId }) {
  const columns = [{ label: 'Date' }, { label: 'Administrator' }, { label: 'Action' }, { label: 'Target' }, { label: 'Details' }];
  const rows = logs.map((log) => [
    `<span class="muted">${escapeHtml(log.created_at)}</span>`,
    `<span>${escapeHtml(log.admin_email || 'System')}</span>`,
    `<span class="badge badge-audit-action">${escapeHtml(ACTION_LABELS[log.action] || log.action)}</span>`,
    `<span class="muted">${escapeHtml(log.target_type)}${log.target_id ? ` #${escapeHtml(log.target_id)}` : ''}</span>`,
    `<span class="muted admin-audit-details">${log.details ? escapeHtml(JSON.stringify(log.details)) : (log.old_values || log.new_values) ? 'View change &hellip;' : ''}</span>`,
  ]);

  const actionOptions = [
    { value: 'all', label: 'All actions' },
    ...actions.map((value) => ({ value, label: ACTION_LABELS[value] || value })),
  ];

  const expandedLog = logs.find((l) => l.id === expandedLogId);
  const expandedDetail = expandedLog ? renderForensicDetail(expandedLog) : '';

  const body = loading
    ? '<p class="muted admin-table-empty">Loading audit logs&hellip;</p>'
    : logs.length
      ? `
        ${renderDataTable({ columns, rows, rowKeys: logs.map((l) => l.id), onRowClickAttr: 'data-log-id', loading: false, startIndex: (page - 1) * pageSize + 1 })}
        ${expandedDetail ? `<div class="admin-audit-expanded">${expandedDetail}</div>` : ''}
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
