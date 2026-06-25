import '../src/styles/family-chart.css';
import './styles.css';
import f3 from '../src/index.ts';
import { buildAllNodesGraphData, renderAllNodesGraph } from './allNodesGraph.js';
import { showConfirmDialog, showToast } from './ui.js';
const app = document.querySelector('#app');

const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

const OTP_DURATION_SECONDS = 5 * 60;

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
  authStep: 'email',
  authEmail: '',
  otpResendAt: 0,
  otpCountdownTimer: null,
};

async function api(path, options = {}, _isRetry = false) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: isFormData ? { ...(options.headers || {}) } : { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (response.status === 401 && !_isRetry && path !== '/api/auth/refresh') {
    const refreshed = await tryRefreshSession();
    if (refreshed) return api(path, options, true);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function tryRefreshSession() {
  try {
    const response = await fetch(apiUrl('/api/auth/refresh'), { method: 'POST', credentials: 'include' });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

function render() {
  if (!state.user) return renderAuth();
  return renderDashboard();
}

function renderAuth() {
  if (state.authStep === 'otp') return renderOtpStep();
  return renderEmailStep();
}

function renderEmailStep() {
  app.innerHTML = `
    <main class="auth-layout">
      <section class="card">
        <h1>Family Chart Login</h1>
        <p class="muted">Enter your email and we'll send you a one-time verification code.</p>
        <form id="request-otp-form" class="stack">
          <label>Email <input type="email" name="email" value="${escapeHtml(state.authEmail)}" required /></label>
          <button type="submit" id="send-otp-btn">Send Code</button>
        </form>
        <p id="auth-error" class="error"></p>
      </section>
    </main>
  `;

  document.querySelector('#request-otp-form').addEventListener('submit', handleRequestOtp);
}

function renderOtpStep() {
  app.innerHTML = `
    <main class="auth-layout">
      <section class="card">
        <h1>Enter verification code</h1>
        <p class="muted">We sent a 6-digit code to <strong>${escapeHtml(state.authEmail)}</strong>. It expires in 5 minutes.</p>
        <form id="verify-otp-form" class="stack">
          <label>Verification code
            <input
              type="text"
              name="otp"
              class="otp-input"
              inputmode="numeric"
              pattern="\\d{6}"
              maxlength="6"
              autocomplete="one-time-code"
              required
            />
          </label>
          <button type="submit" id="verify-otp-btn">Verify</button>
        </form>
        <div class="row otp-actions">
          <button type="button" id="change-email-btn" class="secondary">Use a different email</button>
          <button type="button" id="resend-otp-btn" class="secondary" disabled>Resend code (<span id="otp-countdown">05:00</span>)</button>
        </div>
        <p id="auth-error" class="error"></p>
      </section>
    </main>
  `;

  document.querySelector('#verify-otp-form').addEventListener('submit', handleVerifyOtp);
  document.querySelector('#change-email-btn').addEventListener('click', handleChangeEmail);
  document.querySelector('#resend-otp-btn').addEventListener('click', handleResendOtp);
  document.querySelector('.otp-input').focus();

  startOtpCountdown();
}

function startOtpCountdown() {
  stopOtpCountdown();
  state.otpResendAt = Date.now() + OTP_DURATION_SECONDS * 1000;
  updateOtpCountdownDisplay();
  state.otpCountdownTimer = setInterval(updateOtpCountdownDisplay, 1000);
}

function stopOtpCountdown() {
  if (state.otpCountdownTimer) {
    clearInterval(state.otpCountdownTimer);
    state.otpCountdownTimer = null;
  }
}

function updateOtpCountdownDisplay() {
  const countdownEl = document.querySelector('#otp-countdown');
  const resendBtn = document.querySelector('#resend-otp-btn');
  if (!countdownEl || !resendBtn) return stopOtpCountdown();

  const remainingMs = state.otpResendAt - Date.now();
  if (remainingMs <= 0) {
    stopOtpCountdown();
    resendBtn.disabled = false;
    resendBtn.textContent = 'Resend code';
    return;
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  countdownEl.textContent = `${minutes}:${seconds}`;
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
            <button type="submit" id="import-csv-btn" class="secondary">Import CSV</button>
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
    const deleteButton =
      tree.role === 'owner'
        ? `<button type="button" data-tree-id="${tree.id}" data-tree-name="${escapeHtml(tree.name)}" class="tree-delete-btn secondary" aria-label="Delete ${escapeHtml(tree.name)}">Delete</button>`
        : '';
    li.innerHTML = `
      <div class="tree-item-main">
        <button data-tree-id="${tree.id}" class="tree-link">${escapeHtml(tree.name)}</button>
        <small class="muted">${escapeHtml(tree.role)}</small>
      </div>
      ${deleteButton}`;
    treeList.appendChild(li);
  }

  treeList.querySelectorAll('.tree-link').forEach((button) => {
    button.addEventListener('click', () => loadTree(Number(button.dataset.treeId)));
  });

  treeList.querySelectorAll('.tree-delete-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      promptDeleteTree(Number(button.dataset.treeId), button.dataset.treeName, button);
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clearSelectedTreeView() {
  cleanupAllNodesGraph();
  state.selectedTreeId = null;
  state.selectedTreeRole = null;
  state.selectedTreeData = [];
  state.chart = null;
  state.editor = null;
  state.viewMode = 'focused';
  state.focusedMainId = null;

  const title = document.querySelector('#tree-title');
  const roleLabel = document.querySelector('#tree-role');
  const saveButton = document.querySelector('#save-btn');
  const chartContainer = document.querySelector('#FamilyChart');
  const viewModeToggle = document.querySelector('#view-mode-toggle');

  if (title) title.textContent = 'Select a tree';
  if (roleLabel) roleLabel.textContent = '';
  if (saveButton) saveButton.disabled = true;
  if (chartContainer) chartContainer.innerHTML = '';
  if (viewModeToggle) viewModeToggle.innerHTML = '';
}

function promptDeleteTree(treeId, treeName, triggerButton) {
  showConfirmDialog({
    message: `Are you sure you want to delete "${treeName}"? This action cannot be undone.`,
    onConfirm: () => handleDeleteTree(treeId, treeName, triggerButton),
  });
}

async function handleDeleteTree(treeId, treeName, triggerButton) {
  const status = document.querySelector('#status');
  if (triggerButton) triggerButton.disabled = true;
  if (status) status.textContent = 'Deleting...';

  try {
    /** @type {import('./ui.js').DeleteTreeResponse} */
    await api(`/api/trees/${treeId}`, { method: 'DELETE' });

    state.trees = state.trees.filter((tree) => tree.id !== treeId);

    if (state.selectedTreeId === treeId) {
      clearSelectedTreeView();
    }

    renderTreeList();
    if (status) status.textContent = '';
    showToast('Family tree deleted successfully.');
  } catch (error) {
    if (status) status.textContent = error.message || 'Delete failed.';
    showToast(error.message || 'Delete failed.', { type: 'error' });
    if (triggerButton) triggerButton.disabled = false;
    throw error;
  }
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

async function handleRequestOtp(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = String(form.get('email') || '').trim();
  const submitBtn = document.querySelector('#send-otp-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';
  try {
    await api('/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    state.authEmail = email;
    state.authStep = 'otp';
    render();
    showToast('Verification code sent.');
  } catch (error) {
    errorEl.textContent = error.message;
    showToast(error.message || 'Failed to send code.', { type: 'error' });
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Code';
  }
}

async function handleVerifyOtp(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const otp = String(form.get('otp') || '').trim();
  const submitBtn = document.querySelector('#verify-otp-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying...';
  try {
    await api('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email: state.authEmail, otp }),
    });
    stopOtpCountdown();
    state.authStep = 'email';
    state.authEmail = '';
    await loadSession();
  } catch (error) {
    errorEl.textContent = error.message;
    showToast(error.message || 'Verification failed.', { type: 'error' });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Verify';
  }
}

async function handleResendOtp() {
  const resendBtn = document.querySelector('#resend-otp-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  resendBtn.disabled = true;
  resendBtn.textContent = 'Sending...';
  try {
    await api('/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email: state.authEmail }),
    });
    startOtpCountdown();
    showToast('Verification code resent.');
  } catch (error) {
    errorEl.textContent = error.message;
    showToast(error.message || 'Failed to resend code.', { type: 'error' });
    resendBtn.disabled = false;
    resendBtn.textContent = 'Resend code';
  }
}

function handleChangeEmail() {
  stopOtpCountdown();
  state.authStep = 'email';
  render();
}

async function handleLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  stopOtpCountdown();
  state.user = null;
  state.trees = [];
  state.selectedTreeId = null;
  state.authStep = 'email';
  state.authEmail = '';
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
