import { api } from '../../api.js';
import { showToast } from '../../ui.js';
import { loadTreeDetail } from '../trees/logic.js';

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function createMembersState() {
  return { search: '', page: 1, pageSize: 20, members: [], total: 0, loading: false };
}

export async function loadMembers(state, render) {
  state.admin.members.loading = true;
  render();
  try {
    const { search, page, pageSize } = state.admin.members;
    const params = new URLSearchParams({ page, pageSize });
    if (search) params.set('search', search);

    const payload = await api(`/api/admin/trees/members?${params.toString()}`);
    state.admin.members.members = payload.members;
    state.admin.members.total = payload.total;
  } catch (error) {
    showToast(error.message || 'Could not load family members.', { type: 'error' });
  } finally {
    state.admin.members.loading = false;
    render();
  }
}

const debouncedMembersSearch = debounce((state, render) => {
  state.admin.members.page = 1;
  loadMembers(state, render);
}, 300);

export function attachMembersListeners(state, render) {
  document.querySelector('#admin-members-search-input').addEventListener('input', (event) => {
    state.admin.members.search = event.target.value;
    debouncedMembersSearch(state, render);
  });
  document.querySelector('#admin-members-prev-btn')?.addEventListener('click', () => {
    if (state.admin.members.page <= 1) return;
    state.admin.members.page -= 1;
    loadMembers(state, render);
  });
  document.querySelector('#admin-members-next-btn')?.addEventListener('click', () => {
    state.admin.members.page += 1;
    loadMembers(state, render);
  });
  document.querySelectorAll('.admin-page-number-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.admin.members.page = Number(btn.dataset.page);
      loadMembers(state, render);
    });
  });
  // Clicking a member opens the family tree it belongs to, in the existing
  // read-only tree detail view - there's no separate per-member page.
  document.querySelectorAll('[data-member-tree-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const treeId = Number(row.dataset.memberTreeId);
      state.admin.section = 'treeDetail';
      state.admin.trees.selectedTreeId = treeId;
      state.admin.trees.cameFromMembers = true;
      render();
      loadTreeDetail(state, render, treeId);
    });
  });
}
