import '../src/styles/family-chart.css';
import './styles.css';
import { Amplify } from 'aws-amplify';
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  confirmSignIn,
  signInWithRedirect,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  resetPassword,
  confirmResetPassword,
  setUpTOTP,
  verifyTOTPSetup,
  updateMFAPreference,
  fetchMFAPreference,
} from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import QRCode from 'qrcode';
import f3 from '../src/index.ts';
import { buildAllNodesGraphData, renderAllNodesGraph } from './allNodesGraph.js';
import { showConfirmDialog, showToast, showModal } from './ui.js';
import { escapeHtml, downloadJson, downloadBlob, slugifyFilename } from './utils.js';
import { icon } from './icons.js';
import {
  renderSidebarNav,
  renderMobileTopbar,
  renderPageHeader,
  renderCreateTreeCard,
  renderTreesToolbarRow,
  renderTreeCard,
  renderEmptyState,
  renderSkeletonGrid,
  renderTreeViewerHeader,
  renderViewModeToggle,
  renderShareModalBody,
  renderRenameModalBody,
} from './components.js';

const app = document.querySelector('#app');

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_OAUTH_DOMAIN,
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: [`${window.location.origin}/`],
          redirectSignOut: [`${window.location.origin}/`],
          responseType: 'code',
        },
      },
    },
  },
});

const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

const state = {
  user: null,
  trees: [],
  treesLoading: false,
  treesLoaded: false,
  treeSearch: '',
  treeSort: 'updated',
  renamingTreeId: null,
  sidebarOpen: false,
  selectedTreeId: null,
  selectedTreeRole: null,
  selectedTreeName: '',
  selectedTreeData: [],
  chart: null,
  editor: null,
  viewMode: 'focused',
  focusedMainId: null,
  allNodesCleanup: null,
  authStep: 'signIn',
  authEmail: '',
  totpSetup: null,
  dashboardView: 'trees',
  // True right after the browser bounces back from the Cognito Hosted UI
  // (Google redirect), before Amplify finishes exchanging the ?code= for tokens.
  oauthInProgress: new URLSearchParams(window.location.search).has('code'),
  mfa: {
    status: 'unknown', // 'unknown' | 'enabled' | 'disabled'
    loading: false,
    error: '',
    success: '',
    enrollment: null, // { secret, uri, qrDataUrl }
  },
};

const AUTH_ERROR_MESSAGES = {
  CodeMismatchException: 'That code is incorrect. Check your authenticator app and try again.',
  ExpiredCodeException: 'That code expired. Generate a new one and try again.',
  NotAuthorizedException: 'Incorrect email or password, or your session has expired. Please try again.',
  LimitExceededException: 'Too many attempts. Please wait a few minutes and try again.',
  TooManyRequestsException: 'Too many requests. Please wait a moment and try again.',
  EnableSoftwareTokenMFAException: 'Could not set up the authenticator app. Please try again.',
  SoftwareTokenMFANotFoundException: 'No authenticator app is registered yet. Start setup again.',
  UserNotFoundException: 'No account found with that email.',
  UsernameExistsException:
    'An account with that email already exists. Try signing in, or use "Continue with Google" or "Forgot password" instead.',
  InvalidPasswordException: 'Password does not meet the requirements.',
  UserLambdaValidationException: "We couldn't sign you in with Google right now. Please try again, or sign in with email and password.",
};

// Official Google "G" logo mark, per https://developers.google.com/identity/branding-guidelines.
const GOOGLE_LOGO_SVG = `
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73v2.27h2.92c1.71-1.57 2.69-3.89 2.69-6.64z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"/>
    <path fill="#FBBC05" d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.997 8.997 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.34z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
  </svg>
`;

// Dropdown menus are closed by default on every render, so a single delegated
// listener registered once is enough to close whichever one is open.
document.addEventListener('click', (event) => {
  if (event.target.closest('.dropdown-menu') || event.target.closest('[data-menu-trigger]')) return;
  document.querySelectorAll('.dropdown-menu.open').forEach((menu) => menu.classList.remove('open'));
});

// Fires once Amplify finishes exchanging the Hosted UI's ?code= for tokens
// after a Google sign-in redirect (success or failure).
Hub.listen('auth', ({ payload }) => {
  if (payload.event === 'signInWithRedirect') {
    state.oauthInProgress = false;
    loadSession();
  } else if (payload.event === 'signInWithRedirect_failure') {
    state.oauthInProgress = false;
    state.user = null;
    render();
    showToast(authErrorMessage(payload.data?.error), { type: 'error' });
  }
});

async function getAuthHeader() {
  try {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString();
    return idToken ? { Authorization: `Bearer ${idToken}` } : {};
  } catch (_error) {
    return {};
  }
}

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const authHeader = await getAuthHeader();
  const response = await fetch(apiUrl(path), {
    headers: isFormData
      ? { ...authHeader, ...(options.headers || {}) }
      : { 'Content-Type': 'application/json', ...authHeader, ...(options.headers || {}) },
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
  if (state.oauthInProgress) return renderOauthLoadingStep();
  if (state.authStep === 'signUp') return renderSignUpStep();
  if (state.authStep === 'confirmSignUp') return renderConfirmSignUpStep();
  if (state.authStep === 'mfaCode') return renderMfaStep();
  if (state.authStep === 'forgotPassword') return renderForgotPasswordStep();
  if (state.authStep === 'resetPassword') return renderResetPasswordStep();
  return renderSignInStep();
}

// Shared shell for every auth screen: brand mark + contextual heading/subtitle,
// so the dark "premium SaaS" card chrome, background photo, and entrance
// animation stay consistent across sign-in/sign-up/MFA/reset rather than
// duplicated in each render*Step.
function renderAuthShell(heading, subtitleHtml, bodyHtml) {
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card">
        <div class="auth-brand">
          <span class="auth-brand-icon">${icon('logo')}</span>
          <h1 class="auth-brand-title">${heading}</h1>
          <p class="auth-brand-subtitle">${subtitleHtml}</p>
        </div>
        ${bodyHtml}
      </section>
    </main>
  `;
}

// Toggles a submit button between its idle label and a spinner + busy label,
// without touching any of the surrounding auth/business logic.
function setButtonBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.innerHTML = busy ? `<span class="icon-spin">${icon('spinner')}</span><span>${escapeHtml(label)}</span>` : `<span>${escapeHtml(label)}</span>`;
}

function handleTogglePasswordVisibility(event) {
  const btn = event.currentTarget;
  const input = btn.parentElement.querySelector('input');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.innerHTML = showing ? icon('eye') : icon('eyeOff');
  btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

function attachPasswordToggles(root) {
  root.querySelectorAll('.input-toggle-btn').forEach((btn) => btn.addEventListener('click', handleTogglePasswordVisibility));
}

function renderOauthLoadingStep() {
  renderAuthShell(
    'Signing you in',
    'Completing sign-in with Google&hellip;',
    `<p class="muted" style="text-align:center;">Hang tight, this only takes a moment.</p>`
  );
}

function renderSignInStep() {
  renderAuthShell(
    'Welcome Back!',
    'Sign in to your Family Chart account',
    `
      <button type="button" id="google-signin-btn" class="btn-google">
        ${GOOGLE_LOGO_SVG}
        <span class="btn-label">Continue with Google</span>
      </button>
      <div class="auth-divider"><span>OR</span></div>
      <form id="sign-in-form" class="stack auth-form">
        <label>Email
          <span class="input-icon-group">
            <span class="input-leading-icon">${icon('mail')}</span>
            <input type="email" name="email" value="${escapeHtml(state.authEmail)}" placeholder="Enter your email" required />
          </span>
        </label>
        <label>Password
          <span class="input-icon-group">
            <span class="input-leading-icon">${icon('lock')}</span>
            <input type="password" name="password" class="has-trailing-icon" placeholder="Enter your password" required />
            <button type="button" class="input-toggle-btn" aria-label="Show password">${icon('eye')}</button>
          </span>
        </label>
        <button type="submit" id="sign-in-btn" class="btn-auth"><span>Sign In</span></button>
      </form>
      <div class="auth-row-between">
        <label class="auth-checkbox">
          <input type="checkbox" />
          <span>Remember me</span>
        </label>
        <button type="button" id="go-forgot-password-btn" class="auth-link-btn">Forgot password?</button>
      </div>
      <p class="auth-footnote">Don't have an account? <button type="button" id="go-sign-up-btn" class="auth-link-btn">Create account</button></p>
      <p id="auth-error" class="error"></p>
    `
  );

  document.querySelector('#google-signin-btn').addEventListener('click', handleGoogleSignIn);
  document.querySelector('#sign-in-form').addEventListener('submit', handleSignIn);
  attachPasswordToggles(document.querySelector('#sign-in-form'));
  document.querySelector('#go-sign-up-btn').addEventListener('click', () => {
    state.authStep = 'signUp';
    render();
  });
  document.querySelector('#go-forgot-password-btn').addEventListener('click', () => {
    state.authStep = 'forgotPassword';
    render();
  });
}

function renderSignUpStep() {
  renderAuthShell(
    'Create your account',
    'Start building your Family Chart today',
    `
      <p class="muted">Password must be at least 12 characters and include upper/lowercase letters, a number, and a symbol.</p>
      <form id="sign-up-form" class="stack auth-form">
        <label>Email
          <span class="input-icon-group">
            <span class="input-leading-icon">${icon('mail')}</span>
            <input type="email" name="email" value="${escapeHtml(state.authEmail)}" placeholder="Enter your email" required />
          </span>
        </label>
        <label>Password
          <span class="input-icon-group">
            <span class="input-leading-icon">${icon('lock')}</span>
            <input type="password" name="password" class="has-trailing-icon" placeholder="Create a password" minlength="12" required />
            <button type="button" class="input-toggle-btn" aria-label="Show password">${icon('eye')}</button>
          </span>
        </label>
        <button type="submit" id="sign-up-btn" class="btn-auth"><span>Sign Up</span></button>
      </form>
      <p class="auth-footnote">Already have an account? <button type="button" id="go-sign-in-btn" class="auth-link-btn">Sign in</button></p>
      <p id="auth-error" class="error"></p>
    `
  );

  document.querySelector('#sign-up-form').addEventListener('submit', handleSignUp);
  attachPasswordToggles(document.querySelector('#sign-up-form'));
  document.querySelector('#go-sign-in-btn').addEventListener('click', () => {
    state.authStep = 'signIn';
    render();
  });
}

function renderConfirmSignUpStep() {
  renderAuthShell(
    'Verify your email',
    `We sent a verification code to <strong>${escapeHtml(state.authEmail)}</strong>.`,
    `
      <form id="confirm-sign-up-form" class="stack auth-form">
        <label>Verification code
          <input type="text" name="code" class="otp-input" inputmode="numeric" autocomplete="one-time-code" required />
        </label>
        <button type="submit" id="confirm-sign-up-btn" class="btn-auth"><span>Verify</span></button>
      </form>
      <div class="auth-links">
        <button type="button" id="resend-code-btn" class="auth-link-btn">Resend code</button>
      </div>
      <p id="auth-error" class="error"></p>
    `
  );

  document.querySelector('#confirm-sign-up-form').addEventListener('submit', handleConfirmSignUp);
  document.querySelector('#resend-code-btn').addEventListener('click', handleResendConfirmationCode);
}

function renderMfaStep() {
  const setupBlock = state.totpSetup
    ? `
      <p class="muted">Scan this QR code with your authenticator app, or enter the setup key manually, then enter the 6-digit code it generates.</p>
      <div class="qr-code-wrap"><img src="${state.totpSetup.qrDataUrl}" alt="TOTP QR code" width="180" height="180" /></div>
      <p class="totp-secret">Setup key: ${escapeHtml(state.totpSetup.secret)}</p>
    `
    : '';

  renderAuthShell(
    state.totpSetup ? 'Set up authenticator app' : 'Multi-factor verification',
    state.totpSetup
      ? 'Scan the QR code below to finish setting up your authenticator app.'
      : 'Enter the 6-digit code from your authenticator app.',
    `
      ${setupBlock}
      <form id="mfa-form" class="stack auth-form">
        <label>Authenticator code
          <input type="text" name="code" class="otp-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required />
        </label>
        <button type="submit" id="mfa-submit-btn" class="btn-auth"><span>Verify</span></button>
      </form>
      <p id="auth-error" class="error"></p>
    `
  );

  document.querySelector('#mfa-form').addEventListener('submit', handleMfaSubmit);
}

function renderForgotPasswordStep() {
  renderAuthShell(
    'Reset your password',
    "We'll email you a code to reset your password.",
    `
      <form id="forgot-password-form" class="stack auth-form">
        <label>Email
          <span class="input-icon-group">
            <span class="input-leading-icon">${icon('mail')}</span>
            <input type="email" name="email" value="${escapeHtml(state.authEmail)}" placeholder="Enter your email" required />
          </span>
        </label>
        <button type="submit" id="forgot-password-btn" class="btn-auth"><span>Send reset code</span></button>
      </form>
      <div class="auth-links">
        <button type="button" id="go-sign-in-btn" class="auth-link-btn">Back to sign in</button>
      </div>
      <p id="auth-error" class="error"></p>
    `
  );

  document.querySelector('#forgot-password-form').addEventListener('submit', handleForgotPasswordRequest);
  document.querySelector('#go-sign-in-btn').addEventListener('click', () => {
    state.authStep = 'signIn';
    render();
  });
}

function renderResetPasswordStep() {
  renderAuthShell(
    'Enter reset code',
    `We sent a reset code to <strong>${escapeHtml(state.authEmail)}</strong>.`,
    `
      <form id="reset-password-form" class="stack auth-form">
        <label>Reset code
          <input type="text" name="code" class="otp-input" inputmode="numeric" autocomplete="one-time-code" required />
        </label>
        <label>New password
          <span class="input-icon-group">
            <span class="input-leading-icon">${icon('lock')}</span>
            <input type="password" name="newPassword" class="has-trailing-icon" placeholder="Enter a new password" minlength="12" required />
            <button type="button" class="input-toggle-btn" aria-label="Show password">${icon('eye')}</button>
          </span>
        </label>
        <button type="submit" id="reset-password-btn" class="btn-auth"><span>Reset password</span></button>
      </form>
      <p id="auth-error" class="error"></p>
    `
  );

  document.querySelector('#reset-password-form').addEventListener('submit', handleResetPasswordConfirm);
  attachPasswordToggles(document.querySelector('#reset-password-form'));
}

// ---------------------------------------------------------------------------
// Dashboard shell
// ---------------------------------------------------------------------------

function renderDashboard() {
  const isSecurityView = state.dashboardView === 'security';
  const isCreateTreeView = !isSecurityView && state.dashboardView === 'createTree';
  const isViewerView = !isSecurityView && !isCreateTreeView && Boolean(state.selectedTreeId);

  app.innerHTML = `
    <div class="app-shell ${state.sidebarOpen ? 'sidebar-open' : ''}">
      ${renderSidebarNav({ email: state.user.email, activeView: isCreateTreeView ? 'trees' : state.dashboardView })}
      <div class="main-area">
        ${renderMobileTopbar()}
        <main class="content">
          ${
            isSecurityView
              ? renderSecuritySettingsMarkup()
              : isCreateTreeView
                ? renderCreateTreePageMarkup()
                : isViewerView
                  ? renderTreeViewerMarkup()
                  : renderTreesLandingMarkup()
          }
        </main>
      </div>
    </div>
  `;

  attachShellListeners();

  if (isSecurityView) {
    attachSecuritySettingsListeners();
    return;
  }

  if (isCreateTreeView) {
    attachCreateTreePageListeners();
    return;
  }

  if (isViewerView) {
    attachTreeViewerListeners();
    renderChart();
    return;
  }

  attachTreesLandingListeners();
  renderTreeGrid();
}

function attachShellListeners() {
  document.querySelector('#logout-btn').addEventListener('click', handleSignOut);
  document.querySelector('#nav-trees-btn').addEventListener('click', () => {
    state.dashboardView = 'trees';
    clearSelectedTreeView();
    setSidebarOpen(false);
    render();
  });
  document.querySelector('#nav-security-btn').addEventListener('click', () => {
    state.dashboardView = 'security';
    setSidebarOpen(false);
    render();
    loadMfaStatus();
  });
  document.querySelector('#sidebar-open-btn')?.addEventListener('click', () => setSidebarOpen(true));
  document.querySelector('#sidebar-close-btn')?.addEventListener('click', () => setSidebarOpen(false));
  document.querySelector('#sidebar-overlay')?.addEventListener('click', () => setSidebarOpen(false));
}

function setSidebarOpen(open) {
  state.sidebarOpen = open;
  document.querySelector('.app-shell')?.classList.toggle('sidebar-open', open);
}

function bindDropdownTriggers(scopeEl) {
  if (!scopeEl) return;
  scopeEl.querySelectorAll('[data-menu-trigger]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const menuId = trigger.dataset.menuTrigger;
      const menu = scopeEl.querySelector(`[data-menu-id="${menuId}"]`);
      if (!menu) return;
      const isOpen = menu.classList.contains('open');
      document.querySelectorAll('.dropdown-menu.open').forEach((m) => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });
  });
}

// ---------------------------------------------------------------------------
// Trees landing (dashboard home)
// ---------------------------------------------------------------------------

function renderTreesLandingMarkup() {
  return `
    ${renderPageHeader({
      title: 'Family Trees',
      subtitle: 'Create, manage, and collaborate on your family trees.',
      primaryActionId: 'new-tree-cta',
      primaryActionLabel: 'New Tree',
    })}
    ${renderTreesToolbarRow({ search: state.treeSearch, sort: state.treeSort })}
    <div id="tree-grid" class="tree-grid"></div>
  `;
}

function attachTreesLandingListeners() {
  document.querySelector('#new-tree-cta').addEventListener('click', () => {
    state.dashboardView = 'createTree';
    render();
  });
  document.querySelector('#tree-search-input').addEventListener('input', (event) => {
    state.treeSearch = event.target.value;
    renderTreeGrid();
  });
  document.querySelector('#tree-sort-select').addEventListener('change', (event) => {
    state.treeSort = event.target.value;
    renderTreeGrid();
  });
}

function renderCreateTreePageMarkup() {
  return `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <button type="button" id="breadcrumb-trees-from-create-btn" class="breadcrumb-link">My Trees</button>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-current">Create a Tree</span>
    </nav>
    ${renderCreateTreeCard()}
  `;
}

function attachCreateTreePageListeners() {
  document.querySelector('#breadcrumb-trees-from-create-btn').addEventListener('click', () => {
    state.dashboardView = 'trees';
    render();
  });
  document.querySelector('#create-tree-form').addEventListener('submit', handleCreateTree);
  document.querySelector('#create-tree-name-input')?.focus();
}

function sortTrees(list, sort) {
  const copy = [...list];
  if (sort === 'alpha') copy.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'created') copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  else copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return copy;
}

function renderTreeGrid() {
  const container = document.querySelector('#tree-grid');
  if (!container) return;

  if (state.treesLoading && !state.treesLoaded) {
    container.innerHTML = renderSkeletonGrid(6);
    return;
  }

  const term = state.treeSearch.trim().toLowerCase();
  const filtered = term ? state.trees.filter((tree) => tree.name.toLowerCase().includes(term)) : state.trees;
  const sorted = sortTrees(filtered, state.treeSort);

  if (sorted.length === 0) {
    container.innerHTML = renderEmptyState({ mode: state.trees.length === 0 ? 'no-trees' : 'no-results' });
    document.querySelector('#empty-create-btn')?.addEventListener('click', () => {
      state.dashboardView = 'createTree';
      render();
    });
    document.querySelector('#empty-clear-search-btn')?.addEventListener('click', () => {
      state.treeSearch = '';
      const searchInput = document.querySelector('#tree-search-input');
      if (searchInput) searchInput.value = '';
      renderTreeGrid();
    });
    return;
  }

  container.innerHTML = sorted
    .map((tree) => renderTreeCard(tree, { renaming: state.renamingTreeId === tree.id }))
    .join('');
  bindTreeGridListeners(container);
}

function bindTreeGridListeners(container) {
  container.querySelectorAll('.tree-open-btn, .tree-card-title').forEach((el) => {
    el.addEventListener('click', () => loadTree(Number(el.dataset.treeId)));
  });

  bindDropdownTriggers(container);

  container.querySelectorAll('.dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('[data-menu-id]');
      const treeId = Number(wrap.dataset.menuId.replace('tree-', ''));
      handleTreeCardAction(btn.dataset.action, treeId);
    });
  });

  container.querySelectorAll('.tree-rename-form').forEach((form) => {
    form.addEventListener('submit', (event) => handleRenameSubmit(event, Number(form.dataset.treeId)));
  });

  container.querySelectorAll('.rename-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.renamingTreeId = null;
      renderTreeGrid();
    });
  });
}

function handleTreeCardAction(action, treeId) {
  if (action === 'export') return handleExportTreeById(treeId);
  if (action === 'rename') {
    state.renamingTreeId = treeId;
    renderTreeGrid();
    return;
  }
  if (action === 'delete') {
    const tree = state.trees.find((t) => t.id === treeId);
    promptDeleteTree(treeId, tree?.name || 'this tree');
  }
}

async function handleRenameSubmit(event, treeId) {
  event.preventDefault();
  const name = String(new FormData(event.target).get('name') || '').trim();
  if (!name) return;

  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await api(`/api/trees/${treeId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    state.renamingTreeId = null;
    if (state.selectedTreeId === treeId) state.selectedTreeName = name;
    await loadTrees();
    showToast('Tree renamed successfully.');
  } catch (error) {
    showToast(error.message || 'Rename failed.', { type: 'error' });
    submitBtn.disabled = false;
  }
}

function promptDeleteTree(treeId, treeName) {
  showConfirmDialog({
    message: `Are you sure you want to delete "${treeName}"? This action cannot be undone.`,
    onConfirm: () => handleDeleteTree(treeId, treeName),
  });
}

async function handleDeleteTree(treeId, treeName) {
  try {
    await api(`/api/trees/${treeId}`, { method: 'DELETE' });
    state.trees = state.trees.filter((tree) => tree.id !== treeId);

    if (state.selectedTreeId === treeId) {
      clearSelectedTreeView();
      render();
    } else {
      renderTreeGrid();
    }

    showToast('Family tree deleted successfully.');
  } catch (error) {
    showToast(error.message || 'Delete failed.', { type: 'error' });
    throw error;
  }
}

async function handleExportTreeById(treeId) {
  try {
    const tree = state.trees.find((t) => t.id === treeId);
    const payload = await api(`/api/trees/${treeId}`);
    downloadJson(`${slugifyFilename(tree?.name || payload.tree.name)}.json`, payload.data);
    showToast('Tree exported successfully.');
  } catch (error) {
    showToast(error.message || 'Export failed.', { type: 'error' });
  }
}

// ---------------------------------------------------------------------------
// Tree viewer
// ---------------------------------------------------------------------------

function renderTreeViewerMarkup() {
  return `
    ${renderTreeViewerHeader({ treeName: state.selectedTreeName, role: state.selectedTreeRole })}
    <div id="view-mode-toggle"></div>
    <div id="FamilyChart" class="f3 chart-container"></div>
  `;
}

function attachTreeViewerListeners() {
  document.querySelector('#breadcrumb-trees-btn').addEventListener('click', () => {
    clearSelectedTreeView();
    render();
  });
  document.querySelector('#save-btn').addEventListener('click', handleSaveTree);
  document.querySelector('#export-tree-btn').addEventListener('click', handleExportCurrentTree);
  document.querySelector('#share-tree-btn')?.addEventListener('click', () => openShareModal(state.selectedTreeId));
  document.querySelector('#import-tree-csv-btn')?.addEventListener('click', () => {
    document.querySelector('#import-tree-csv-input')?.click();
  });
  document.querySelector('#import-tree-csv-input')?.addEventListener('change', handleImportCsv);

  const header = document.querySelector('.viewer-header');
  bindDropdownTriggers(header);
  header?.querySelectorAll('.dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => handleViewerSettingsAction(btn.dataset.action));
  });
}

function handleViewerSettingsAction(action) {
  if (action === 'rename') return openRenameTreeModal();
  if (action === 'delete') return promptDeleteTree(state.selectedTreeId, state.selectedTreeName);
  if (action === 'download-template') return handleDownloadCsvTemplate();
}

function openRenameTreeModal() {
  const treeId = state.selectedTreeId;
  const modal = showModal({ bodyHtml: renderRenameModalBody({ name: state.selectedTreeName }) });

  modal.root.querySelector('#rename-modal-close-btn').addEventListener('click', modal.close);
  modal.root.querySelector('#rename-modal-cancel-btn').addEventListener('click', modal.close);
  modal.root.querySelector('#rename-tree-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(new FormData(event.target).get('name') || '').trim();
    if (!name) return;
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await api(`/api/trees/${treeId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      state.selectedTreeName = name;
      document.querySelector('.viewer-title').textContent = name;
      document.querySelector('.breadcrumb-current').textContent = name;
      modal.close();
      loadTrees();
      showToast('Tree renamed successfully.');
    } catch (error) {
      showToast(error.message || 'Rename failed.', { type: 'error' });
      submitBtn.disabled = false;
    }
  });
}

async function handleSaveTree() {
  if (state.viewMode === 'all-nodes') return;
  const saveBtn = document.querySelector('#save-btn');
  const label = saveBtn.querySelector('span');
  saveBtn.disabled = true;
  if (label) label.textContent = 'Saving...';

  try {
    const dataToSave = state.editor?.exportData ? state.editor.exportData() : state.selectedTreeData;
    await api(`/api/trees/${state.selectedTreeId}`, {
      method: 'PUT',
      body: JSON.stringify({ json_data: dataToSave }),
    });
    showToast('Tree saved successfully.');
  } catch (error) {
    showToast(error.message || 'Save failed.', { type: 'error' });
  } finally {
    const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';
    saveBtn.disabled = !canEdit || state.viewMode === 'all-nodes';
    if (label) label.textContent = 'Save';
  }
}

function handleExportCurrentTree() {
  const data = state.editor?.exportData ? state.editor.exportData() : state.selectedTreeData;
  downloadJson(`${slugifyFilename(state.selectedTreeName)}.json`, data);
  showToast('Tree exported successfully.');
}

// ---------------------------------------------------------------------------
// Share modal (built on the tree_permissions API)
// ---------------------------------------------------------------------------

async function openShareModal(treeId) {
  const treeName = state.selectedTreeName || state.trees.find((t) => t.id === treeId)?.name || '';
  const modal = showModal({
    bodyHtml: renderShareModalBody({ treeName, permissions: [], loading: true, error: '', formError: '' }),
    className: 'modal-share',
  });
  bindShareModalClose(modal);

  await refreshShareModal(modal, treeId, treeName);
}

function bindShareModalClose(modal) {
  modal.root.querySelector('#share-modal-close-btn')?.addEventListener('click', modal.close);
}

async function refreshShareModal(modal, treeId, treeName, formError = '') {
  try {
    const payload = await api(`/api/trees/${treeId}/permissions`);
    modal.setBody(renderShareModalBody({ treeName, permissions: payload.permissions, loading: false, error: '', formError }));
    bindShareModalClose(modal);
    bindShareModalActions(modal, treeId, treeName);
  } catch (error) {
    modal.setBody(
      renderShareModalBody({
        treeName,
        permissions: [],
        loading: false,
        error: error.message || 'Failed to load collaborators.',
        formError: '',
      })
    );
    bindShareModalClose(modal);
  }
}

function bindShareModalActions(modal, treeId, treeName) {
  modal.root.querySelector('#share-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const email = String(new FormData(form).get('email') || '').trim();
    const role = String(new FormData(form).get('role') || 'viewer');
    if (!email) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await api(`/api/trees/${treeId}/share`, { method: 'POST', body: JSON.stringify({ email, role }) });
      showToast(`Shared with ${email}.`);
      await refreshShareModal(modal, treeId, treeName);
      loadTrees();
    } catch (error) {
      submitBtn.disabled = false;
      await refreshShareModal(modal, treeId, treeName, error.message || 'Could not share this tree.');
    }
  });

  modal.root.querySelectorAll('.member-role-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const userId = Number(select.dataset.userId);
      const role = select.value;
      try {
        await api(`/api/trees/${treeId}/share/${userId}`, { method: 'PUT', body: JSON.stringify({ role }) });
        showToast('Role updated.');
        await refreshShareModal(modal, treeId, treeName);
        loadTrees();
      } catch (error) {
        showToast(error.message || 'Could not update role.', { type: 'error' });
        await refreshShareModal(modal, treeId, treeName);
      }
    });
  });

  modal.root.querySelectorAll('[data-remove-user-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = Number(btn.dataset.removeUserId);
      btn.disabled = true;
      try {
        await api(`/api/trees/${treeId}/share/${userId}`, { method: 'DELETE' });
        showToast('Access removed.');
        await refreshShareModal(modal, treeId, treeName);
        loadTrees();
      } catch (error) {
        showToast(error.message || 'Could not remove access.', { type: 'error' });
        btn.disabled = false;
      }
    });
  });
}

function clearSelectedTreeView() {
  cleanupAllNodesGraph();
  state.selectedTreeId = null;
  state.selectedTreeRole = null;
  state.selectedTreeData = [];
  state.selectedTreeName = '';
  state.chart = null;
  state.editor = null;
  state.viewMode = 'focused';
  state.focusedMainId = null;
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

  // Match examples/create-tree.html — same card/edit wiring as the parent demo.
  state.chart = f3
    .createChart('#FamilyChart', state.selectedTreeData)
    .setTransitionTime(1000)
    .setCardXSpacing(250)
    .setCardYSpacing(150);

  const card = state.chart.setCard(f3.CardHtml).setCardDisplay([['first name', 'last name'], ['birthday', 'location']]);

  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';
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
  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';
  cont.innerHTML = renderViewModeToggle({ viewMode: state.viewMode, canEdit });

  const focusedBtn = document.querySelector('#focused-mode-btn');
  const allNodesBtn = document.querySelector('#all-nodes-mode-btn');
  const saveBtn = document.querySelector('#save-btn');

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

function authErrorMessage(error) {
  return AUTH_ERROR_MESSAGES[error?.name] || error?.message || 'Something went wrong. Please try again.';
}

async function handleAuthNextStep(nextStep) {
  if (nextStep.signInStep === 'DONE' || !nextStep.signInStep) {
    state.authStep = 'signIn';
    state.authEmail = '';
    state.totpSetup = null;
    await loadSession();
    return;
  }

  if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
    state.totpSetup = null;
    state.authStep = 'mfaCode';
    render();
    return;
  }

  if (nextStep.signInStep === 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP') {
    const { totpSetupDetails } = nextStep;
    const setupUri = totpSetupDetails.getSetupUri('FamilyChart', state.authEmail);
    const qrDataUrl = await QRCode.toDataURL(setupUri.toString());
    state.totpSetup = { secret: totpSetupDetails.sharedSecret, uri: setupUri.toString(), qrDataUrl };
    state.authStep = 'mfaCode';
    render();
    return;
  }

  if (nextStep.signInStep === 'CONFIRM_SIGN_UP') {
    state.authStep = 'confirmSignUp';
    render();
    return;
  }

  throw new Error(`Unsupported sign-in step: ${nextStep.signInStep}`);
}

async function handleGoogleSignIn() {
  const btn = document.querySelector('#google-signin-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';
  btn.disabled = true;
  btn.querySelector('.btn-label').textContent = 'Redirecting to Google...';
  try {
    await signInWithRedirect({ provider: 'Google' });
  } catch (error) {
    errorEl.textContent = authErrorMessage(error);
    showToast(authErrorMessage(error), { type: 'error' });
    btn.disabled = false;
    btn.querySelector('.btn-label').textContent = 'Continue with Google';
  }
}

async function handleSignIn(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const submitBtn = document.querySelector('#sign-in-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  setButtonBusy(submitBtn, true, 'Signing in...');
  try {
    state.authEmail = email;
    let result;
    try {
      result = await signIn({ username: email, password });
    } catch (error) {
      if (error.name !== 'UserAlreadyAuthenticatedException') throw error;
      // A stale session from an earlier sign-in is still cached locally; clear it and retry once.
      await signOut();
      result = await signIn({ username: email, password });
    }
    if (result.isSignedIn) {
      await handleAuthNextStep({ signInStep: 'DONE' });
    } else {
      await handleAuthNextStep(result.nextStep);
    }
  } catch (error) {
    errorEl.textContent = authErrorMessage(error);
    showToast(authErrorMessage(error), { type: 'error' });
  } finally {
    setButtonBusy(submitBtn, false, 'Sign In');
  }
}

async function handleSignUp(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const submitBtn = document.querySelector('#sign-up-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  setButtonBusy(submitBtn, true, 'Signing up...');
  try {
    const result = await signUp({
      username: email,
      password,
      options: { userAttributes: { email } },
    });
    state.authEmail = email;
    if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
      state.authStep = 'confirmSignUp';
      render();
    } else {
      state.authStep = 'signIn';
      render();
      showToast('Account created. Please sign in.');
    }
  } catch (error) {
    errorEl.textContent = authErrorMessage(error);
    showToast(authErrorMessage(error), { type: 'error' });
  } finally {
    setButtonBusy(submitBtn, false, 'Sign Up');
  }
}

async function handleConfirmSignUp(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const code = String(form.get('code') || '').trim();
  const submitBtn = document.querySelector('#confirm-sign-up-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  setButtonBusy(submitBtn, true, 'Verifying...');
  try {
    await confirmSignUp({ username: state.authEmail, confirmationCode: code });
    state.authStep = 'signIn';
    render();
    showToast('Email verified. Please sign in.');
  } catch (error) {
    errorEl.textContent = authErrorMessage(error);
    showToast(authErrorMessage(error), { type: 'error' });
    setButtonBusy(submitBtn, false, 'Verify');
  }
}

async function handleResendConfirmationCode() {
  try {
    await resendSignUpCode({ username: state.authEmail });
    showToast('Verification code resent.');
  } catch (error) {
    showToast(authErrorMessage(error), { type: 'error' });
  }
}

async function handleMfaSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const code = String(form.get('code') || '').trim();
  const submitBtn = document.querySelector('#mfa-submit-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  setButtonBusy(submitBtn, true, 'Verifying...');
  try {
    const result = await confirmSignIn({ challengeResponse: code });
    if (result.isSignedIn) {
      await handleAuthNextStep({ signInStep: 'DONE' });
    } else {
      await handleAuthNextStep(result.nextStep);
    }
  } catch (error) {
    errorEl.textContent = authErrorMessage(error);
    showToast(authErrorMessage(error), { type: 'error' });
    setButtonBusy(submitBtn, false, 'Verify');
  }
}

function renderSecuritySettingsMarkup() {
  const mfa = state.mfa;
  const errorHtml = mfa.error ? `<p class="error">${escapeHtml(mfa.error)}</p>` : '';
  const successHtml = mfa.success ? `<p class="success">${escapeHtml(mfa.success)}</p>` : '';

  const body = mfa.enrollment
    ? `
      <h2>Set up an authenticator app</h2>
      <p class="muted">Scan the QR code below with your authenticator app, or enter the setup key manually. Then enter the 6-digit code it generates to finish enabling MFA.</p>
      <div class="qr-code-wrap"><img src="${mfa.enrollment.qrDataUrl}" alt="TOTP QR code" width="200" height="200" /></div>
      <p class="totp-secret">Setup key: ${escapeHtml(mfa.enrollment.secret)}</p>
      <form id="mfa-verify-form" class="stack">
        <label>6-digit code
          <input type="text" name="code" class="otp-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required />
        </label>
        <div class="row otp-actions">
          <button type="submit" id="mfa-verify-btn">Verify and enable</button>
          <button type="button" id="mfa-cancel-btn" class="secondary">Cancel</button>
        </div>
      </form>
      ${errorHtml}${successHtml}
    `
    : (() => {
        const statusBadge =
          mfa.status === 'enabled'
            ? `<span class="mfa-status-badge mfa-status-enabled">MFA Enabled</span>`
            : mfa.status === 'disabled'
              ? `<span class="mfa-status-badge mfa-status-disabled">MFA Disabled</span>`
              : `<span class="mfa-status-badge">Checking status...</span>`;

        const actions =
          mfa.status === 'enabled'
            ? `
              <div class="row otp-actions">
                <button type="button" id="mfa-reconfigure-btn" ${mfa.loading ? 'disabled' : ''}>Reconfigure (new device)</button>
                <button type="button" id="mfa-disable-btn" class="secondary" ${mfa.loading ? 'disabled' : ''}>Disable MFA</button>
              </div>
            `
            : `<button type="button" id="mfa-enable-btn" ${mfa.loading || mfa.status === 'unknown' ? 'disabled' : ''}>Enable MFA</button>`;

        return `
          <h2>Multi-factor authentication</h2>
          <p>${statusBadge}</p>
          <p class="muted">Protect your account with a time-based one-time password (TOTP) from an authenticator app.</p>
          <p class="muted">Recommended authenticator apps:</p>
          <ul class="authenticator-app-list muted">
            <li>Google Authenticator</li>
            <li>Microsoft Authenticator</li>
            <li>Authy</li>
          </ul>
          ${actions}
          ${errorHtml}${successHtml}
          ${mfa.loading ? '<p class="muted">Working...</p>' : ''}
        `;
      })();

  return `
    <header class="page-header">
      <div>
        <h1 class="page-title">Security Settings</h1>
        <p class="page-subtitle">Manage multi-factor authentication for your account.</p>
      </div>
    </header>
    <section class="security-panel">${body}</section>
  `;
}

function attachSecuritySettingsListeners() {
  if (state.mfa.enrollment) {
    document.querySelector('#mfa-verify-form').addEventListener('submit', handleVerifyMfaSetup);
    document.querySelector('#mfa-cancel-btn').addEventListener('click', () => {
      state.mfa.enrollment = null;
      state.mfa.error = '';
      render();
    });
    return;
  }

  document.querySelector('#mfa-enable-btn')?.addEventListener('click', handleStartMfaSetup);
  document.querySelector('#mfa-reconfigure-btn')?.addEventListener('click', handleStartMfaSetup);
  document.querySelector('#mfa-disable-btn')?.addEventListener('click', () => {
    showConfirmDialog({
      title: 'Disable MFA',
      message: 'Are you sure you want to disable multi-factor authentication? This will make your account less secure.',
      confirmLabel: 'Disable',
      onConfirm: handleDisableMfa,
    });
  });
}

async function loadMfaStatus() {
  state.mfa.loading = true;
  state.mfa.error = '';
  render();
  try {
    const preference = await fetchMFAPreference();
    state.mfa.status = preference.enabled?.includes('TOTP') ? 'enabled' : 'disabled';
  } catch (error) {
    state.mfa.status = 'disabled';
    state.mfa.error = authErrorMessage(error);
  } finally {
    state.mfa.loading = false;
    render();
  }
}

async function handleStartMfaSetup() {
  state.mfa.loading = true;
  state.mfa.error = '';
  state.mfa.success = '';
  render();
  try {
    const totpSetupDetails = await setUpTOTP();
    const setupUri = totpSetupDetails.getSetupUri('FamilyChart', state.user.email);
    const qrDataUrl = await QRCode.toDataURL(setupUri.toString());
    state.mfa.enrollment = {
      secret: totpSetupDetails.sharedSecret,
      uri: setupUri.toString(),
      qrDataUrl,
    };
  } catch (error) {
    state.mfa.error = authErrorMessage(error);
  } finally {
    state.mfa.loading = false;
    render();
  }
}

async function handleVerifyMfaSetup(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const code = String(form.get('code') || '').trim();
  const submitBtn = document.querySelector('#mfa-verify-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying...';

  try {
    await verifyTOTPSetup({ code });
    await updateMFAPreference({ totp: 'PREFERRED' });
    state.mfa.enrollment = null;
    state.mfa.status = 'enabled';
    state.mfa.error = '';
    state.mfa.success = 'Authenticator app enabled. You will be asked for a code on your next sign-in.';
    showToast('MFA enabled successfully.');
    render();
  } catch (error) {
    state.mfa.error = authErrorMessage(error);
    render();
    const retryBtn = document.querySelector('#mfa-verify-btn');
    if (retryBtn) {
      retryBtn.disabled = false;
      retryBtn.textContent = 'Verify and enable';
    }
  }
}

async function handleDisableMfa() {
  try {
    await updateMFAPreference({ totp: 'DISABLED' });
    state.mfa.status = 'disabled';
    state.mfa.error = '';
    state.mfa.success = 'MFA disabled. You can re-enable it anytime.';
    render();
    showToast('MFA disabled.');
  } catch (error) {
    state.mfa.error = authErrorMessage(error);
    render();
    throw error;
  }
}

async function handleForgotPasswordRequest(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = String(form.get('email') || '').trim();
  const submitBtn = document.querySelector('#forgot-password-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  setButtonBusy(submitBtn, true, 'Sending...');
  try {
    await resetPassword({ username: email });
    state.authEmail = email;
    state.authStep = 'resetPassword';
    render();
  } catch (error) {
    errorEl.textContent = authErrorMessage(error);
    showToast(authErrorMessage(error), { type: 'error' });
    setButtonBusy(submitBtn, false, 'Send reset code');
  }
}

async function handleResetPasswordConfirm(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const code = String(form.get('code') || '').trim();
  const newPassword = String(form.get('newPassword') || '');
  const submitBtn = document.querySelector('#reset-password-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  setButtonBusy(submitBtn, true, 'Resetting...');
  try {
    await confirmResetPassword({ username: state.authEmail, confirmationCode: code, newPassword });
    state.authStep = 'signIn';
    render();
    showToast('Password reset. Please sign in.');
  } catch (error) {
    errorEl.textContent = authErrorMessage(error);
    showToast(authErrorMessage(error), { type: 'error' });
    setButtonBusy(submitBtn, false, 'Reset password');
  }
}

async function handleSignOut() {
  await signOut();
  state.user = null;
  state.trees = [];
  state.treesLoading = false;
  state.treesLoaded = false;
  state.treeSearch = '';
  state.treeSort = 'updated';
  state.renamingTreeId = null;
  state.sidebarOpen = false;
  state.selectedTreeId = null;
  state.authStep = 'signIn';
  state.authEmail = '';
  state.totpSetup = null;
  state.dashboardView = 'trees';
  state.mfa = { status: 'unknown', loading: false, error: '', success: '', enrollment: null };
  render();
}

async function handleCreateTree(event) {
  event.preventDefault();
  const form = event.target;
  const name = String(new FormData(form).get('name') || '').trim();
  if (!name) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating...';
  try {
    await api('/api/trees', { method: 'POST', body: JSON.stringify({ name }) });
    await loadTrees();
    state.dashboardView = 'trees';
    render();
    showToast('Family tree created successfully.');
  } catch (error) {
    showToast(error.message || 'Could not create tree.', { type: 'error' });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create';
  }
}

async function handleImportCsv(event) {
  const fileInput = event.target;
  const file = fileInput.files?.[0];
  if (!file) return;

  if (!state.selectedTreeId) {
    showToast('Open a family tree before importing a CSV.', { type: 'error' });
    fileInput.value = '';
    return;
  }

  const importBtn = document.querySelector('#import-tree-csv-btn');
  const label = importBtn?.querySelector('span');
  if (importBtn) importBtn.disabled = true;
  if (label) label.textContent = 'Importing...';

  try {
    const formData = new FormData();
    formData.append('file', file);
    const result = await api(`/api/trees/${state.selectedTreeId}/import-csv`, {
      method: 'POST',
      body: formData,
    });

    await loadTree(state.selectedTreeId);
    showToast(`Imported ${result.imported_count} members successfully.`);
  } catch (error) {
    showToast(error.message || 'Import failed.', { type: 'error' });
  } finally {
    fileInput.value = '';
    if (importBtn) importBtn.disabled = false;
    if (label) label.textContent = 'Import CSV';
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
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, 'family-import-template.csv');
}

async function loadSession() {
  try {
    await getCurrentUser();
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
  state.treesLoading = true;
  try {
    const payload = await api('/api/trees');
    state.trees = payload.trees;
    state.treesLoaded = true;
  } finally {
    state.treesLoading = false;
  }
  if (state.user && state.dashboardView === 'trees' && !state.selectedTreeId) {
    renderTreeGrid();
  }
}

async function loadTree(treeId) {
  cleanupAllNodesGraph();
  const payload = await api(`/api/trees/${treeId}`);
  state.selectedTreeId = treeId;
  state.selectedTreeRole = payload.role;
  state.selectedTreeData = payload.data;
  state.selectedTreeName = payload.tree.name;
  state.viewMode = 'focused';
  state.focusedMainId = payload?.data?.[0]?.id || null;
  setSidebarOpen(false);
  render();
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
