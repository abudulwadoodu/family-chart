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
import { buildAllNodesGraphData, renderAllNodesGraph, pickDefaultMainId } from './allNodesGraph.js';
import { showConfirmDialog, showToast, showModal } from './ui.js';
import { escapeHtml, downloadJson, downloadCsv, downloadBlob, treeDataToCsv, slugifyFilename } from './utils.js';
import { icon } from './icons.js';
import { api } from './api.js';
import { buildMemberSearchIndex, searchMembers } from './memberSearch.js';
import { openGedcomImportWizard } from './gedcomWizard.js';
import { openCsvImportPanel } from './csvImportPanel.js';
import { openTreeExportDialog } from './treeExportDialog.js';
import { buildJsonExportEnvelope } from './jsonExport.js';
import { buildCsvText, SAMPLE_ROWS } from './csvTemplate.js';
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
  renderResetViewButton,
  renderMemberSearch,
  renderShareModalBody,
  renderRenameModalBody,
  renderContactPageMarkup,
  renderFooter,
} from './components.js';
import { LEGAL_DOCS } from './legal/content.js';
import { renderLegalPageMarkup, attachLegalPageListeners, clearLegalSeo } from './legal/legalPageLayout.js';
import {
  renderMyTicketsPageMarkup,
  renderTicketDetailPageMarkup,
  renderAdminPageMarkup,
  renderAdminDashboardMarkup,
  renderAdminTicketsTableMarkup,
  renderAdminTicketDetailMarkup,
} from './support/components.js';
import {
  loadMyTickets,
  attachMyTicketsListeners,
  loadTicketDetail,
  attachTicketDetailListeners,
  loadAdminSection,
  attachAdminListeners,
  createTicketFromContact,
  attachmentUrlForUser,
  attachmentUrlForAdmin,
} from './support/logic.js';

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
  defaultMainId: null,
  allNodesGraph: null,
  memberSearchIndex: null,
  memberSearchResults: [],
  memberSearchActiveIndex: -1,
  memberSearchHighlightTimer: null,
  authStep: 'signIn',
  authEmail: '',
  totpSetup: null,
  dashboardView: 'trees',
  // Public legal pages (Terms & Conditions, Privacy Policy) are reachable at
  // /terms and /privacy regardless of sign-in state - see syncRouteFromLocation
  // below. null means "no public route active, show the normal auth/dashboard".
  publicView: null,
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
  // "My Support Tickets" (user-facing) list + the shared ticket detail view.
  support: {
    tickets: [],
    total: 0,
    page: 1,
    pageSize: 10,
    search: '',
    status: 'all',
    priority: 'all',
    loading: false,
    loaded: false,
    selectedTicketId: null,
    selectedTicket: null,
    selectedMessages: [],
    selectedLoading: false,
  },
  // Admin Portal: only reachable when state.user.is_admin is true.
  admin: {
    section: 'dashboard', // 'dashboard' | 'tickets' | 'ticketDetail'
    dashboardCounts: {},
    dashboardLoading: false,
    tickets: [],
    total: 0,
    page: 1,
    pageSize: 10,
    search: '',
    status: 'all',
    priority: 'all',
    assignedTo: 'all',
    sort: 'updated_at',
    order: 'desc',
    loading: false,
    selectedTicketId: null,
    selectedTicket: null,
    selectedOwner: null,
    selectedMessages: [],
    selectedNotes: [],
    selectedLoading: false,
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

// Same delegated-listener approach as the dropdown menus above: registered
// once, closes the member search results whenever a click lands outside it.
document.addEventListener('click', (event) => {
  if (event.target.closest('#member-search')) return;
  closeMemberSearchResults();
});

// Minimal SPA router for the public legal pages (no router library exists in
// this app - see maybeOpenDeepLinkedTicket's note on the ?ticket= param).
// Maps a URL pathname to the publicView it should activate; anything else
// falls through to the normal auth/dashboard flow.
const PUBLIC_ROUTES = { '/terms': 'terms', '/privacy': 'privacy' };

function syncRouteFromLocation() {
  state.publicView = PUBLIC_ROUTES[window.location.pathname] || null;
}

function navigateTo(path) {
  if (window.location.pathname !== path) window.history.pushState(null, '', path);
  syncRouteFromLocation();
  render();
}

window.addEventListener('popstate', () => {
  syncRouteFromLocation();
  render();
});

// Delegated handler for every `data-internal-link` anchor (footer, legal page
// cross-links, auth page legal disclaimer, etc.) so new links never need
// their own per-render listener - they just need this attribute and a real
// `href` for no-JS/middle-click/new-tab to keep working.
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-internal-link]');
  if (!link) return;
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateTo(link.getAttribute('data-internal-link'));
});

// "Contact Us" links point at `mailto:` by default (works for signed-out
// visitors). Signed-in users get redirected to the in-app Contact Us page
// instead, since that page can pre-fill their account email.
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-contact-link]');
  if (!link || !state.user) return;
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  state.publicView = null;
  if (window.location.pathname !== '/') window.history.pushState(null, '', '/');
  state.dashboardView = 'contact';
  render();
});

// Fires once Amplify finishes exchanging the Hosted UI's ?code= for tokens
// after a Google sign-in redirect (success or failure).
Hub.listen('auth', ({ payload }) => {
  if (payload.event === 'signInWithRedirect') {
    state.oauthInProgress = false;
    loadSession().then(() => {
      if (state.user && sessionStorage.getItem(PENDING_ACCOUNT_DELETION_KEY)) {
        sessionStorage.removeItem(PENDING_ACCOUNT_DELETION_KEY);
        resumeDeleteAccountAfterGoogleReauth();
      }
    });
  } else if (payload.event === 'signInWithRedirect_failure') {
    state.oauthInProgress = false;
    state.user = null;
    render();
    showToast(authErrorMessage(payload.data?.error), { type: 'error' });
  }
});

const DEFAULT_TITLE = 'Secure Family Chart';

function render() {
  if (state.publicView) return renderLegalPage();
  if (document.title !== DEFAULT_TITLE) clearLegalSeo(DEFAULT_TITLE);
  return state.user ? renderDashboard() : renderAuth();
}

function renderLegalPage() {
  const doc = LEGAL_DOCS[state.publicView];

  app.innerHTML = `
    <div class="legal-shell">
      <header class="legal-shell-header">
        <a href="/" data-internal-link="/" class="legal-shell-brand">
          <span class="legal-shell-brand-icon">${icon('logo')}</span>
          <span>Family Chart</span>
        </a>
        <a href="/" data-internal-link="/" class="btn btn-secondary btn-sm">${icon('home')}<span>Back to app</span></a>
      </header>
      <main class="legal-shell-main">
        ${renderLegalPageMarkup(doc)}
      </main>
      ${renderFooter({ variant: 'legal' })}
    </div>
  `;

  attachLegalPageListeners(doc);
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
        <p class="auth-legal-disclaimer">
          By continuing, you agree to our
          <a href="/terms" data-internal-link="/terms">Terms &amp; Conditions</a> and
          <a href="/privacy" data-internal-link="/privacy">Privacy Policy</a>.
        </p>
      </section>
      ${renderFooter({ variant: 'auth', showLinks: false })}
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

function renderAdminSectionContent() {
  if (state.admin.section === 'tickets') {
    return renderAdminTicketsTableMarkup({ ...state.admin });
  }
  if (state.admin.section === 'ticketDetail') {
    if (!state.admin.selectedTicket) return '<p class="muted">Loading ticket&hellip;</p>';
    return renderAdminTicketDetailMarkup({
      ticket: state.admin.selectedTicket,
      owner: state.admin.selectedOwner,
      messages: state.admin.selectedMessages,
      internalNotes: state.admin.selectedNotes,
      attachmentUrlFor: attachmentUrlForAdmin(state.admin.selectedTicket.id),
      currentAdminId: state.user.id,
    });
  }
  return renderAdminDashboardMarkup({ counts: state.admin.dashboardCounts, loading: state.admin.dashboardLoading });
}

function renderAdminPageContent() {
  return renderAdminPageMarkup({ section: state.admin.section, content: renderAdminSectionContent() });
}

function renderMyTicketsPageContent() {
  return renderMyTicketsPageMarkup({ ...state.support });
}

function renderTicketDetailPageContent() {
  if (!state.support.selectedTicket) return '<p class="muted">Loading ticket&hellip;</p>';
  return renderTicketDetailPageMarkup({
    ticket: state.support.selectedTicket,
    messages: state.support.selectedMessages,
    attachmentUrlFor: attachmentUrlForUser,
  });
}

function renderDashboard() {
  const isSecurityView = state.dashboardView === 'security';
  const isCreateTreeView = !isSecurityView && state.dashboardView === 'createTree';
  const isContactView = !isSecurityView && !isCreateTreeView && state.dashboardView === 'contact';
  const isMyTicketsView = !isSecurityView && !isCreateTreeView && !isContactView && state.dashboardView === 'myTickets';
  const isTicketDetailView =
    !isSecurityView && !isCreateTreeView && !isContactView && !isMyTicketsView && state.dashboardView === 'ticketDetail';
  const isAdminView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    state.dashboardView === 'admin';
  const isViewerView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isAdminView &&
    Boolean(state.selectedTreeId);

  app.innerHTML = `
    <div class="app-shell ${state.sidebarOpen ? 'sidebar-open' : ''}">
      ${renderSidebarNav({ email: state.user.email, activeView: isCreateTreeView ? 'trees' : state.dashboardView, isAdmin: Boolean(state.user.is_admin) })}
      <div class="main-area">
        ${renderMobileTopbar()}
        <main class="content">
          ${
            isSecurityView
              ? renderSecuritySettingsMarkup()
              : isCreateTreeView
                ? renderCreateTreePageMarkup()
                : isContactView
                  ? renderContactPageContent()
                  : isMyTicketsView
                    ? renderMyTicketsPageContent()
                    : isTicketDetailView
                      ? renderTicketDetailPageContent()
                      : isAdminView
                        ? renderAdminPageContent()
                        : isViewerView
                          ? renderTreeViewerMarkup()
                          : renderTreesLandingMarkup()
          }
        </main>
        ${renderFooter({ variant: 'dashboard' })}
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

  if (isContactView) {
    attachContactPageListeners();
    return;
  }

  if (isMyTicketsView) {
    attachMyTicketsListeners(state, render);
    return;
  }

  if (isTicketDetailView) {
    if (state.support.selectedTicket) attachTicketDetailListeners(state, render);
    return;
  }

  if (isAdminView) {
    attachAdminListeners(state, render);
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
  document.querySelector('#nav-contact-btn').addEventListener('click', () => {
    state.dashboardView = 'contact';
    setSidebarOpen(false);
    render();
  });
  document.querySelector('#nav-tickets-btn').addEventListener('click', () => {
    state.dashboardView = 'myTickets';
    setSidebarOpen(false);
    render();
    loadMyTickets(state, render);
  });
  document.querySelector('#nav-admin-btn')?.addEventListener('click', () => {
    state.dashboardView = 'admin';
    state.admin.section = 'dashboard';
    setSidebarOpen(false);
    render();
    loadAdminSection(state, render);
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
      templateMenu: {
        id: 'landing-template-options',
        triggerId: 'download-template-btn',
        label: 'Download Template',
        items: [
          { action: 'download-csv-template-blank', label: 'Blank CSV Template', icon: 'download' },
          { action: 'download-csv-template-sample', label: 'Sample CSV Template', icon: 'download' },
        ],
      },
      importMenu: {
        id: 'landing-import-options',
        triggerId: 'import-tree-cta',
        label: 'Import',
        items: [
          { action: 'import-csv', label: 'Import CSV', icon: 'upload' },
          { action: 'import-gedcom', label: 'Import GEDCOM', icon: 'upload' },
        ],
      },
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
  bindDropdownTriggers(document.querySelector('.page-header'));
  document.querySelectorAll('.page-header .dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => handleTreesLandingHeaderAction(btn.dataset.action));
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

function handleTreesLandingHeaderAction(action) {
  if (action === 'download-csv-template-blank') return handleDownloadBlankCsvTemplate();
  if (action === 'download-csv-template-sample') return handleDownloadSampleCsvTemplate();
  if (action === 'import-csv') {
    return openCsvImportPanel({ api, mode: 'create', onImported: handleCsvImported });
  }
  if (action === 'import-gedcom') {
    return openGedcomImportWizard({
      api,
      mode: 'create',
      treeOptions: editableTreeOptions(),
      onImported: handleGedcomImported,
    });
  }
}

function editableTreeOptions() {
  return state.trees.filter((t) => t.role === 'owner' || t.role === 'editor').map((t) => ({ id: t.id, name: t.name }));
}

async function handleCsvImported(result) {
  const warningCount = result.warnings?.length || 0;
  const suffix = warningCount > 0 ? ` (${warningCount} warning${warningCount === 1 ? '' : 's'})` : '';

  // Imports from within an open tree (mode: 'existing') target
  // state.selectedTreeId directly; imports that created a new tree from the
  // home page (mode: 'create') report treeId/openTree instead, mirroring
  // handleGedcomImported's create-flow contract.
  if (result.treeId) {
    await loadTrees();
    if (result.openTree) await loadTree(result.treeId);
  } else if (state.selectedTreeId) {
    await loadTree(state.selectedTreeId);
  }

  showToast(`Imported ${result.imported_count} member${result.imported_count === 1 ? '' : 's'}${suffix}.`);
}

async function handleGedcomImported(result) {
  await loadTrees();
  // GEDCOM import replaces the target tree's entire contents (matching
  // CSV/JSON import), so loadTree's pickDefaultMainId already roots Focused
  // view on the largest family group in what was just imported - no need to
  // re-root separately here.
  if ((result.openTree && result.treeId) || state.selectedTreeId === result.treeId) {
    await loadTree(result.treeId);
  }
  showToast(`Imported ${result.imported_count} member${result.imported_count === 1 ? '' : 's'}.`);
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
  if (action === 'export-json') return handleExportTreeById(treeId, 'json');
  if (action === 'export-csv') return handleExportTreeById(treeId, 'csv');
  if (action === 'export-gedcom') {
    const tree = state.trees.find((t) => t.id === treeId);
    return openGedcomExportOptionsModal(treeId, tree?.name || 'family-tree');
  }
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
    const result = await api(`/api/trees/${treeId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
    state.renamingTreeId = null;
    if (state.selectedTreeId === treeId) state.selectedTreeName = result.name;
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

async function handleExportTreeById(treeId, format) {
  try {
    const tree = state.trees.find((t) => t.id === treeId);
    const baseName = slugifyFilename(tree?.name || '');
    if (format === 'csv') {
      const payload = await api(`/api/trees/${treeId}`);
      downloadCsv(`${slugifyFilename(tree?.name || payload.tree.name)}.csv`, treeDataToCsv(payload.data));
    } else {
      const { envelope } = await api(`/api/trees/${treeId}/export-json`);
      downloadJson(`${baseName || slugifyFilename(envelope.tree.name)}.json`, envelope);
    }
    showToast('Tree exported successfully.');
  } catch (error) {
    showToast(error.message || 'Export failed.', { type: 'error' });
  }
}

function openGedcomExportOptionsModal(treeId, treeName) {
  const options = { includeNotes: true, includePrivate: true, includeDeceased: true, includeLiving: true };
  const modal = showModal({ bodyHtml: renderGedcomExportOptionsBody(options), className: 'modal-gedcom-export' });
  bindGedcomExportOptionsListeners(modal, options, treeId, treeName);
}

function renderGedcomExportOptionsBody(options) {
  const checkboxRow = (id, checked, label) => `
    <label class="wizard-checkbox-row">
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
      <span>${label}</span>
    </label>`;

  return `
    <button type="button" class="icon-btn modal-close" id="gedcom-export-close-btn" aria-label="Close">${icon('close')}</button>
    <h3>Export GEDCOM</h3>
    <p class="modal-message">Choose what to include in the exported .ged file.</p>
    <div class="wizard-option-group">
      ${checkboxRow('export-opt-notes', options.includeNotes, 'Include notes')}
      ${checkboxRow('export-opt-private', options.includePrivate, 'Include private information')}
      ${checkboxRow('export-opt-deceased', options.includeDeceased, 'Include deceased members')}
      ${checkboxRow('export-opt-living', options.includeLiving, 'Include living members')}
    </div>
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="gedcom-export-cancel-btn">Cancel</button>
      <button type="button" class="btn btn-primary" id="gedcom-export-confirm-btn">${icon('download')}<span>Export</span></button>
    </div>
  `;
}

function bindGedcomExportOptionsListeners(modal, options, treeId, treeName) {
  const root = modal.root;
  root.querySelector('#gedcom-export-close-btn').addEventListener('click', modal.close);
  root.querySelector('#gedcom-export-cancel-btn').addEventListener('click', modal.close);

  const bindToggle = (id, key) => {
    root.querySelector(`#${id}`).addEventListener('change', (event) => {
      options[key] = event.target.checked;
    });
  };
  bindToggle('export-opt-notes', 'includeNotes');
  bindToggle('export-opt-private', 'includePrivate');
  bindToggle('export-opt-deceased', 'includeDeceased');
  bindToggle('export-opt-living', 'includeLiving');

  root.querySelector('#gedcom-export-confirm-btn').addEventListener('click', async () => {
    const confirmBtn = root.querySelector('#gedcom-export-confirm-btn');
    confirmBtn.disabled = true;
    try {
      const params = new URLSearchParams({
        includeNotes: String(options.includeNotes),
        includePrivate: String(options.includePrivate),
        includeDeceased: String(options.includeDeceased),
        includeLiving: String(options.includeLiving),
      });
      const result = await api(`/api/trees/${treeId}/export-gedcom?${params.toString()}`);
      downloadBlob(new Blob([result.gedcom], { type: 'text/plain;charset=utf-8' }), `${slugifyFilename(treeName)}.ged`);
      modal.close();
      showToast('Tree exported successfully.');
    } catch (error) {
      showToast(error.message || 'Export failed.', { type: 'error' });
      confirmBtn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Tree viewer
// ---------------------------------------------------------------------------

function renderTreeViewerMarkup() {
  return `
    ${renderTreeViewerHeader({ treeName: state.selectedTreeName, role: state.selectedTreeRole })}
    <div class="tree-toolbar-row">
      <div class="tree-toolbar-left">
        <div id="view-mode-toggle"></div>
        ${renderResetViewButton()}
      </div>
      ${renderMemberSearch()}
    </div>
    <div id="FamilyChart" class="f3 chart-container"></div>
  `;
}

function attachTreeViewerListeners() {
  document.querySelector('#breadcrumb-trees-btn').addEventListener('click', () => {
    clearSelectedTreeView();
    render();
  });
  document.querySelector('#save-btn').addEventListener('click', handleSaveTree);
  document.querySelector('#share-tree-btn')?.addEventListener('click', () => openShareModal(state.selectedTreeId));
  document.querySelector('#import-tree-json-input')?.addEventListener('change', handleImportTree);
  document.querySelector('#reset-view-btn')?.addEventListener('click', handleResetView);

  const header = document.querySelector('.viewer-header');
  bindDropdownTriggers(header);
  header?.querySelectorAll('.dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => handleViewerSettingsAction(btn.dataset.action));
  });

  attachMemberSearchListeners();
}

// ---------------------------------------------------------------------------
// Member search
// ---------------------------------------------------------------------------

function attachMemberSearchListeners() {
  const input = document.querySelector('#member-search-input');
  const resultsEl = document.querySelector('#member-search-results');
  const clearBtn = document.querySelector('#member-search-clear-btn');
  if (!input || !resultsEl || !clearBtn) return;

  input.addEventListener('focus', () => {
    // Build (or rebuild) the index lazily on first interaction so it always
    // reflects the latest edits, without recomputing it on every keystroke.
    state.memberSearchIndex = buildMemberSearchIndex(state.selectedTreeData);
    if (input.value.trim()) runMemberSearch(input.value);
  });

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    runMemberSearch(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveMemberSearchActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveMemberSearchActive(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = state.memberSearchResults[Math.max(state.memberSearchActiveIndex, 0)];
      if (target) selectSearchedMember(target.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (input.value) {
        input.value = '';
        clearBtn.hidden = true;
        closeMemberSearchResults();
      } else {
        input.blur();
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    closeMemberSearchResults();
    input.focus();
  });
}

function runMemberSearch(query) {
  if (!query.trim()) {
    closeMemberSearchResults();
    return;
  }
  state.memberSearchResults = searchMembers(state.memberSearchIndex || [], query);
  state.memberSearchActiveIndex = state.memberSearchResults.length ? 0 : -1;
  renderMemberSearchResults(query);
}

function renderMemberSearchResults(query) {
  const resultsEl = document.querySelector('#member-search-results');
  const input = document.querySelector('#member-search-input');
  if (!resultsEl || !input) return;

  resultsEl.hidden = false;
  input.setAttribute('aria-expanded', 'true');

  if (state.memberSearchResults.length === 0) {
    resultsEl.innerHTML = `<div class="member-search-empty">No members found for "${escapeHtml(query.trim())}"</div>`;
    return;
  }

  resultsEl.innerHTML = state.memberSearchResults
    .map((entry, index) => `
      <button
        type="button"
        class="member-search-result-item ${index === state.memberSearchActiveIndex ? 'active' : ''}"
        role="option"
        aria-selected="${index === state.memberSearchActiveIndex}"
        data-id="${escapeHtml(entry.id)}"
      >${highlightMatch(entry.label, query)}</button>
    `)
    .join('');

  resultsEl.querySelectorAll('.member-search-result-item').forEach((btn) => {
    btn.addEventListener('click', () => selectSearchedMember(btn.dataset.id));
  });
}

function highlightMatch(label, query) {
  const q = query.trim();
  if (!q) return escapeHtml(label);
  const at = label.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return escapeHtml(label);
  return (
    escapeHtml(label.slice(0, at)) +
    '<strong>' + escapeHtml(label.slice(at, at + q.length)) + '</strong>' +
    escapeHtml(label.slice(at + q.length))
  );
}

function moveMemberSearchActive(delta) {
  const count = state.memberSearchResults.length;
  if (!count) return;
  state.memberSearchActiveIndex = (state.memberSearchActiveIndex + delta + count) % count;
  document.querySelectorAll('.member-search-result-item').forEach((el, index) => {
    el.classList.toggle('active', index === state.memberSearchActiveIndex);
    el.setAttribute('aria-selected', index === state.memberSearchActiveIndex);
    if (index === state.memberSearchActiveIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

function closeMemberSearchResults() {
  state.memberSearchResults = [];
  state.memberSearchActiveIndex = -1;
  const resultsEl = document.querySelector('#member-search-results');
  const input = document.querySelector('#member-search-input');
  if (resultsEl) {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
  }
  if (input) input.setAttribute('aria-expanded', 'false');
}

function selectSearchedMember(id) {
  if (!id) return;
  const input = document.querySelector('#member-search-input');
  closeMemberSearchResults();
  if (input) {
    input.value = '';
    const clearBtn = document.querySelector('#member-search-clear-btn');
    if (clearBtn) clearBtn.hidden = true;
  }

  if (state.viewMode === 'all-nodes') {
    const focused = state.allNodesGraph?.focusNode(id);
    if (focused) return;
    // Not part of the largest connected component All Nodes mode renders -
    // fall back to Focused mode, which can always re-root on any member.
    state.focusedMainId = id;
    state.viewMode = 'focused';
    renderChart();
    highlightFocusedCard(id);
    return;
  }

  if (!state.chart) return;
  state.chart.updateMainId(id);
  state.focusedMainId = id;
  state.chart.updateTree({ initial: false, tree_position: 'main_to_middle', transition_time: 600 });
  highlightFocusedCard(id);
}

function highlightFocusedCard(id) {
  const card = document.querySelector(`#FamilyChart .card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  card.classList.remove('member-search-highlight');
  void card.offsetWidth; // restart the animation if the same card is re-highlighted
  card.classList.add('member-search-highlight');
  clearTimeout(state.memberSearchHighlightTimer);
  state.memberSearchHighlightTimer = setTimeout(() => card.classList.remove('member-search-highlight'), 2500);
}

// Returns the tree to how it looked when first opened - same person re-rooted
// and the whole subtree fitted to view (All Nodes mode has no "main" person,
// so it just re-fits the connected graph it's already showing).
function handleResetView() {
  if (state.viewMode === 'all-nodes') {
    state.allNodesGraph?.resetView();
    return;
  }
  if (!state.chart || !state.defaultMainId) return;
  state.chart.updateMainId(state.defaultMainId);
  state.focusedMainId = state.defaultMainId;
  state.chart.updateTree({ initial: false, tree_position: 'fit', transition_time: 600 });
}

function handleViewerSettingsAction(action) {
  if (action === 'rename') return openRenameTreeModal();
  if (action === 'delete') return promptDeleteTree(state.selectedTreeId, state.selectedTreeName);
  if (action === 'download-csv-template-blank') return handleDownloadBlankCsvTemplate();
  if (action === 'download-csv-template-sample') return handleDownloadSampleCsvTemplate();
  if (action === 'import-csv') {
    return openCsvImportPanel({ api, treeId: state.selectedTreeId, onImported: handleCsvImported });
  }
  if (action === 'import-json') return document.querySelector('#import-tree-json-input')?.click();
  if (action === 'import-gedcom') {
    return openGedcomImportWizard({
      api,
      mode: 'existing',
      treeId: state.selectedTreeId,
      treeName: state.selectedTreeName,
      treeOptions: editableTreeOptions(),
      onImported: handleGedcomImported,
    });
  }
  if (action === 'export-json') return handleExportCurrentTree('json');
  if (action === 'export-csv') return handleExportCurrentTree('csv');
  if (action === 'export-gedcom') return openGedcomExportOptionsModal(state.selectedTreeId, state.selectedTreeName);
  if (action === 'export-image') return handleExportTreeImage();
}

function handleExportTreeImage() {
  if (state.viewMode === 'all-nodes') {
    showToast('Switch to Focused mode to export the tree as an image.', { type: 'error' });
    return;
  }
  const container = document.querySelector('#FamilyChart');
  if (!container || !state.chart) return;
  openTreeExportDialog({ container, treeName: state.selectedTreeName });
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
      const result = await api(`/api/trees/${treeId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      state.selectedTreeName = result.name;
      document.querySelector('.viewer-title').textContent = result.name;
      document.querySelector('.breadcrumb-current').textContent = result.name;
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

function handleExportCurrentTree(format) {
  const data = state.editor?.exportData ? state.editor.exportData() : state.selectedTreeData;
  const baseName = slugifyFilename(state.selectedTreeName);
  if (format === 'csv') {
    downloadCsv(`${baseName}.csv`, treeDataToCsv(data));
  } else {
    downloadJson(`${baseName}.json`, buildJsonExportEnvelope(data, { treeName: state.selectedTreeName }));
  }
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

// ---------------------------------------------------------------------------
// Contact Us page
// ---------------------------------------------------------------------------

const CONTACT_SUBJECT_MIN_LENGTH = 3;
const CONTACT_SUBJECT_MAX_LENGTH = 120;
const CONTACT_MESSAGE_MIN_LENGTH = 20;
const CONTACT_MESSAGE_MAX_LENGTH = 5000;
const CONTACT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const CONTACT_ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];
const CONTACT_ALLOWED_ATTACHMENT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt'];

function renderContactPageContent() {
  return renderContactPageMarkup({ email: state.user.email });
}

function attachContactPageListeners() {
  document.querySelector('#contact-form').addEventListener('submit', handleContactSubmit);

  const fileInput = document.querySelector('#contact-file-input');
  document.querySelector('#contact-file-trigger-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleContactFileChange(fileInput));
  document.querySelector('#contact-file-remove-btn').addEventListener('click', () => {
    fileInput.value = '';
    handleContactFileChange(fileInput);
  });
}

function isAllowedContactAttachment(file) {
  if (CONTACT_ALLOWED_ATTACHMENT_TYPES.includes(file.type)) return true;
  // Some browsers/OSes report an empty mimetype for plain text files - fall
  // back to checking the extension so those aren't rejected unnecessarily.
  const name = file.name.toLowerCase();
  return CONTACT_ALLOWED_ATTACHMENT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function setContactFieldError(field, message) {
  const errorEl = document.querySelector(`#contact-${field}-error`);
  const inputEl = document.querySelector(`#contact-${field}-input`);
  if (errorEl) errorEl.textContent = message;
  if (inputEl) inputEl.setAttribute('aria-invalid', message ? 'true' : 'false');
  return message;
}

function handleContactFileChange(fileInput) {
  const nameEl = document.querySelector('#contact-file-name');
  const removeBtn = document.querySelector('#contact-file-remove-btn');
  const file = fileInput.files?.[0];

  if (!file) {
    nameEl.textContent = 'No file selected';
    removeBtn.hidden = true;
    setContactFieldError('file', '');
    return;
  }

  nameEl.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  removeBtn.hidden = false;

  if (file.size > CONTACT_MAX_ATTACHMENT_BYTES) {
    setContactFieldError('file', 'File must be 10 MB or smaller.');
  } else if (!isAllowedContactAttachment(file)) {
    setContactFieldError('file', 'Attachments must be an image, PDF, or text file.');
  } else {
    setContactFieldError('file', '');
  }
}

// Fully custom validation (the form has novalidate) so every error renders
// inline next to its field instead of relying on inconsistent native browser
// tooltips - matches the rest of the app's hand-rolled form validation.
function validateContactForm(form) {
  const data = new FormData(form);
  const subject = String(data.get('subject') || '').trim();
  const category = String(data.get('category') || '');
  const message = String(data.get('message') || '').trim();
  const file = form.querySelector('#contact-file-input').files?.[0];

  let firstInvalidId = null;
  const markInvalid = (field, message_, inputId) => {
    setContactFieldError(field, message_);
    if (message_ && !firstInvalidId) firstInvalidId = inputId;
  };

  markInvalid(
    'subject',
    subject.length < CONTACT_SUBJECT_MIN_LENGTH || subject.length > CONTACT_SUBJECT_MAX_LENGTH
      ? `Subject must be between ${CONTACT_SUBJECT_MIN_LENGTH} and ${CONTACT_SUBJECT_MAX_LENGTH} characters.`
      : '',
    'contact-subject-input'
  );
  markInvalid('category', !category ? 'Please choose a category.' : '', 'contact-category-input');
  markInvalid(
    'message',
    message.length < CONTACT_MESSAGE_MIN_LENGTH
      ? `Message must be at least ${CONTACT_MESSAGE_MIN_LENGTH} characters.`
      : message.length > CONTACT_MESSAGE_MAX_LENGTH
        ? `Message must be at most ${CONTACT_MESSAGE_MAX_LENGTH} characters.`
        : '',
    'contact-message-input'
  );

  if (file) {
    if (file.size > CONTACT_MAX_ATTACHMENT_BYTES) {
      markInvalid('file', 'File must be 10 MB or smaller.', 'contact-file-trigger-btn');
    } else if (!isAllowedContactAttachment(file)) {
      markInvalid('file', 'Attachments must be an image, PDF, or text file.', 'contact-file-trigger-btn');
    } else {
      setContactFieldError('file', '');
    }
  } else {
    setContactFieldError('file', '');
  }

  return { valid: !firstInvalidId, firstInvalidId };
}

async function handleContactSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formErrorEl = document.querySelector('#contact-form-error');
  formErrorEl.textContent = '';

  const { valid, firstInvalidId } = validateContactForm(form);
  if (!valid) {
    document.querySelector(`#${firstInvalidId}`)?.focus();
    return;
  }

  const submitBtn = document.querySelector('#contact-submit-btn');
  setButtonBusy(submitBtn, true, 'Sending...');

  try {
    const ticket = await createTicketFromContact(state, render, new FormData(form));
    showToast(`Ticket ${ticket.ticket_number} created. We'll be in touch soon.`);
  } catch (error) {
    formErrorEl.textContent = error.message || 'Could not send your message. Please try again.';
    showToast(error.message || 'Could not send your message.', { type: 'error' });
    if (document.body.contains(submitBtn)) setButtonBusy(submitBtn, false, 'Send Message');
  }
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
  state.defaultMainId = null;
  closeMemberSearchResults();
  state.memberSearchIndex = null;
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

  // Re-root on whatever was previously focused (e.g. coming back from All
  // Nodes mode, or a member found via search) instead of always defaulting
  // back to the first person in the data.
  if (state.focusedMainId && state.selectedTreeData.some((d) => d.id === state.focusedMainId)) {
    state.chart.updateMainId(state.focusedMainId);
  }

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
    <section class="security-panel danger-zone">
      <h2 class="danger-zone-title">Delete Account</h2>
      <p class="muted">Permanently delete your account and remove your personal data. This action cannot be undone.</p>
      <button type="button" id="delete-account-btn" class="btn-danger danger-zone-actions">Delete Account</button>
    </section>
  `;
}

function attachSecuritySettingsListeners() {
  document.querySelector('#delete-account-btn')?.addEventListener('click', handleOpenDeleteAccountModal);

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

// ---------------------------------------------------------------------------
// Delete account
//
// Flow: type "DELETE" to confirm -> re-authenticate (password+TOTP challenge,
// or a fresh Google sign-in) -> resolve any solely-owned family trees (transfer
// or delete each one) -> final confirmation -> DELETE /api/account -> sign out.
// Each step replaces the same modal body via modal.setBody(), mirroring the
// share-modal pattern above.
// ---------------------------------------------------------------------------

const PENDING_ACCOUNT_DELETION_KEY = 'pendingAccountDeletion';

function modalCloseBtnHtml() {
  return `<button type="button" id="delete-account-modal-close-btn" class="icon-btn modal-close" aria-label="Close">${icon('close')}</button>`;
}

function bindDeleteAccountChrome(modal) {
  modal.root.querySelector('#delete-account-modal-close-btn')?.addEventListener('click', modal.close);
  modal.root.querySelector('#delete-account-cancel-btn')?.addEventListener('click', modal.close);
}

function renderDeleteAccountLoadingStep(message) {
  return `
    ${modalCloseBtnHtml()}
    <h3 id="delete-account-modal-title">Delete Account</h3>
    <p class="modal-message">${escapeHtml(message)}</p>
  `;
}

function handleOpenDeleteAccountModal() {
  const modal = showModal({
    bodyHtml: renderDeleteAccountStep1(),
    className: 'modal-danger',
    onMount: (dialog) => dialog.setAttribute('aria-labelledby', 'delete-account-modal-title'),
  });
  bindDeleteAccountStep1(modal);
}

function renderDeleteAccountStep1() {
  return `
    ${modalCloseBtnHtml()}
    <h3 id="delete-account-modal-title">Delete Account</h3>
    <p class="modal-message">This action is permanent.</p>
    <p>Deleting your account will:</p>
    <ul class="authenticator-app-list muted">
      <li>Remove your profile</li>
      <li>Remove your authentication account</li>
      <li>Remove your access to all family trees</li>
      <li>Delete or transfer ownership of your trees (see rules below)</li>
      <li>Sign you out immediately</li>
    </ul>
    <form id="delete-account-confirm-form" class="stack">
      <label>Type <strong>DELETE</strong> to continue
        <input type="text" name="confirmText" id="delete-account-confirm-input" autocomplete="off" required />
      </label>
      <p class="error" id="delete-account-error"></p>
      <div class="modal-actions row">
        <button type="button" class="secondary" id="delete-account-cancel-btn">Cancel</button>
        <button type="submit" class="btn-danger" id="delete-account-confirm-btn" disabled>Delete Account</button>
      </div>
    </form>
  `;
}

function bindDeleteAccountStep1(modal) {
  bindDeleteAccountChrome(modal);
  const input = modal.root.querySelector('#delete-account-confirm-input');
  const confirmBtn = modal.root.querySelector('#delete-account-confirm-btn');

  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value !== 'DELETE';
  });
  modal.root.querySelector('#delete-account-confirm-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value !== 'DELETE') return;
    runDeleteAccountReauthStep(modal);
  });
  input.focus();
}

// Federated (Google) sign-ins carry an `identities` claim on the ID token;
// email/password sign-ins don't. Used to decide which re-auth step to show.
async function isFederatedSession() {
  const session = await fetchAuthSession();
  return Boolean(session.tokens?.idToken?.payload?.identities);
}

async function isStillSignedIn() {
  try {
    await getCurrentUser();
    return true;
  } catch (_error) {
    return false;
  }
}

// If a re-auth attempt fails after we've already had to sign the user out to
// retry it (see handlePasswordReauthSubmit), the session may be gone for good.
// Closes the modal and drops back to the sign-in screen instead of leaving the
// app stuck on a dashboard backed by no session.
async function abandonDeleteAccountFlowIfSignedOut(modal) {
  if (await isStillSignedIn()) return false;
  modal.close();
  state.user = null;
  render();
  showToast('Your session ended. Please sign in again.', { type: 'error' });
  return true;
}

async function runDeleteAccountReauthStep(modal) {
  modal.setBody(renderDeleteAccountLoadingStep('Checking your sign-in method...'));
  bindDeleteAccountChrome(modal);
  try {
    if (await isFederatedSession()) {
      renderGoogleReauthStep(modal);
    } else {
      renderPasswordReauthStep(modal);
    }
  } catch (error) {
    modal.setBody(renderDeleteAccountLoadingStep(authErrorMessage(error)));
    bindDeleteAccountChrome(modal);
  }
}

function renderPasswordReauthStep(modal) {
  modal.setBody(`
    ${modalCloseBtnHtml()}
    <h3 id="delete-account-modal-title">Confirm your password</h3>
    <p class="modal-message">For your security, please re-enter your password to continue deleting your account.</p>
    <form id="delete-account-password-form" class="stack">
      <label>Password
        <span class="input-icon-group">
          <span class="input-leading-icon">${icon('lock')}</span>
          <input type="password" name="password" class="has-trailing-icon" autocomplete="current-password" required />
          <button type="button" class="input-toggle-btn" aria-label="Show password">${icon('eye')}</button>
        </span>
      </label>
      <p class="error" id="delete-account-error"></p>
      <div class="modal-actions row">
        <button type="button" class="secondary" id="delete-account-cancel-btn">Cancel</button>
        <button type="submit" class="btn-danger" id="delete-account-reauth-btn">Confirm</button>
      </div>
    </form>
  `);
  bindDeleteAccountChrome(modal);
  attachPasswordToggles(modal.root);
  modal.root.querySelector('#delete-account-password-form').addEventListener('submit', (event) => {
    handlePasswordReauthSubmit(event, modal);
  });
  modal.root.querySelector('input[name="password"]').focus();
}

async function handlePasswordReauthSubmit(event, modal) {
  event.preventDefault();
  const password = String(new FormData(event.target).get('password') || '');
  const submitBtn = modal.root.querySelector('#delete-account-reauth-btn');
  const errorEl = modal.root.querySelector('#delete-account-error');
  errorEl.textContent = '';
  setButtonBusy(submitBtn, true, 'Confirming...');

  try {
    let result;
    try {
      result = await signIn({ username: state.user.email, password });
    } catch (error) {
      if (error.name !== 'UserAlreadyAuthenticatedException') throw error;
      // Amplify won't sign in over an existing session; re-establish it fresh
      // (mirrors the same fallback used by handleSignIn for initial sign-in).
      await signOut({ global: false });
      result = await signIn({ username: state.user.email, password });
    }

    if (result.isSignedIn) {
      await proceedPastDeleteAccountReauth(modal);
    } else if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
      renderTotpReauthStep(modal);
    } else {
      throw new Error('Unsupported sign-in step for re-authentication.');
    }
  } catch (error) {
    errorEl.textContent = authErrorMessage(error);
    setButtonBusy(submitBtn, false, 'Confirm');
    await abandonDeleteAccountFlowIfSignedOut(modal);
  }
}

function renderTotpReauthStep(modal) {
  modal.setBody(`
    ${modalCloseBtnHtml()}
    <h3 id="delete-account-modal-title">Enter your authentication code</h3>
    <p class="modal-message">Enter the 6-digit code from your authenticator app to continue.</p>
    <form id="delete-account-totp-form" class="stack">
      <label>6-digit code
        <input type="text" name="code" class="otp-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required />
      </label>
      <p class="error" id="delete-account-error"></p>
      <div class="modal-actions row">
        <button type="button" class="secondary" id="delete-account-cancel-btn">Cancel</button>
        <button type="submit" class="btn-danger" id="delete-account-reauth-btn">Verify</button>
      </div>
    </form>
  `);
  bindDeleteAccountChrome(modal);
  modal.root.querySelector('#delete-account-totp-form').addEventListener('submit', (event) => {
    handleTotpReauthSubmit(event, modal);
  });
  modal.root.querySelector('.otp-input').focus();
}

async function handleTotpReauthSubmit(event, modal) {
  event.preventDefault();
  const code = String(new FormData(event.target).get('code') || '').trim();
  const submitBtn = modal.root.querySelector('#delete-account-reauth-btn');
  const errorEl = modal.root.querySelector('#delete-account-error');
  errorEl.textContent = '';
  setButtonBusy(submitBtn, true, 'Verifying...');

  try {
    const result = await confirmSignIn({ challengeResponse: code });
    if (!result.isSignedIn) throw new Error('Unsupported sign-in step for re-authentication.');
    await proceedPastDeleteAccountReauth(modal);
  } catch (error) {
    errorEl.textContent = authErrorMessage(error);
    setButtonBusy(submitBtn, false, 'Verify');
    await abandonDeleteAccountFlowIfSignedOut(modal);
  }
}

function renderGoogleReauthStep(modal) {
  modal.setBody(`
    ${modalCloseBtnHtml()}
    <h3 id="delete-account-modal-title">Confirm with Google</h3>
    <p class="modal-message">For your security, please sign in with Google again to continue deleting your account.</p>
    <p class="error" id="delete-account-error"></p>
    <div class="modal-actions row">
      <button type="button" class="secondary" id="delete-account-cancel-btn">Cancel</button>
      <button type="button" class="btn-danger" id="delete-account-google-reauth-btn">Continue with Google</button>
    </div>
  `);
  bindDeleteAccountChrome(modal);
  modal.root.querySelector('#delete-account-google-reauth-btn').addEventListener('click', () => handleGoogleReauthClick(modal));
}

async function handleGoogleReauthClick(modal) {
  const btn = modal.root.querySelector('#delete-account-google-reauth-btn');
  const errorEl = modal.root.querySelector('#delete-account-error');
  setButtonBusy(btn, true, 'Redirecting to Google...');
  try {
    // signInWithRedirect leaves the page; the Hub 'auth' listener near the top of
    // this file checks this flag on return and resumes the flow automatically.
    sessionStorage.setItem(PENDING_ACCOUNT_DELETION_KEY, '1');
    await signOut({ global: false });
    await signInWithRedirect({ provider: 'Google' });
  } catch (error) {
    sessionStorage.removeItem(PENDING_ACCOUNT_DELETION_KEY);
    errorEl.textContent = authErrorMessage(error);
    setButtonBusy(btn, false, 'Continue with Google');
    await abandonDeleteAccountFlowIfSignedOut(modal);
  }
}

// Re-entry point after a Google re-auth redirect completes successfully.
function resumeDeleteAccountAfterGoogleReauth() {
  const modal = showModal({
    bodyHtml: renderDeleteAccountLoadingStep('Checking your family trees...'),
    className: 'modal-danger',
    onMount: (dialog) => dialog.setAttribute('aria-labelledby', 'delete-account-modal-title'),
  });
  loadOwnershipResolutionStep(modal);
}

async function proceedPastDeleteAccountReauth(modal) {
  modal.setBody(renderDeleteAccountLoadingStep('Checking your family trees...'));
  bindDeleteAccountChrome(modal);
  await loadOwnershipResolutionStep(modal);
}

async function loadOwnershipResolutionStep(modal) {
  try {
    const payload = await api('/api/account/deletion-check');
    if (!payload.blockingTrees.length) {
      showDeleteAccountFinalStep(modal);
      return;
    }
    modal.setBody(renderOwnershipResolutionStep(payload.blockingTrees));
    bindOwnershipResolutionStep(modal);
  } catch (error) {
    modal.setBody(`
      ${modalCloseBtnHtml()}
      <h3 id="delete-account-modal-title">Delete Account</h3>
      <p class="error">${escapeHtml(error.message || 'Could not check your family trees. Please try again.')}</p>
      <div class="modal-actions row">
        <button type="button" class="secondary" id="delete-account-cancel-btn">Cancel</button>
        <button type="button" class="btn-danger" id="delete-account-retry-btn">Retry</button>
      </div>
    `);
    bindDeleteAccountChrome(modal);
    modal.root.querySelector('#delete-account-retry-btn').addEventListener('click', () => loadOwnershipResolutionStep(modal));
  }
}

function renderOwnershipResolutionStep(blockingTrees) {
  const rows = blockingTrees
    .map((tree) => {
      const candidates = [
        ...tree.editors.map((member) => ({ ...member, roleLabel: 'Editor' })),
        ...tree.viewers.map((member) => ({ ...member, roleLabel: 'Viewer' })),
      ];
      const options = candidates
        .map((member) => `<option value="${member.userId}">${escapeHtml(member.email)} (${member.roleLabel})</option>`)
        .join('');

      return `
        <div class="member-row ownership-row">
          <div class="member-info">
            <div>
              <p class="member-email">${escapeHtml(tree.name)}</p>
              <p class="member-meta muted">
                ${candidates.length ? 'No other owner — transfer or delete this tree to continue.' : 'You are the only member — delete this tree to continue.'}
              </p>
            </div>
          </div>
          <div class="member-actions">
            ${
              candidates.length
                ? `
                  <select class="transfer-target-select" data-tree-id="${tree.id}" aria-label="Transfer ${escapeHtml(tree.name)} to">
                    ${options}
                  </select>
                  <button type="button" class="secondary btn-sm" data-transfer-tree-id="${tree.id}">Transfer ownership</button>
                `
                : ''
            }
            <button type="button" class="btn-danger btn-sm" data-delete-tree-id="${tree.id}" data-tree-name="${escapeHtml(tree.name)}">Delete tree</button>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    ${modalCloseBtnHtml()}
    <h3 id="delete-account-modal-title">Resolve tree ownership</h3>
    <p class="modal-message">You currently own family trees that have no other owner. Transfer ownership or delete each tree below to continue.</p>
    <div class="member-list">${rows}</div>
    <p class="error" id="delete-account-error"></p>
    <div class="modal-actions row">
      <button type="button" class="secondary" id="delete-account-cancel-btn">Cancel</button>
    </div>
  `;
}

function bindOwnershipResolutionStep(modal) {
  bindDeleteAccountChrome(modal);

  modal.root.querySelectorAll('[data-transfer-tree-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const treeId = Number(btn.dataset.transferTreeId);
      const select = modal.root.querySelector(`.transfer-target-select[data-tree-id="${treeId}"]`);
      const toUserId = Number(select.value);
      if (!toUserId) return;

      btn.disabled = true;
      try {
        await api(`/api/account/trees/${treeId}/transfer-ownership`, {
          method: 'POST',
          body: JSON.stringify({ toUserId }),
        });
        showToast('Ownership transferred.');
        await loadTrees();
        await loadOwnershipResolutionStep(modal);
      } catch (error) {
        modal.root.querySelector('#delete-account-error').textContent = error.message || 'Could not transfer ownership.';
        btn.disabled = false;
      }
    });
  });

  modal.root.querySelectorAll('[data-delete-tree-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const treeId = Number(btn.dataset.deleteTreeId);
      const treeName = btn.dataset.treeName;
      showConfirmDialog({
        title: 'Delete Family Tree',
        message: `Are you sure you want to delete "${treeName}"? This action cannot be undone.`,
        onConfirm: async () => {
          await api(`/api/trees/${treeId}`, { method: 'DELETE' });
          showToast('Family tree deleted successfully.');
          await loadTrees();
          await loadOwnershipResolutionStep(modal);
        },
      });
    });
  });
}

function showDeleteAccountFinalStep(modal) {
  modal.setBody(`
    ${modalCloseBtnHtml()}
    <h3 id="delete-account-modal-title">Delete Account</h3>
    <p class="modal-message">You're verified and your family trees are all set. This is the last step — your account will be permanently deleted and you'll be signed out immediately.</p>
    <p class="error" id="delete-account-error"></p>
    <div class="modal-actions row">
      <button type="button" class="secondary" id="delete-account-cancel-btn">Cancel</button>
      <button type="button" class="btn-danger" id="delete-account-final-btn">Delete Account</button>
    </div>
  `);
  bindDeleteAccountChrome(modal);
  modal.root.querySelector('#delete-account-final-btn').addEventListener('click', () => handleConfirmAccountDeletion(modal));
}

async function handleConfirmAccountDeletion(modal) {
  const btn = modal.root.querySelector('#delete-account-final-btn');
  const errorEl = modal.root.querySelector('#delete-account-error');
  errorEl.textContent = '';
  setButtonBusy(btn, true, 'Deleting...');

  try {
    await api('/api/account', { method: 'DELETE' });
    modal.close();
    await handleSignOut();
    showToast('Your account has been permanently deleted.');
  } catch (error) {
    if (error.status === 409) {
      errorEl.textContent = 'You still own a family tree with no other owner. Please resolve it first.';
      setButtonBusy(btn, false, 'Delete Account');
      await loadOwnershipResolutionStep(modal);
      return;
    }
    errorEl.textContent = error.message || 'Could not delete your account right now. Please try again.';
    setButtonBusy(btn, false, 'Delete Account');
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
  state.support = { ...state.support, tickets: [], total: 0, page: 1, loaded: false, selectedTicketId: null, selectedTicket: null, selectedMessages: [] };
  state.admin = { ...state.admin, section: 'dashboard', tickets: [], total: 0, page: 1, selectedTicketId: null, selectedTicket: null, selectedOwner: null, selectedMessages: [], selectedNotes: [] };
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

// CSV import goes through openCsvImportPanel (see csvImportPanel.js) for its
// guided preview/confirm flow; this handler now only serves the plain JSON
// file input, since JSON's ask is a format change, not a UI change.
async function handleImportTree(event) {
  const fileInput = event.target;
  const file = fileInput.files?.[0];
  if (!file) return;

  if (!state.selectedTreeId) {
    showToast('Open a family tree before importing.', { type: 'error' });
    fileInput.value = '';
    return;
  }

  const importBtn = document.querySelector('#import-tree-btn');
  const label = importBtn?.querySelector('span');
  if (importBtn) importBtn.disabled = true;
  if (label) label.textContent = 'Importing...';

  try {
    const formData = new FormData();
    formData.append('file', file);
    const result = await api(`/api/trees/${state.selectedTreeId}/import-json`, {
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
    if (label) label.textContent = 'Import';
  }
}

function handleDownloadBlankCsvTemplate() {
  downloadCsv('family-import-template-blank.csv', buildCsvText([]));
}

function handleDownloadSampleCsvTemplate() {
  downloadCsv('family-import-template-sample.csv', buildCsvText(SAMPLE_ROWS));
}

async function loadSession() {
  try {
    await getCurrentUser();
    const payload = await api('/api/auth/me');
    state.user = payload.user;
    await loadTrees();
    render();
    await maybeOpenDeepLinkedTicket();
  } catch (_error) {
    state.user = null;
    render();
  }
}

// Support emails link back with ?ticket=<ticket_number> (no hash router exists
// yet, so this mirrors the existing ?code= query-param check used for the
// OAuth redirect) - jump straight to that ticket's conversation once logged in.
async function maybeOpenDeepLinkedTicket() {
  const ticketNumber = new URLSearchParams(window.location.search).get('ticket');
  if (!ticketNumber) return;

  try {
    const payload = await api(`/api/support/tickets?search=${encodeURIComponent(ticketNumber)}&pageSize=1`);
    const ticket = payload.tickets?.[0];
    if (!ticket) return;
    state.dashboardView = 'ticketDetail';
    state.support.selectedTicketId = ticket.id;
    render();
    await loadTicketDetail(state, render, ticket.id);
  } catch (_error) {
    // Ignore - the user just lands on the normal dashboard view instead.
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
  state.focusedMainId = pickDefaultMainId(payload.data);
  state.defaultMainId = state.focusedMainId;
  setSidebarOpen(false);
  render();
}

function renderAllNodesMode() {
  const graphData = buildAllNodesGraphData(state.selectedTreeData);
  state.chart = null;
  state.editor = null;
  state.allNodesGraph = renderAllNodesGraph('#FamilyChart', graphData);
}

function cleanupAllNodesGraph() {
  if (!state.allNodesGraph) return;
  state.allNodesGraph.destroy();
  state.allNodesGraph = null;
}

// /terms and /privacy render immediately, without waiting on the auth check
// below, since they're public. Every other route keeps the existing
// behavior of showing nothing until loadSession() resolves.
syncRouteFromLocation();
if (state.publicView) render();

loadSession();
