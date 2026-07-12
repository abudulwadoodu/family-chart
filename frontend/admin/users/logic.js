import { api } from '../../api.js';
import { showToast, showConfirmDialog } from '../../ui.js';

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function createUsersState() {
  return {
    search: '',
    status: 'all',
    adminRole: 'all',
    activity: 'all',
    page: 1,
    pageSize: 20,
    users: [],
    total: 0,
    loading: false,
    selectedUserId: null,
    selectedUser: null,
    selectedLoading: false,
    busy: false,
  };
}

export async function loadUsers(state, render) {
  state.admin.users.loading = true;
  render();
  try {
    const { search, status, adminRole, activity, page, pageSize } = state.admin.users;
    const params = new URLSearchParams({ page, pageSize });
    if (search) params.set('search', search);
    if (status !== 'all') params.set('status', status);
    if (adminRole !== 'all') params.set('adminRole', adminRole);
    if (activity !== 'all') params.set('activity', activity);

    const payload = await api(`/api/admin/users?${params.toString()}`);
    state.admin.users.users = payload.users;
    state.admin.users.total = payload.total;
  } catch (error) {
    showToast(error.message || 'Could not load users.', { type: 'error' });
  } finally {
    state.admin.users.loading = false;
    render();
  }
}

const debouncedUsersSearch = debounce((state, render) => {
  state.admin.users.page = 1;
  loadUsers(state, render);
}, 300);

export function attachUsersListeners(state, render) {
  document.querySelector('#admin-users-search-input').addEventListener('input', (event) => {
    state.admin.users.search = event.target.value;
    debouncedUsersSearch(state, render);
  });
  document.querySelector('#admin-users-status-select').addEventListener('change', (event) => {
    state.admin.users.status = event.target.value;
    state.admin.users.page = 1;
    loadUsers(state, render);
  });
  document.querySelector('#admin-users-role-select').addEventListener('change', (event) => {
    state.admin.users.adminRole = event.target.value;
    state.admin.users.page = 1;
    loadUsers(state, render);
  });
  document.querySelector('#admin-users-activity-select').addEventListener('change', (event) => {
    state.admin.users.activity = event.target.value;
    state.admin.users.page = 1;
    loadUsers(state, render);
  });
  document.querySelector('#admin-users-prev-btn')?.addEventListener('click', () => {
    if (state.admin.users.page <= 1) return;
    state.admin.users.page -= 1;
    loadUsers(state, render);
  });
  document.querySelector('#admin-users-next-btn')?.addEventListener('click', () => {
    state.admin.users.page += 1;
    loadUsers(state, render);
  });
  document.querySelectorAll('.admin-page-number-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.admin.users.page = Number(btn.dataset.page);
      loadUsers(state, render);
    });
  });
  document.querySelectorAll('[data-user-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const userId = Number(row.dataset.userId);
      state.admin.section = 'userDetail';
      state.admin.users.selectedUserId = userId;
      render();
      loadUserDetail(state, render, userId);
    });
  });
}

export async function loadUserDetail(state, render, userId) {
  state.admin.users.selectedLoading = true;
  render();
  try {
    const payload = await api(`/api/admin/users/${userId}`);
    state.admin.users.selectedUser = payload.user;
  } catch (error) {
    showToast(error.message || 'Could not load this user.', { type: 'error' });
    state.admin.section = 'users';
  } finally {
    state.admin.users.selectedLoading = false;
    render();
  }
}

async function setStatus(state, render, userId, status) {
  state.admin.users.busy = true;
  render();
  try {
    // PATCH .../status returns the bare USER_COLUMNS row, not the full admin
    // profile shape (owned_trees/storage_bytes) that GET .../:id populates -
    // merge rather than replace, or renderUserDetailMarkup's unconditional
    // user.owned_trees.length throws on the next render (dialog stays open,
    // no success toast, since that throw rejects this function's promise).
    const payload = await api(`/api/admin/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    state.admin.users.selectedUser = { ...state.admin.users.selectedUser, ...payload.user };
    showToast(status === 'suspended' ? 'Account suspended.' : 'Account activated.');
  } catch (error) {
    showToast(error.message || 'Could not update the account.', { type: 'error' });
  } finally {
    state.admin.users.busy = false;
    render();
  }
}

export function attachUserDetailListeners(state, render) {
  const userId = state.admin.users.selectedUserId;

  document.querySelector('[data-breadcrumb-id="admin-user-back-btn"]').addEventListener('click', () => {
    state.admin.section = 'users';
    render();
    loadUsers(state, render);
  });

  document.querySelector('#admin-user-suspend-btn')?.addEventListener('click', () => {
    showConfirmDialog({
      title: 'Suspend account',
      message: 'This user will be signed out and unable to log back in until reactivated. Continue?',
      confirmLabel: 'Suspend',
      onConfirm: () => setStatus(state, render, userId, 'suspended'),
    });
  });

  document.querySelector('#admin-user-activate-btn')?.addEventListener('click', () => {
    setStatus(state, render, userId, 'active');
  });

  document.querySelector('#admin-user-reset-password-btn')?.addEventListener('click', async () => {
    try {
      const payload = await api(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
      showToast(payload.message || 'Password reset email sent.');
    } catch (error) {
      showToast(error.message || 'Could not send the reset email.', { type: 'error' });
    }
  });

  document.querySelector('#admin-user-delete-btn')?.addEventListener('click', () => {
    showConfirmDialog({
      title: 'Delete account',
      message: 'This permanently deletes the account and every family tree it owns. This cannot be undone.',
      confirmLabel: 'Delete account',
      onConfirm: async () => {
        try {
          await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
          showToast('Account deleted.');
          state.admin.section = 'users';
          render();
          loadUsers(state, render);
        } catch (error) {
          showToast(error.message || 'Could not delete the account.', { type: 'error' });
        }
      },
    });
  });

  document.querySelector('#admin-user-role-select')?.addEventListener('change', async (event) => {
    const adminRole = event.target.value || null;
    state.admin.users.busy = true;
    render();
    try {
      const payload = await api(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ adminRole }) });
      state.admin.users.selectedUser = { ...state.admin.users.selectedUser, ...payload.user };
      showToast('Admin role updated.');
    } catch (error) {
      showToast(error.message || 'Could not update the admin role.', { type: 'error' });
    } finally {
      state.admin.users.busy = false;
      render();
    }
  });
}
