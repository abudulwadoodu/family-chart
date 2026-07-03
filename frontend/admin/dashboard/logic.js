import { api } from '../../api.js';

export function createDashboardState() {
  return { stats: null, loading: false, error: '' };
}

export async function loadAdminDashboard(state, render) {
  state.admin.dashboard.loading = true;
  state.admin.dashboard.error = '';
  render();
  try {
    const stats = await api('/api/admin/dashboard/stats');
    state.admin.dashboard.stats = stats;
  } catch (error) {
    state.admin.dashboard.error = error.message || 'Could not load the dashboard.';
  } finally {
    state.admin.dashboard.loading = false;
    render();
  }
}

// `onNavigate(sectionId, filter)` lets the caller (main.js) own the actual
// section-switch + data-load, since that logic already lives in one place
// there for every admin module. `filter` is `{ key, value }` or undefined.
export function attachAdminDashboardListeners(state, render, onNavigate) {
  document.querySelector('#admin-dashboard-retry-btn')?.addEventListener('click', () => loadAdminDashboard(state, render));
  document.querySelectorAll('[data-stat-card-target]').forEach((card) => {
    card.addEventListener('click', () => {
      const { statCardTarget, statCardFilterKey, statCardFilterValue } = card.dataset;
      const filter = statCardFilterKey ? { key: statCardFilterKey, value: statCardFilterValue } : undefined;
      onNavigate?.(statCardTarget, filter);
    });
  });
}
