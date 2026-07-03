import { escapeHtml } from '../../utils.js';
import { renderAdminLoadingState, renderAdminBreadcrumb } from '../shared/components.js';

// Each entry renders as a placeholder trend card. `points` is a simple array
// of numbers (0-100) used to draw a minimal inline sparkline - swap `points`
// for real time-series data from a future /api/admin/analytics endpoint
// without changing this component's shape.
function renderSparkline(points) {
  const w = 160;
  const h = 40;
  const max = Math.max(...points, 1);
  const step = w / (points.length - 1 || 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`).join(' ');
  return `<svg class="admin-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2"></path></svg>`;
}

function renderTrendCard({ title, total, points }) {
  return `
    <div class="card admin-trend-card">
      <p class="admin-trend-title">${escapeHtml(title)}</p>
      <p class="admin-trend-value">${escapeHtml(String(total))}</p>
      ${renderSparkline(points)}
    </div>
  `;
}

export function renderAnalyticsPageMarkup({ metrics, loading }) {
  if (loading) return renderAdminLoadingState({ label: 'Loading analytics' });

  return `
    ${renderAdminBreadcrumb({ crumbs: [{ id: 'admin-dashboard-breadcrumb-btn', label: 'Dashboard' }], current: 'Analytics' })}
    <header class="page-header">
      <div>
        <h1 class="page-title">Analytics</h1>
        <p class="page-subtitle">Placeholder analytics - connect a real reporting endpoint to replace this mock data.</p>
      </div>
    </header>
    <div class="admin-trend-grid">
      ${metrics.map(renderTrendCard).join('')}
    </div>
  `;
}
