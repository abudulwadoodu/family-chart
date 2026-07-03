import { escapeHtml } from '../../utils.js';
import { renderStatCard, renderAdminLoadingState, renderAdminErrorState } from '../shared/components.js';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '<1 MB';
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const ACTION_LABELS = {
  'user.suspended': 'suspended a user',
  'user.activated': 'activated a user',
  'user.deleted': 'deleted a user',
  'user.role_changed': "changed a user's admin role",
  'ticket.updated': 'updated a support ticket',
  'settings.changed': 'changed system settings',
};

function renderRecentActivity(entries) {
  if (!entries.length) return '<p class="muted">No recent administrative activity.</p>';
  return `
    <ul class="admin-activity-list">
      ${entries
        .map(
          (entry) => `
        <li class="admin-activity-item">
          <span class="admin-activity-text"><strong>${escapeHtml(entry.admin_email || 'System')}</strong> ${escapeHtml(ACTION_LABELS[entry.action] || entry.action)}${entry.target_id ? ` <span class="muted">(#${escapeHtml(entry.target_id)})</span>` : ''}</span>
          <span class="admin-activity-time muted">${escapeHtml(entry.created_at)}</span>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

export function renderAdminDashboardMarkup({ stats, loading, error }) {
  if (loading || !stats) return renderAdminLoadingState({ label: 'Loading dashboard' });
  if (error) return renderAdminErrorState({ message: error, retryId: 'admin-dashboard-retry-btn' });

  const cards = [
    renderStatCard({ label: 'Total Users', value: stats.totalUsers, iconName: 'shield', sectionTarget: 'users' }),
    renderStatCard({ label: 'Active Users (Today)', value: stats.activeToday, iconName: 'clock', sectionTarget: 'users', filterKey: 'activity', filterValue: 'activeToday' }),
    renderStatCard({ label: 'Active Users (Last 30 Days)', value: stats.activeLast30Days, iconName: 'clock', sectionTarget: 'users', filterKey: 'activity', filterValue: 'activeLast30Days' }),
    renderStatCard({ label: 'Total Family Trees', value: stats.totalTrees, iconName: 'trees', sectionTarget: 'trees' }),
    renderStatCard({ label: 'Total Family Members', value: stats.totalMembers, iconName: 'trees', sectionTarget: 'members' }),
    renderStatCard({ label: 'New Registrations (7d)', value: stats.newRegistrations, iconName: 'plus', sectionTarget: 'users', filterKey: 'activity', filterValue: 'newRegistrations' }),
    renderStatCard({ label: 'Open Support Tickets', value: stats.openTickets, iconName: 'mail', sectionTarget: 'tickets', filterKey: 'status', filterValue: 'open' }),
    renderStatCard({ label: 'Closed Support Tickets', value: stats.closedTickets, iconName: 'check', sectionTarget: 'tickets', filterKey: 'status', filterValue: 'CLOSED' }),
    renderStatCard({ label: 'Storage Usage', value: formatBytes(stats.storageBytes), iconName: 'save', hint: 'Approximate, local data only' }),
  ].join('');

  return `
    <header class="page-header">
      <div>
        <h1 class="page-title">Admin Dashboard</h1>
        <p class="page-subtitle">An overview of platform activity.</p>
      </div>
    </header>
    <div class="admin-stat-grid">${cards}</div>
    <section class="card admin-activity-card">
      <h2 class="contact-card-title">Recent Activity</h2>
      ${renderRecentActivity(stats.recentActivity || [])}
    </section>
  `;
}
