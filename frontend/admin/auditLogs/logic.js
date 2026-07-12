import { api } from '../../api.js';
import { showToast } from '../../ui.js';

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function createAuditLogsState() {
  return { search: '', action: 'all', page: 1, pageSize: 20, logs: [], total: 0, actions: [], loading: false, expandedLogId: null };
}

export async function loadAuditLogs(state, render) {
  state.admin.auditLogs.loading = true;
  render();
  try {
    const { search, action, page, pageSize } = state.admin.auditLogs;
    const params = new URLSearchParams({ page, pageSize });
    if (search) params.set('search', search);
    if (action !== 'all') params.set('action', action);

    const payload = await api(`/api/admin/audit-logs?${params.toString()}`);
    state.admin.auditLogs.logs = payload.logs;
    state.admin.auditLogs.total = payload.total;
    state.admin.auditLogs.actions = payload.actions;
  } catch (error) {
    showToast(error.message || 'Could not load audit logs.', { type: 'error' });
  } finally {
    state.admin.auditLogs.loading = false;
    render();
  }
}

const debouncedAuditLogsSearch = debounce((state, render) => {
  state.admin.auditLogs.page = 1;
  loadAuditLogs(state, render);
}, 300);

export function attachAuditLogsListeners(state, render) {
  document.querySelector('#admin-audit-logs-search-input').addEventListener('input', (event) => {
    state.admin.auditLogs.search = event.target.value;
    debouncedAuditLogsSearch(state, render);
  });
  document.querySelector('#admin-audit-logs-action-select').addEventListener('change', (event) => {
    state.admin.auditLogs.action = event.target.value;
    state.admin.auditLogs.page = 1;
    loadAuditLogs(state, render);
  });
  document.querySelector('#admin-audit-logs-prev-btn')?.addEventListener('click', () => {
    if (state.admin.auditLogs.page <= 1) return;
    state.admin.auditLogs.page -= 1;
    loadAuditLogs(state, render);
  });
  document.querySelector('#admin-audit-logs-next-btn')?.addEventListener('click', () => {
    state.admin.auditLogs.page += 1;
    loadAuditLogs(state, render);
  });
  document.querySelectorAll('.admin-page-number-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.admin.auditLogs.page = Number(btn.dataset.page);
      loadAuditLogs(state, render);
    });
  });
  document.querySelectorAll('[data-log-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const logId = Number(row.dataset.logId);
      state.admin.auditLogs.expandedLogId = state.admin.auditLogs.expandedLogId === logId ? null : logId;
      render();
    });
  });
}
