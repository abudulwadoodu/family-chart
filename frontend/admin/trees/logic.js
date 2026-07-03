import f3 from '../../../src/index.ts';
import { api } from '../../api.js';
import { showToast } from '../../ui.js';

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// f3.createChart reads the container's getBoundingClientRect() once,
// synchronously, to compute the initial zoom/fit transform - if the
// container is still 0x0 at that instant (e.g. right after un-hiding it
// in the same tick), every card collapses onto the same point and looks
// "overlapped". Two rAFs guarantee the browser has completed a layout
// pass for the now-visible container before f3 measures it.
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export function createTreesState() {
  return {
    search: '',
    page: 1,
    pageSize: 20,
    trees: [],
    total: 0,
    loading: false,
    selectedTreeId: null,
    selectedTree: null,
    selectedCollaborators: [],
    selectedLoading: false,
    viewerChart: null,
  };
}

export async function loadTrees(state, render) {
  state.admin.trees.loading = true;
  render();
  try {
    const { search, page, pageSize } = state.admin.trees;
    const params = new URLSearchParams({ page, pageSize, sort: 'updated_at', order: 'desc' });
    if (search) params.set('search', search);

    const payload = await api(`/api/admin/trees?${params.toString()}`);
    state.admin.trees.trees = payload.trees;
    state.admin.trees.total = payload.total;
  } catch (error) {
    showToast(error.message || 'Could not load family trees.', { type: 'error' });
  } finally {
    state.admin.trees.loading = false;
    render();
  }
}

const debouncedTreesSearch = debounce((state, render) => {
  state.admin.trees.page = 1;
  loadTrees(state, render);
}, 300);

export function attachTreesListeners(state, render) {
  document.querySelector('#admin-trees-search-input').addEventListener('input', (event) => {
    state.admin.trees.search = event.target.value;
    debouncedTreesSearch(state, render);
  });
  document.querySelector('#admin-trees-prev-btn')?.addEventListener('click', () => {
    if (state.admin.trees.page <= 1) return;
    state.admin.trees.page -= 1;
    loadTrees(state, render);
  });
  document.querySelector('#admin-trees-next-btn')?.addEventListener('click', () => {
    state.admin.trees.page += 1;
    loadTrees(state, render);
  });
  document.querySelectorAll('.admin-page-number-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.admin.trees.page = Number(btn.dataset.page);
      loadTrees(state, render);
    });
  });
  document.querySelectorAll('[data-tree-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const treeId = Number(row.dataset.treeId);
      state.admin.section = 'treeDetail';
      state.admin.trees.selectedTreeId = treeId;
      render();
      loadTreeDetail(state, render, treeId);
    });
  });
}

export async function loadTreeDetail(state, render, treeId) {
  state.admin.trees.selectedLoading = true;
  render();
  try {
    const payload = await api(`/api/admin/trees/${treeId}`);
    state.admin.trees.selectedTree = payload.tree;
    state.admin.trees.selectedCollaborators = payload.collaborators;
  } catch (error) {
    showToast(error.message || 'Could not load this tree.', { type: 'error' });
    state.admin.section = 'trees';
  } finally {
    state.admin.trees.selectedLoading = false;
    render();
  }
}

// `onBack()` lets the caller (main.js) decide which section to return to and
// load its data, since a tree can be opened either from the Family Trees
// list or the Family Members list - avoids this module importing the
// members module back (which imports this one) just to return to it.
// Falls back to the plain Family Trees list if no override is given.
export function attachTreeDetailListeners(state, render, onBack) {
  const treeId = state.admin.trees.selectedTreeId;

  document.querySelector('[data-breadcrumb-id="admin-tree-back-btn"]').addEventListener('click', () => {
    const cameFromMembers = state.admin.trees.cameFromMembers;
    state.admin.trees.cameFromMembers = false;
    if (cameFromMembers && onBack) {
      onBack();
      return;
    }
    state.admin.section = 'trees';
    render();
    loadTrees(state, render);
  });

  document.querySelector('#admin-tree-view-btn')?.addEventListener('click', async (event) => {
    const mount = document.querySelector('#admin-tree-viewer-mount');
    const btn = event.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Loading tree…';
    try {
      const payload = await api(`/api/admin/trees/${treeId}/data`);
      mount.hidden = false;
      // The `f3` class is required, not cosmetic: every card layout rule
      // (box-sizing, gender fill colors, svg sizing - see
      // src/styles/family-chart.css) is scoped under `.f3`, matching how
      // the real viewer's #FamilyChart div is classed in main.js. Without
      // it, cards render at the wrong intrinsic size and visually overlap
      // even though their computed tree positions are correct.
      mount.innerHTML = '<div id="admin-tree-viewer-chart" class="f3 admin-tree-viewer-chart"></div>';
      await nextFrame();
      // Read-only: no editTree() is attached, mirroring how a viewer-role
      // collaborator's own tree page already renders (see main.js renderChart()).
      state.admin.trees.viewerChart = f3
        .createChart('#admin-tree-viewer-chart', payload.data)
        .setTransitionTime(1000)
        .setCardXSpacing(250)
        .setCardYSpacing(150);
      state.admin.trees.viewerChart.setCard(f3.CardHtml).setCardDisplay([['first name', 'last name'], ['birthday', 'location']]);
      state.admin.trees.viewerChart.updateTree({ initial: true });
      btn.hidden = true;
    } catch (error) {
      showToast(error.message || 'Could not load tree data.', { type: 'error' });
      btn.disabled = false;
      btn.textContent = 'View tree (read-only)';
    }
  });
}
