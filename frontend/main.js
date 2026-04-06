import '/src/styles/family-chart.css';
import './styles.css';
import f3 from '/src/index.ts';
import { buildAllNodesGraphData, renderAllNodesGraph } from './allNodesGraph.js';

const app = document.querySelector('#app');

const state = {
  user: null,
  trees: [],
  selectedTreeId: null,
  selectedTreeRole: null,
  selectedTreeData: [],
  chart: null,
  editor: null,
  viewMode: 'focused',
  focusedMainId: null,
  allNodesCleanup: null,
};

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: 'include',
    headers: isFormData ? { ...(options.headers || {}) } : { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function render() {
  if (!state.user) return renderAuth();
  return renderDashboard();
}

function renderAuth() {
  app.innerHTML = `
    <main class="auth-layout">
      <section class="card">
        <h1>Family Chart Login</h1>
        <form id="login-form" class="stack">
          <label>Email <input type="email" name="email" required /></label>
          <label>Password <input type="password" name="password" minlength="8" required /></label>
          <button type="submit">Login</button>
        </form>
      </section>
      <section class="card">
        <h2>Create Account</h2>
        <form id="register-form" class="stack">
          <label>Email <input type="email" name="email" required /></label>
          <label>Password <input type="password" name="password" minlength="8" required /></label>
          <button type="submit">Register</button>
        </form>
      </section>
      <p id="auth-error" class="error"></p>
    </main>
  `;

  document.querySelector('#login-form').addEventListener('submit', handleLogin);
  document.querySelector('#register-form').addEventListener('submit', handleRegister);
}

function renderDashboard() {
  app.innerHTML = `
    <main class="dashboard">
      <aside class="sidebar card">
        <div class="row">
          <h2>Your Trees</h2>
          <button id="logout-btn" class="secondary">Logout</button>
        </div>
        <p class="muted">${state.user.email}</p>
        <form id="create-tree-form" class="row">
          <input name="name" placeholder="New tree name" maxlength="120" required />
          <button type="submit">Create</button>
        </form>
        <form id="import-csv-form" class="stack import-stack">
          <label class="muted">Import CSV
            <input type="file" id="csv-file-input" accept=".csv,text/csv" />
          </label>
          <div class="row import-actions">
            <button type="submit" id="import-csv-btn">Import CSV</button>
            <button type="button" id="download-csv-template-btn" class="secondary">Download Template</button>
          </div>
          <p class="import-help">
            Required: <code>id</code>, <code>first_name</code><br/>
            Relations: <code>father_id</code>, <code>mother_id</code>, <code>spouse_ids</code>, <code>child_ids</code><br/>
            Use <code>;</code> to separate multiple IDs in <code>spouse_ids</code> and <code>child_ids</code>.
          </p>
        </form>
        <ul id="tree-list" class="tree-list"></ul>
      </aside>
      <section class="content card">
        <div class="row">
          <h2 id="tree-title">Select a tree</h2>
          <div class="row">
            <span id="tree-role" class="badge"></span>
            <button id="save-btn" disabled>Save</button>
          </div>
        </div>
        <div id="view-mode-toggle" class="row"></div>
        <div id="status" class="muted"></div>
        <div id="FamilyChart" class="f3 chart-container"></div>
      </section>
    </main>
  `;

  document.querySelector('#logout-btn').addEventListener('click', handleLogout);
  document.querySelector('#create-tree-form').addEventListener('submit', handleCreateTree);
  document.querySelector('#import-csv-form').addEventListener('submit', handleImportCsv);
  document.querySelector('#download-csv-template-btn').addEventListener('click', handleDownloadCsvTemplate);
  document.querySelector('#save-btn').addEventListener('click', handleSaveTree);
  renderTreeList();
}

function renderTreeList() {
  const treeList = document.querySelector('#tree-list');
  treeList.innerHTML = '';

  for (const tree of state.trees) {
    const li = document.createElement('li');
    li.className = 'tree-item';
    li.innerHTML = `<button data-tree-id="${tree.id}" class="tree-link">${tree.name}</button>
      <small class="muted">${tree.role}</small>`;
    treeList.appendChild(li);
  }

  treeList.querySelectorAll('.tree-link').forEach((button) => {
    button.addEventListener('click', () => loadTree(Number(button.dataset.treeId)));
  });
}

function renderChart() {
  cleanupAllNodesGraph();
  if (state.viewMode === 'all-nodes') {
    renderAllNodesMode();
    setupViewModeToggle();
    return;
  }

  const container = document.querySelector('#FamilyChart');
  container.innerHTML = '';
  const saveButton = document.querySelector('#save-btn');
  const roleLabel = document.querySelector('#tree-role');

  roleLabel.textContent = state.selectedTreeRole || '';
  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';
  saveButton.disabled = !canEdit;

  // Match examples/create-tree.html — same card/edit wiring as the parent demo.
  state.chart = f3
    .createChart('#FamilyChart', state.selectedTreeData)
    .setTransitionTime(1000)
    .setCardXSpacing(250)
    .setCardYSpacing(150);

  const card = state.chart.setCard(f3.CardHtml).setCardDisplay([['first name', 'last name'], ['birthday', 'location']]);

  if (canEdit) {
    state.editor = state.chart
      .editTree()
      .setFields(['first name', 'last name', 'birthday', 'location', 'notes', 'avatar'])
      .setEditFirst(true)
      .setCardClickOpen(card);
  } else {
    state.editor = null;
  }

  state.chart.updateTree({
    initial: true,
    tree_position: 'inherit',
  });
  if (canEdit && state.editor) {
    const main = state.chart.getMainDatum();
    if (main) {
      state.focusedMainId = main.id;
      state.editor.open(main);
      state.chart.updateTree({
        initial: true,
        tree_position: 'inherit',
      });
    }
  } else if (state.chart) {
    const main = state.chart.getMainDatum();
    state.focusedMainId = main?.id || state.focusedMainId;
  }

  setupViewModeToggle();
}

function setupViewModeToggle() {
  const cont = document.querySelector('#view-mode-toggle');
  cont.innerHTML = '';

  cont.innerHTML = `
    <div class="row">
      <button id="focused-mode-btn" class="secondary">Focused</button>
      <button id="all-nodes-mode-btn" class="secondary">All Nodes</button>
    </div>
  `;

  const focusedBtn = document.querySelector('#focused-mode-btn');
  const allNodesBtn = document.querySelector('#all-nodes-mode-btn');
  const saveBtn = document.querySelector('#save-btn');
  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';

  const syncModeButtons = () => {
    focusedBtn.disabled = state.viewMode === 'focused';
    allNodesBtn.disabled = state.viewMode === 'all-nodes';
    saveBtn.disabled = !canEdit || state.viewMode === 'all-nodes';
  };

  focusedBtn.addEventListener('click', () => {
    if (state.chart?.getMainDatum && state.viewMode === 'focused') {
      const currentMain = state.chart.getMainDatum();
      if (currentMain?.id) state.focusedMainId = currentMain.id;
    }
    state.viewMode = 'focused';
    renderChart();
    syncModeButtons();
  });

  allNodesBtn.addEventListener('click', () => {
    if (state.chart?.getMainDatum && state.viewMode === 'focused') {
      const currentMain = state.chart.getMainDatum();
      if (currentMain?.id) state.focusedMainId = currentMain.id;
    }
    state.viewMode = 'all-nodes';
    renderChart();
    syncModeButtons();
  });

  syncModeButtons();
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
      }),
    });
    await loadSession();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
      }),
    });
    await loadSession();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

async function handleLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  state.trees = [];
  state.selectedTreeId = null;
  render();
}

async function handleCreateTree(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const name = String(form.get('name') || '').trim();
  if (!name) return;

  await api('/api/trees', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

  event.target.reset();
  await loadTrees();
}

async function handleSaveTree() {
  if (state.viewMode === 'all-nodes') return;
  const status = document.querySelector('#status');
  status.textContent = 'Saving...';

  const dataToSave = state.editor?.exportData ? state.editor.exportData() : state.selectedTreeData;
  await api(`/api/trees/${state.selectedTreeId}`, {
    method: 'PUT',
    body: JSON.stringify({ json_data: dataToSave }),
  });
  status.textContent = 'Saved successfully.';
}

async function handleImportCsv(event) {
  event.preventDefault();
  const status = document.querySelector('#status');
  if (!state.selectedTreeId) {
    status.textContent = 'Select a tree before importing.';
    return;
  }

  const fileInput = document.querySelector('#csv-file-input');
  const file = fileInput?.files?.[0];
  if (!file) {
    status.textContent = 'Choose a CSV file to import.';
    return;
  }

  try {
    status.textContent = 'Importing CSV...';
    const formData = new FormData();
    formData.append('file', file);
    const result = await api(`/api/trees/${state.selectedTreeId}/import-csv`, {
      method: 'POST',
      body: formData,
    });
    await loadTree(state.selectedTreeId);
    status.textContent = `Imported ${result.imported_count} rows successfully.`;
  } catch (error) {
    status.textContent = error.message || 'Import failed.';
  }
}

function handleDownloadCsvTemplate() {
  const lines = [
    'id,first_name,last_name,birthday,location,notes,avatar,gender,father_id,mother_id,spouse_ids,child_ids',
    'p1,John,Doe,1985,New York,"Main person note",,M,p2,p3,p4,c1;c2',
    'p4,Jane,Doe,1987,New York,"Spouse note",,F,,,p1,c1;c2',
    'p2,Robert,Doe,1960,Boston,, ,M,,,p3,p1',
    'p3,Mary,Doe,1962,Boston,, ,F,,,p2,p1',
    'c1,Chris,Doe,2010,Chicago,, ,M,p1,p4,,',
    'c2,Emma,Doe,2012,Chicago,, ,F,p1,p4,,',
  ];
  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'family-import-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function loadSession() {
  try {
    const payload = await api('/api/auth/me');
    state.user = payload.user;
    await loadTrees();
    render();
  } catch (_error) {
    state.user = null;
    render();
  }
}

async function loadTrees() {
  const payload = await api('/api/trees');
  state.trees = payload.trees;
  if (state.user) render();
}

async function loadTree(treeId) {
  cleanupAllNodesGraph();
  const payload = await api(`/api/trees/${treeId}`);
  state.selectedTreeId = treeId;
  state.selectedTreeRole = payload.role;
  state.selectedTreeData = payload.data;
  state.viewMode = 'focused';
  state.focusedMainId = payload?.data?.[0]?.id || null;
  document.querySelector('#tree-title').textContent = payload.tree.name;
  document.querySelector('#status').textContent = '';
  renderChart();
}

function renderAllNodesMode() {
  const graphData = buildAllNodesGraphData(state.selectedTreeData);
  state.chart = null;
  state.editor = null;
  state.allNodesCleanup = renderAllNodesGraph('#FamilyChart', graphData);
}

function cleanupAllNodesGraph() {
  if (!state.allNodesCleanup) return;
  state.allNodesCleanup();
  state.allNodesCleanup = null;
}

loadSession();
