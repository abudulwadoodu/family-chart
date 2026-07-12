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
import * as d3 from 'd3';
import f3 from '../src/index.ts';
import { buildAllNodesGraphData, renderAllNodesGraph, pickDefaultMainId } from './allNodesGraph.js';
import { createRelationshipBuilderState, handleConnectAttempt } from './relationshipBuilder.js';
import { removeAllRelations, deleteNode } from './relationshipMutations.js';
import { createRelationshipManagerState } from './relationshipManager/state.js';
import { renderRelationshipManagerMode } from './relationshipManager/components.js';
import { attachDisconnectedListListeners } from './relationshipManager/disconnectedListPanel.js';
import { attachBuilderPanelListeners } from './relationshipManager/builderPanel.js';
import { attachTreeHierarchyListeners } from './relationshipManager/treeHierarchyPanel.js';
import { attachRelationshipManagerKeyboard } from './relationshipManager/keyboardNav.js';
import { undo as undoRelationship, redo as redoRelationship, canUndo as canUndoRelationship, canRedo as canRedoRelationship } from './relationshipManager/undoStack.js';
import { createDuplicateManagerState } from './duplicateManager/state.js';
import { renderDuplicateManagerMode } from './duplicateManager/components.js';
import { attachDuplicateListListeners } from './duplicateManager/duplicateListPanel.js';
import { attachComparePanelListeners } from './duplicateManager/comparePanel.js';
import {
  renderTreeSettingsPanel,
  MIN_GENERATION_DEPTH,
  MAX_GENERATION_DEPTH,
  DEFAULT_GENERATION_DEPTH,
} from './treeSettingsPanel.js';
import { showConfirmDialog, showToast, showModal } from './ui.js';
import { appToast } from './appUX.js';
import { createFocusMode } from './focusMode.js';
import { initTheme, getPreferredTheme, setTheme } from './theme.js';
import { escapeHtml, downloadJson, downloadCsv, downloadBlob, treeDataToCsv, slugifyFilename } from './utils.js';
import { icon } from './icons.js';
import { api, fetchAttachment } from './api.js';
import { buildMemberSearchIndex, searchMembers, getLabel as getMemberLabel } from './memberSearch.js';
import { openGedcomImportWizard } from './gedcomWizard.js';
import { openCsvImportPanel } from './csvImportPanel.js';
import { openTreeExportDialog } from './treeExportDialog.js';
import { hydrateAvatarPreview, attachAvatarUpload } from './avatarUpload.js';
import {
  createMediaLibraryPageState,
  renderMediaLibraryPageContent,
  attachMediaLibraryPageListeners,
  loadMediaLibraryPage,
} from './mediaLibraryPanel.js';
import {
  createTimelinePageState,
  renderTimelinePageContent,
  attachTimelinePageListeners,
  loadTimelinePage,
} from './timelinePanel.js';
import { listFeed as listFamilyFeed } from './familyFeedApi.js';
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
  renderCanvasFloatingControls,
  renderShareModalBody,
  renderRenameModalBody,
  renderContactPageMarkup,
  renderContactFormCard,
  renderFooter,
  renderThemeToggle,
  renderTreesEmptyStateMarkup,
  renderCompactJoinSearch,
  renderCompactJoinSearchResults,
  renderDiscoverySectionMarkup,
  renderJoinRoleModalBody,
  renderRoleChangeModalBody,
  renderPendingRequestsPageMarkup,
  renderMyRequestsPageMarkup,
  renderSectionTabs,
} from './components.js';
import { LEGAL_DOCS } from './legal/content.js';
import { renderLegalPageMarkup, attachLegalPageListeners, clearLegalSeo } from './legal/legalPageLayout.js';
import { renderMyTicketsPageMarkup, renderTicketDetailPageMarkup } from './support/components.js';
import {
  loadMyTickets,
  attachMyTicketsListeners,
  loadTicketDetail,
  attachTicketDetailListeners,
  createTicketFromContact,
  submitPublicContactForm,
  attachmentUrlForUser,
} from './support/logic.js';
import { renderAdminShellMarkup, renderAdminEmptyState } from './admin/shared/components.js';
import { hasPermission } from './admin/shared/permissions.js';
import { renderAdminDashboardMarkup } from './admin/dashboard/components.js';
import { createDashboardState, loadAdminDashboard, attachAdminDashboardListeners } from './admin/dashboard/logic.js';
import { renderUsersPageMarkup, renderUserDetailMarkup } from './admin/users/components.js';
import { createUsersState, loadUsers, attachUsersListeners, attachUserDetailListeners } from './admin/users/logic.js';
import { renderTreesPageMarkup, renderTreeDetailMarkup } from './admin/trees/components.js';
import { createTreesState, loadTrees as loadAdminTrees, attachTreesListeners, attachTreeDetailListeners } from './admin/trees/logic.js';
import { renderMembersPageMarkup } from './admin/members/components.js';
import { createMembersState, loadMembers, attachMembersListeners } from './admin/members/logic.js';
import { renderAnalyticsPageMarkup } from './admin/analytics/components.js';
import { createAnalyticsState, loadAnalytics } from './admin/analytics/logic.js';
import { renderSettingsPageMarkup } from './admin/settings/components.js';
import { createSettingsState, loadSettings, attachSettingsListeners } from './admin/settings/logic.js';
import { renderAuditLogsPageMarkup } from './admin/auditLogs/components.js';
import { createAuditLogsState, loadAuditLogs, attachAuditLogsListeners } from './admin/auditLogs/logic.js';
import { renderAdminTicketsPageMarkup, renderAdminTicketDetailMarkup } from './admin/tickets/components.js';
import {
  createTicketsAdminState,
  loadAdminTickets,
  attachAdminTicketsListeners,
  loadAdminTicketDetail,
  attachAdminTicketDetailListeners,
  attachmentUrlForAdmin,
} from './admin/tickets/logic.js';

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

const SIDEBAR_COLLAPSED_KEY = 'family-chart-sidebar-collapsed';

function getStoredSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch (_error) {
    return false;
  }
}

const REMEMBERED_EMAIL_KEY = 'family-chart-remembered-email';

function getRememberedEmail() {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
  } catch (_error) {
    return '';
  }
}

function setRememberedEmail(email) {
  try {
    if (email) {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  } catch (_error) {
    // Ignore write failures (privacy mode, quota) - sign-in still works,
    // it just won't be remembered for next time.
  }
}

function discoveryDismissedKey(userId) {
  return `family-chart-discovery-dismissed-${userId}`;
}

function hashTreeIds(trees) {
  return trees.map((t) => t.id).sort((a, b) => a - b).join(',');
}

function getDismissedDiscoveryHash(userId) {
  try {
    return window.localStorage.getItem(discoveryDismissedKey(userId)) || '';
  } catch (_error) {
    return '';
  }
}

function setDismissedDiscoveryHash(userId, hash) {
  try {
    window.localStorage.setItem(discoveryDismissedKey(userId), hash);
  } catch (_error) {
    // Ignore write failures (privacy mode, quota) - dismissal just won't persist.
  }
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
  sidebarCollapsed: getStoredSidebarCollapsed(),
  theme: getPreferredTheme(),
  selectedTreeId: null,
  selectedTreeRole: null,
  selectedTreeName: '',
  selectedTreeStatus: 'active',
  selectedTreeData: [],
  chart: null,
  editor: null,
  viewMode: 'focused',
  focusedMainId: null,
  defaultMainId: null,
  // The owner-configured "default focus person" loaded from the tree's own
  // settings (trees.default_main_id) - distinct from defaultMainId above,
  // which is just "whichever person Reset View should return to" for the
  // current session. See loadTree() and the Settings view mode.
  treeDefaultMainId: null,
  // The owner-configured "generations to show" loaded from the tree's own
  // settings (trees.default_generation_depth) - null means unlimited. See
  // loadTree(), the Settings view mode, and ancestryDepth/progenyDepth below.
  treeDefaultGenerationDepth: DEFAULT_GENERATION_DEPTH,
  // The owner-configured "email auto-visibility" flag loaded from the tree's
  // own settings (trees.email_auto_visibility). See loadTree() and the
  // Settings view mode.
  treeEmailAutoVisibility: false,
  // How many generations of ancestors/descendants to render out from the
  // focused person before trimming the tree, so large families don't
  // render an unbounded (slow, cluttered) hierarchy on every re-root. Seeded
  // from treeDefaultGenerationDepth on every loadTree(); null means
  // unlimited (see renderChart()).
  ancestryDepth: DEFAULT_GENERATION_DEPTH,
  progenyDepth: DEFAULT_GENERATION_DEPTH,
  allNodesGraph: null,
  relationshipBuilder: createRelationshipBuilderState(),
  relationshipManager: createRelationshipManagerState(),
  duplicateManager: createDuplicateManagerState(),
  memberSearchIndex: null,
  memberSearchResults: [],
  memberSearchActiveIndex: -1,
  memberSearchHighlightTimer: null,
  authStep: 'signIn',
  authEmail: getRememberedEmail(),
  rememberMe: Boolean(getRememberedEmail()),
  totpSetup: null,
  // Sign-in tab state, scoped to the 'signIn' authStep only. 'password' shows
  // the existing email+password form; 'otp' shows the email-code form, which
  // itself has two phases driven by otpSent (request email -> enter code).
  signInMethod: 'password',
  otpSent: false,
  otpResendAvailableAt: 0,
  dashboardView: 'trees',
  // "Search before you create" step on the Create Tree page.
  joinSearch: {
    query: '',
    loading: false,
    searched: false,
    results: [],
    // Compact toolbar variant starts collapsed behind a text link so it
    // doesn't compete visually with the primary "Search trees by name..."
    // box; clicking the link swaps it for the actual search form.
    expanded: false,
  },
  // "Pending Requests" dashboard view (incoming join requests for trees this
  // user owns).
  pendingRequests: {
    loading: false,
    loaded: false,
    requests: [],
  },
  // "My Requests" dashboard view (join requests this user has sent, any status).
  myRequests: {
    loading: false,
    loaded: false,
    requests: [],
  },
  // "Trees you may belong to" - discovery matches by email, shown on the
  // tree-list landing page. Recomputed every time loadDiscoveryMatches() runs
  // (see loadSession()), not a one-time modal. `dismissed` reflects whether
  // the CURRENT match-set's hash equals the stored per-user dismissed hash
  // (see get/setDismissedDiscoveryHash), so a changed match-set (new match
  // appears, or the dismissed one disappears) always resurfaces.
  discovery: {
    loading: false,
    loaded: false,
    trees: [],
    dismissed: false,
  },
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
  // Private Vault: instant JSONB snapshots of trees the user owns. Scoped to
  // ownership only (never editor/viewer access) - see backend/models/vaultModel.js.
  vault: {
    snapshots: [],
    loading: false,
    loaded: false,
    creatingTreeId: null,
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
  // Tree-wide Media Library page (reachable from the tree viewer toolbar).
  // Reset via clearSelectedTreeView whenever the user leaves the tree, so
  // switching trees doesn't leak the previous tree's media/albums.
  mediaLibrary: createMediaLibraryPageState(),
  // Tree-wide Timeline page (reachable from the tree viewer toolbar). Reset
  // the same way as mediaLibrary above.
  timeline: createTimelinePageState(),
  // Family Feed slide-out overlay (reachable from the tree viewer toolbar).
  // Unlike mediaLibrary/timeline, this is NOT a dashboardView page - it's a
  // persistent overlay on top of the tree canvas, toggled via `open` (see
  // openFamilyFeed/closeFamilyFeed), independent of dashboardView. Reset via
  // clearSelectedTreeView same as the other two.
  familyFeed: { open: false, loaded: false, loading: false, filter: 'all', items: [] },
  // Admin Portal: only reachable when state.user.is_admin is true. Each
  // module owns its own state slice (dashboard/users/trees/analytics/
  // settings/auditLogs/tickets) - add a new slice + nav entry to extend.
  admin: {
    section: 'dashboard', // one of ADMIN_NAV_ITEMS ids, or '<module>Detail'
    dashboard: createDashboardState(),
    users: createUsersState(),
    trees: createTreesState(),
    members: createMembersState(),
    analytics: createAnalyticsState(),
    settings: createSettingsState(),
    auditLogs: createAuditLogsState(),
    tickets: createTicketsAdminState(),
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
// listener registered once is enough to close whichever one is open. Tree
// card "more" menus (.f3-card-more-menu, see renderChart's openCardMoreMenu)
// share this same listener instead of adding a second one: they're removed
// from the DOM entirely rather than toggled, since they're one-off nodes
// appended per-card rather than static page markup.
document.addEventListener('click', (event) => {
  if (event.target.closest('.dropdown-menu') || event.target.closest('[data-menu-trigger]')) return;
  document.querySelectorAll('.dropdown-menu.open').forEach((menu) => menu.classList.remove('open'));
  document.querySelectorAll('.f3-card-more-menu').forEach((menu) => menu.remove());
});

// Same delegated-listener approach as the dropdown menus above: registered
// once, closes the member search results whenever a click lands outside it.
document.addEventListener('click', (event) => {
  if (event.target.closest('#member-search')) return;
  closeMemberSearchResults();
});

// Blurs the compact "Discover other family branches" box on any outside
// click so it can collapse back to its idle text-link state (see
// attachCompactJoinSearchCollapseListeners' blur handler) - clicking a
// non-focusable element (e.g. plain page background) doesn't naturally blur
// a focused input on its own. No d3-zoom canvas sits on this page (that's
// only inside an open tree), so a plain bubble-phase click is enough here,
// unlike the member-search capture-phase listener below.
//
// Also has to ignore clicks on #join-search-reveal-btn itself: that button's
// own click handler synchronously expands the box and focuses the new input
// (via renderTreeGrid's innerHTML swap) *before* this delegated listener
// runs (it's still the same click event, bubbling from the button up to
// document). Without this guard, this listener would see "click landed
// outside #join-search-form" (true - the reveal button was never inside the
// form) plus "the input is now focused" (also true, we just focused it) and
// immediately blur it back off, collapsing the box before the user ever
// sees it open.
document.addEventListener('click', (event) => {
  if (event.target.closest('#join-search-form') || event.target.closest('#join-search-reveal-btn')) return;
  const joinSearchInput = document.querySelector('#join-search-input');
  if (joinSearchInput && state.joinSearch.expanded && document.activeElement === joinSearchInput) {
    joinSearchInput.blur();
  }
});

// Blurs the member-search input on any outside pointer-down so it can
// collapse back to its icon-only idle state (see attachMemberSearchListeners'
// blur handler). This has to be a CAPTURE-phase mousedown, not a bubble-phase
// click: the family-chart canvas has d3-zoom attached directly to its <svg>,
// and d3-zoom (a) calls stopImmediatePropagation on every mousedown there
// (so a bubble-phase document click/mousedown listener never even sees it),
// and (b) after any gesture with the slightest pointer movement - which a
// "click" on a pannable chart very often is - d3-drag's yesdrag() swallows
// the resulting click entirely via a one-time CAPTURE-phase listener on
// window (see node_modules/d3-drag/src/nodrag.js). A capture-phase mousedown
// on document fires before either of those, so it's the only reliable way to
// detect "the user is interacting with the chart" here.
document.addEventListener(
  'mousedown',
  (event) => {
    if (event.target.closest('#member-search')) return;
    const memberSearchInput = document.querySelector('#member-search-input');
    if (memberSearchInput && document.activeElement === memberSearchInput) {
      memberSearchInput.blur();
    }
  },
  { capture: true }
);

// Minimal SPA router for the public legal pages (no router library exists in
// this app - see maybeOpenDeepLinkedTicket's note on the ?ticket= param).
// Maps a URL pathname to the publicView it should activate; anything else
// falls through to the normal auth/dashboard flow.
const PUBLIC_ROUTES = { '/terms': 'terms', '/privacy': 'privacy', '/support': 'support' };

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

// "Contact Us" links point at `mailto:` as a no-JS/fallback href, but both
// signed-in and signed-out visitors get redirected to the in-app Contact Us
// page instead - signed-in users get their account email pre-filled, and
// signed-out visitors land on the public /support form instead of depending
// on the visitor having a mail client configured.
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-contact-link]');
  if (!link) return;
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (state.user) {
    state.publicView = null;
    if (window.location.pathname !== '/') window.history.pushState(null, '', '/');
    state.dashboardView = 'contact';
    render();
  } else {
    navigateTo('/support');
  }
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
  // Checked before state.user so /support renders the same shell-choice logic
  // regardless of sign-in state - this is what makes it a "public" route in
  // an app with no router/middleware layer to bypass.
  if (state.publicView === 'support') return renderSupportPage();
  if (state.publicView) return renderLegalPage();
  if (document.title !== DEFAULT_TITLE) clearLegalSeo(DEFAULT_TITLE);
  return state.user ? renderDashboard() : renderAuth();
}

// Reuses the exact same Contact Us form markup/logic as the authenticated
// dashboard page (renderContactPageContent/attachContactPageListeners) - only
// the surrounding shell differs, so there's no duplicated form/validation code
// between the signed-in and signed-out variants below.
function renderSupportPage() {
  return state.user ? renderSupportPageAuthed() : renderSupportPageAnonymous();
}

function renderSupportPageAuthed() {
  app.innerHTML = `
    <div class="app-shell ${state.sidebarOpen ? 'sidebar-open' : ''} ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      ${renderSidebarNav({
        email: state.user.email,
        activeView: 'contact',
        isAdmin: Boolean(state.user.is_admin),
        activeTheme: state.theme,
        collapsed: state.sidebarCollapsed,
      })}
      <div class="main-area">
        ${renderMobileTopbar()}
        <main class="content">
          ${renderContactPageContent()}
        </main>
      </div>
    </div>
  `;
  attachShellListeners();
  attachContactPageListeners();
}

function renderSupportPageAnonymous() {
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card auth-card--settled">
        <div class="auth-card-toggle">
          ${renderThemeToggle({ activeTheme: state.theme, idPrefix: 'support-theme-toggle' })}
        </div>
        <div class="auth-shell-content support-page-anonymous">
          <a href="/" data-internal-link="/" class="support-back-link">${icon('home')}<span>Back to Login</span></a>
          <div class="auth-brand">
            <span class="auth-brand-icon">${icon('logo')}</span>
            <h1 class="auth-brand-title">Contact Us</h1>
            <p class="auth-brand-subtitle">Send us a message and we'll get back to you by email.</p>
          </div>
          ${renderContactFormCard({ email: '', anonymous: true })}
        </div>
        <p class="auth-legal-disclaimer">
          By continuing, you agree to our
          <a href="/terms" data-internal-link="/terms">Terms &amp; Conditions</a> and
          <a href="/privacy" data-internal-link="/privacy">Privacy Policy</a>.
        </p>
      </section>
      ${renderFooter({ variant: 'auth', showLinks: false })}
    </main>
  `;
  attachThemeToggleListeners();
  attachContactPageListeners();
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

// Whether the auth card has already played its entrance animation this
// "session" of being on the auth screen. app.innerHTML fully replaces the
// .auth-card element on every step change (password -> signup -> OTP -> ...),
// so without this guard the browser treats each step as a brand-new element
// and replays the card's fade/scale-in every time, reading as a page-redirect
// blink rather than a smooth in-app transition. Reset in resetAuthCardEntrance
// whenever the user actually leaves and later returns to the auth flow (e.g.
// after signing out), so that first appearance still gets the entrance.
let authCardHasAppeared = false;

function resetAuthCardEntrance() {
  authCardHasAppeared = false;
}

// Shared shell for every auth screen: brand mark + contextual heading/subtitle,
// so the dark "premium SaaS" card chrome, background photo, and entrance
// animation stay consistent across sign-in/sign-up/MFA/reset rather than
// duplicated in each render*Step.
function renderAuthShell(heading, subtitleHtml, bodyHtml) {
  // The card only plays its fade/scale entrance on the very first paint of
  // the auth flow (see auth-card--settled below). Every later step change
  // (password <-> signup <-> OTP <-> ...) renders with no animation at all -
  // no card entrance, no content fade - so it's an instant swap rather than
  // any kind of visible transition, which is what "no blink" means here.
  const cardClass = authCardHasAppeared ? 'auth-card auth-card--settled' : 'auth-card';
  authCardHasAppeared = true;

  app.innerHTML = `
    <main class="auth-page">
      <section class="${cardClass}">
        <div class="auth-card-toggle">
          ${renderThemeToggle({ activeTheme: state.theme, idPrefix: 'auth-theme-toggle' })}
        </div>
        <div class="auth-shell-content">
          <div class="auth-brand">
            <span class="auth-brand-icon">${icon('logo')}</span>
            <h1 class="auth-brand-title">${heading}</h1>
            <p class="auth-brand-subtitle">${subtitleHtml}</p>
          </div>
          ${bodyHtml}
        </div>
        <p class="auth-legal-disclaimer">
          By continuing, you agree to our
          <a href="/terms" data-internal-link="/terms">Terms &amp; Conditions</a> and
          <a href="/privacy" data-internal-link="/privacy">Privacy Policy</a>.
        </p>
        <a href="/support" data-internal-link="/support" class="auth-support-link">${icon('mail')}<span>Need help? Contact support</span></a>
      </section>
      ${renderFooter({ variant: 'auth', showLinks: false })}
    </main>
  `;

  attachThemeToggleListeners();
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

// How long a user has to wait before "Resend code" is clickable again. Kept
// short enough not to feel punishing on a first-attempt typo, long enough to
// discourage hammering Cognito's own OTP rate limit.
const OTP_RESEND_COOLDOWN_SECONDS = 30;

// Cognito's EMAIL_OTP sign-in challenge sends an 8-digit numeric code (per
// AWS's own RespondToAuthChallenge API example: "EMAIL_OTP_CODE": "12345678"),
// unlike the 6-digit codes used for sign-up/reset-password confirmation
// elsewhere in this app. This length isn't developer-configurable and AWS
// doesn't document it as permanently fixed, so attachOtpBoxAutoAdvance below
// still accepts a pasted/autofilled code that's shorter or longer than this
// many digits rather than silently truncating or refusing it.
const OTP_EMAIL_CODE_LENGTH = 8;

function renderAuthMethodTabs() {
  const methods = [
    { id: 'password', label: 'Password', iconName: 'lock' },
    { id: 'otp', label: 'Email Code', iconName: 'mail' },
  ];
  return `
    <div class="auth-method-tabs" role="tablist" aria-label="Sign-in method">
      ${methods
        .map(
          (m) => `
        <button
          type="button"
          class="auth-method-tab"
          role="tab"
          id="auth-method-tab-${m.id}"
          aria-selected="${state.signInMethod === m.id}"
          aria-controls="auth-method-panel"
          tabindex="${state.signInMethod === m.id ? '0' : '-1'}"
        >
          ${icon(m.iconName)}<span>${m.label}</span>
        </button>
      `
        )
        .join('')}
    </div>
  `;
}

function attachAuthMethodTabListeners() {
  const tabs = document.querySelectorAll('.auth-method-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const method = tab.id.replace('auth-method-tab-', '');
      if (method === state.signInMethod) return;
      state.signInMethod = method;
      state.otpSent = false;
      render();
    });
  });
  // Arrow-key roving tabindex between tabs, matching standard tablist keyboard behavior.
  const tabList = document.querySelector('.auth-method-tabs');
  tabList?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const list = Array.from(tabs);
    const currentIndex = list.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = list[(currentIndex + delta + list.length) % list.length];
    next.click();
    next.focus();
  });
}

function renderPasswordPanel() {
  return `
    <div id="auth-method-panel" class="auth-method-panel" role="tabpanel" aria-labelledby="auth-method-tab-password">
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
          <input type="checkbox" id="remember-me-checkbox" ${state.rememberMe ? 'checked' : ''} />
          <span>Remember me</span>
        </label>
        <button type="button" id="go-forgot-password-btn" class="auth-link-btn">Forgot password?</button>
      </div>
      <p id="auth-error" class="error"></p>
    </div>
  `;
}

function attachPasswordPanelListeners() {
  document.querySelector('#sign-in-form').addEventListener('submit', handleSignIn);
  attachPasswordToggles(document.querySelector('#sign-in-form'));
  document.querySelector('#remember-me-checkbox').addEventListener('change', (event) => {
    state.rememberMe = event.target.checked;
  });
  document.querySelector('#go-forgot-password-btn').addEventListener('click', () => {
    state.authStep = 'forgotPassword';
    render();
  });
}

function renderOtpRequestPanel() {
  return `
    <div id="auth-method-panel" class="auth-method-panel" role="tabpanel" aria-labelledby="auth-method-tab-otp">
      <form id="otp-request-form" class="stack auth-form">
        <label>Email
          <span class="input-icon-group">
            <span class="input-leading-icon">${icon('mail')}</span>
            <input type="email" name="email" value="${escapeHtml(state.authEmail)}" placeholder="Enter your email" required autofocus />
          </span>
        </label>
        <button type="submit" id="otp-request-btn" class="btn-auth"><span>Email me a sign-in code</span></button>
      </form>
      <p class="otp-help-text">No password needed - we'll email you a 6-digit code.</p>
      <p id="auth-error" class="error"></p>
    </div>
  `;
}

function attachOtpRequestPanelListeners() {
  document.querySelector('#otp-request-form').addEventListener('submit', handleOtpSignInRequest);
}

function renderOtpChallengePanel() {
  const secondsLeft = Math.max(0, Math.ceil((state.otpResendAvailableAt - Date.now()) / 1000));
  const resendReady = secondsLeft === 0;
  return `
    <div id="auth-method-panel" class="auth-method-panel" role="tabpanel" aria-labelledby="auth-method-tab-otp">
      <div class="otp-success-banner">
        ${icon('check')}
        <span>Code sent! Check your inbox.</span>
      </div>
      <p class="otp-sent-target">
        Sent a sign-in code to <strong>${escapeHtml(state.authEmail)}</strong>
        <button type="button" id="otp-edit-email-btn" class="auth-link-btn otp-edit-email-btn">Edit</button>
      </p>
      <form id="otp-challenge-form" class="stack auth-form">
        <fieldset class="otp-box-group-fieldset" style="border:none;padding:0;margin:0;">
          <legend class="sr-only">${OTP_EMAIL_CODE_LENGTH}-digit sign-in code</legend>
          <div class="otp-box-group" id="otp-box-group">
            ${Array.from({ length: OTP_EMAIL_CODE_LENGTH })
              .map(
                (_, i) => `
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="1"
                class="otp-box"
                aria-label="Digit ${i + 1} of ${OTP_EMAIL_CODE_LENGTH}"
                autocomplete="${i === 0 ? 'one-time-code' : 'off'}"
                data-otp-index="${i}"
              />
            `
              )
              .join('')}
          </div>
          <input type="hidden" name="code" id="otp-code-hidden" />
        </fieldset>
        <button type="submit" id="otp-challenge-btn" class="btn-auth" disabled><span>Verify &amp; sign in</span></button>
      </form>
      <div class="otp-resend-row">
        <span class="muted">Didn't receive the code?</span>
        ${
          resendReady
            ? `<button type="button" id="resend-otp-btn" class="auth-link-btn">Resend code</button>`
            : `<span class="otp-resend-countdown" id="otp-resend-countdown" aria-live="polite">Resend in ${secondsLeft}s</span>`
        }
      </div>
      <p id="auth-error" class="error" aria-live="assertive"></p>
    </div>
  `;
}

// Wires up the OTP_EMAIL_CODE_LENGTH-box grid as a single logical control:
// typing a digit auto-advances focus to the next box, backspace on an empty
// box moves back, and pasting/autofilling a full code fills every box at
// once. If the pasted code is longer or shorter than the box count (Cognito's
// length isn't contractually guaranteed - see OTP_EMAIL_CODE_LENGTH), extra
// boxes are added or unused ones are dropped instead of truncating/rejecting
// the code, so a length change on AWS's side degrades gracefully rather than
// silently breaking sign-in. The value submitted is mirrored into the hidden
// #otp-code-hidden input the form reads on submit.
function attachOtpBoxAutoAdvance() {
  const group = document.querySelector('#otp-box-group');
  const hidden = document.querySelector('#otp-code-hidden');
  const submitBtn = document.querySelector('#otp-challenge-btn');
  let boxes = Array.from(document.querySelectorAll('.otp-box'));
  if (!boxes.length) return;

  const syncHiddenValue = () => {
    const code = boxes.map((b) => b.value).join('');
    hidden.value = code;
    submitBtn.disabled = code.length !== boxes.length;
    boxes.forEach((b) => b.classList.toggle('filled', b.value !== ''));
  };

  // Grows the box grid in place if a pasted/autofilled code is longer than
  // the current number of boxes, so an unexpectedly long code still fits
  // fully instead of being cut off.
  const ensureBoxCount = (count) => {
    if (count <= boxes.length) return;
    for (let i = boxes.length; i < count; i += 1) {
      const box = document.createElement('input');
      box.type = 'text';
      box.inputMode = 'numeric';
      box.pattern = '[0-9]*';
      box.maxLength = 1;
      box.className = 'otp-box';
      box.setAttribute('aria-label', `Digit ${i + 1} of ${count}`);
      box.dataset.otpIndex = String(i);
      group.appendChild(box);
      wireBox(box, i);
    }
    boxes = Array.from(document.querySelectorAll('.otp-box'));
  };

  const fillFromString = (raw, startIndex) => {
    const digits = raw.replace(/\D/g, '');
    ensureBoxCount(startIndex + digits.length);
    digits.split('').forEach((digit, offset) => {
      boxes[startIndex + offset].value = digit;
    });
    syncHiddenValue();
    const nextIndex = Math.min(startIndex + digits.length, boxes.length - 1);
    boxes[nextIndex].focus();
    boxes[nextIndex].select();
  };

  function wireBox(box, index) {
    box.addEventListener('input', (event) => {
      const { value } = event.target;
      if (value.length > 1) {
        // Mobile keyboards / autofill can drop the whole code into one box.
        fillFromString(value, index);
        return;
      }
      event.target.value = value.replace(/\D/g, '');
      syncHiddenValue();
      if (event.target.value && index < boxes.length - 1) {
        boxes[index + 1].focus();
      }
    });

    box.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !box.value && index > 0) {
        boxes[index - 1].focus();
      }
    });

    box.addEventListener('paste', (event) => {
      const pasted = event.clipboardData?.getData('text') || '';
      if (!pasted) return;
      event.preventDefault();
      fillFromString(pasted, index);
    });
  }

  boxes.forEach(wireBox);
  boxes[0].focus();
}

// Ticks the visible "Resend in Ns" countdown against state.otpResendAvailableAt
// (set by whoever just sent a code) until it elapses, then re-renders once to
// swap the countdown text for the clickable "Resend code" link.
function tickOtpResendCountdown() {
  const tick = () => {
    if (state.authStep !== 'signIn' || state.signInMethod !== 'otp' || !state.otpSent) return;
    const secondsLeft = Math.max(0, Math.ceil((state.otpResendAvailableAt - Date.now()) / 1000));
    const countdownEl = document.querySelector('#otp-resend-countdown');
    if (secondsLeft === 0) {
      render();
      return;
    }
    if (countdownEl) countdownEl.textContent = `Resend in ${secondsLeft}s`;
    setTimeout(tick, 1000);
  };
  setTimeout(tick, 1000);
}

function attachOtpChallengePanelListeners() {
  document.querySelector('#otp-challenge-form').addEventListener('submit', handleOtpChallengeSubmit);
  attachOtpBoxAutoAdvance();
  document.querySelector('#otp-edit-email-btn').addEventListener('click', () => {
    state.otpSent = false;
    render();
  });
  document.querySelector('#resend-otp-btn')?.addEventListener('click', handleResendOtpCode);
  if (Date.now() < state.otpResendAvailableAt) tickOtpResendCountdown();
}

function renderSignInStep() {
  const otpPanel = state.otpSent ? renderOtpChallengePanel() : renderOtpRequestPanel();
  const activePanel = state.signInMethod === 'password' ? renderPasswordPanel() : otpPanel;

  renderAuthShell(
    'Welcome Back!',
    'Sign in to your Family Chart account',
    `
      <button type="button" id="google-signin-btn" class="btn-google">
        ${GOOGLE_LOGO_SVG}
        <span class="btn-label">Continue with Google</span>
      </button>
      <div class="auth-divider"><span>OR</span></div>
      ${renderAuthMethodTabs()}
      ${activePanel}
      <p class="auth-footnote">Don't have an account? <button type="button" id="go-sign-up-btn" class="auth-link-btn">Create account</button></p>
    `
  );

  document.querySelector('#google-signin-btn').addEventListener('click', handleGoogleSignIn);
  attachAuthMethodTabListeners();
  document.querySelector('#go-sign-up-btn').addEventListener('click', () => {
    state.authStep = 'signUp';
    render();
  });

  if (state.signInMethod === 'password') {
    attachPasswordPanelListeners();
  } else if (state.otpSent) {
    attachOtpChallengePanelListeners();
  } else {
    attachOtpRequestPanelListeners();
  }
}

function renderSignUpStep() {
  renderAuthShell(
    'Create your account',
    'Start building your Family Chart today',
    `
      <p class="muted">Password must be at least 8 characters and include upper/lowercase letters, a number, and a symbol.</p>
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
            <input type="password" name="password" class="has-trailing-icon" placeholder="Create a password" minlength="8" required />
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
            <input type="password" name="newPassword" class="has-trailing-icon" placeholder="Enter a new password" minlength="8" required />
            <button type="button" class="input-toggle-btn" aria-label="Show password">${icon('eye')}</button>
          </span>
        </label>
        <button type="submit" id="reset-password-btn" class="btn-auth"><span>Reset password</span></button>
      </form>
      <div class="auth-links">
        <button type="button" id="go-sign-in-btn" class="auth-link-btn">Back to sign in</button>
      </div>
      <p id="auth-error" class="error"></p>
    `
  );

  document.querySelector('#reset-password-form').addEventListener('submit', handleResetPasswordConfirm);
  attachPasswordToggles(document.querySelector('#reset-password-form'));
  document.querySelector('#go-sign-in-btn').addEventListener('click', () => {
    state.authStep = 'signIn';
    render();
  });
}

// ---------------------------------------------------------------------------
// Dashboard shell
// ---------------------------------------------------------------------------

// Extend this switch (plus ADMIN_NAV_ITEMS and one state.admin.<module> slice)
// to add a new admin module. Each module owns render/logic in its own
// frontend/admin/<module>/{components,logic}.js pair.
function renderAdminSectionContent() {
  const { section } = state.admin;

  if (section === 'users') return renderUsersPageMarkup({ ...state.admin.users, currentUser: state.user });
  if (section === 'userDetail') {
    if (!state.admin.users.selectedUser) return '<p class="muted">Loading user&hellip;</p>';
    return renderUserDetailMarkup({
      user: state.admin.users.selectedUser,
      busy: state.admin.users.busy,
      canManageRoles: hasPermission(state.user, 'users:manageRoles'),
      canDelete: hasPermission(state.user, 'users:delete'),
    });
  }

  if (section === 'trees') return renderTreesPageMarkup({ ...state.admin.trees });
  if (section === 'treeDetail') {
    if (!state.admin.trees.selectedTree) return '<p class="muted">Loading tree&hellip;</p>';
    return renderTreeDetailMarkup({
      tree: state.admin.trees.selectedTree,
      collaborators: state.admin.trees.selectedCollaborators,
      overrides: state.admin.trees.selectedOverrides,
      backLabel: state.admin.trees.cameFromMembers ? 'Family Members' : 'Family Trees',
      busy: state.admin.trees.busy,
      canSuspend: hasPermission(state.user, 'trees:suspend'),
      canManageOverrides: hasPermission(state.user, 'trees:manageOverrides'),
      overridesBusy: state.admin.trees.overridesBusy,
      overrideFormError: state.admin.trees.overrideFormError,
    });
  }

  if (section === 'members') return renderMembersPageMarkup({ ...state.admin.members });

  if (section === 'tickets') return renderAdminTicketsPageMarkup({ ...state.admin.tickets });
  if (section === 'ticketDetail') {
    if (!state.admin.tickets.selectedTicket) return '<p class="muted">Loading ticket&hellip;</p>';
    return renderAdminTicketDetailMarkup({
      ticket: state.admin.tickets.selectedTicket,
      owner: state.admin.tickets.selectedOwner,
      messages: state.admin.tickets.selectedMessages,
      internalNotes: state.admin.tickets.selectedNotes,
      attachmentUrlFor: attachmentUrlForAdmin(state.admin.tickets.selectedTicket.id),
      currentAdminId: state.user.id,
    });
  }

  if (section === 'analytics') return renderAnalyticsPageMarkup({ ...state.admin.analytics });
  if (section === 'settings') {
    return renderSettingsPageMarkup({ ...state.admin.settings, canEdit: hasPermission(state.user, 'settings:edit') });
  }
  if (section === 'auditLogs') return renderAuditLogsPageMarkup({ ...state.admin.auditLogs });

  return renderAdminDashboardMarkup({ ...state.admin.dashboard });
}

function loadAdminSection(sectionState, render) {
  const { section } = sectionState.admin;
  if (section === 'users') return loadUsers(sectionState, render);
  if (section === 'trees') return loadAdminTrees(sectionState, render);
  if (section === 'members') return loadMembers(sectionState, render);
  if (section === 'tickets') return loadAdminTickets(sectionState, render);
  if (section === 'analytics') return loadAnalytics(sectionState, render);
  if (section === 'settings') return loadSettings(sectionState, render);
  if (section === 'auditLogs') return loadAuditLogs(sectionState, render);
  return loadAdminDashboard(sectionState, render);
}

function attachAdminListeners(sectionState, render) {
  document.querySelectorAll('[data-admin-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextSection = btn.dataset.adminSection;
      if (nextSection === sectionState.admin.section) return;
      sectionState.admin.section = nextSection;
      render();
      loadAdminSection(sectionState, render);
    });
  });

  // The "Dashboard" breadcrumb crumb appears on every list page (Users,
  // Trees, Members, Tickets, Analytics, Settings, Audit Logs) - one shared
  // handler here instead of duplicating it in every module's attach*Listeners.
  document.querySelector('[data-breadcrumb-id="admin-dashboard-breadcrumb-btn"]')?.addEventListener('click', () => {
    sectionState.admin.section = 'dashboard';
    render();
    loadAdminSection(sectionState, render);
  });

  const { section } = sectionState.admin;
  if (section === 'users') return attachUsersListeners(sectionState, render);
  if (section === 'userDetail') {
    if (sectionState.admin.users.selectedUser) attachUserDetailListeners(sectionState, render);
    return undefined;
  }
  if (section === 'trees') return attachTreesListeners(sectionState, render);
  if (section === 'treeDetail') {
    if (sectionState.admin.trees.selectedTree) {
      attachTreeDetailListeners(sectionState, render, () => {
        sectionState.admin.section = 'members';
        render();
        loadMembers(sectionState, render);
      });
    }
    return undefined;
  }
  if (section === 'members') return attachMembersListeners(sectionState, render);
  if (section === 'tickets') return attachAdminTicketsListeners(sectionState, render);
  if (section === 'ticketDetail') {
    if (sectionState.admin.tickets.selectedTicket) attachAdminTicketDetailListeners(sectionState, render);
    return undefined;
  }
  if (section === 'settings') return attachSettingsListeners(sectionState, render);
  if (section === 'auditLogs') return attachAuditLogsListeners(sectionState, render);
  if (section === 'dashboard') {
    return attachAdminDashboardListeners(sectionState, render, (targetSection, filter) => {
      if (filter && sectionState.admin[targetSection]) {
        sectionState.admin[targetSection][filter.key] = filter.value;
        sectionState.admin[targetSection].page = 1;
      }
      sectionState.admin.section = targetSection;
      render();
      loadAdminSection(sectionState, render);
    });
  }
  return undefined;
}

function renderAdminPageContent() {
  if (!state.user.is_admin) {
    return renderAdminEmptyState({ title: 'Page not found', description: 'The page you are looking for does not exist.', iconName: 'search' });
  }
  return renderAdminShellMarkup({ section: state.admin.section, content: renderAdminSectionContent(), user: state.user });
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

function renderPendingRequestsPageContent() {
  return renderPendingRequestsPageMarkup({ ...state.pendingRequests });
}

async function loadPendingRequests() {
  if (state.pendingRequests.loading) return;
  state.pendingRequests.loading = true;
  render();
  try {
    const { requests } = await api('/api/trees/manage-requests');
    state.pendingRequests.requests = requests;
  } catch (error) {
    showToast(error.message || 'Could not load pending requests.', { type: 'error' });
  } finally {
    state.pendingRequests.loading = false;
    state.pendingRequests.loaded = true;
    render();
  }
}

function attachPendingRequestsListeners() {
  document.querySelectorAll('.pending-request-approve-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDecideJoinRequest(Number(btn.dataset.requestId), 'approved'));
  });
  document.querySelectorAll('.pending-request-reject-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDecideJoinRequest(Number(btn.dataset.requestId), 'rejected'));
  });
}

async function handleDecideJoinRequest(requestId, status) {
  try {
    await api(`/api/trees/requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    state.pendingRequests.requests = state.pendingRequests.requests.filter((r) => r.id !== requestId);
    render();
    showToast(status === 'approved' ? 'Request approved.' : 'Request rejected.');
  } catch (error) {
    showToast(error.message || 'Could not update the request.', { type: 'error' });
  }
}

function renderMyRequestsPageContent() {
  return renderMyRequestsPageMarkup({ ...state.myRequests });
}

async function loadMyRequests() {
  if (state.myRequests.loading) return;
  state.myRequests.loading = true;
  render();
  try {
    const { requests } = await api('/api/trees/my-requests');
    state.myRequests.requests = requests;
  } catch (error) {
    showToast(error.message || 'Could not load your requests.', { type: 'error' });
  } finally {
    state.myRequests.loading = false;
    state.myRequests.loaded = true;
    render();
  }
}

function renderDashboard() {
  const isSecurityView = state.dashboardView === 'security';
  const isCreateTreeView = !isSecurityView && state.dashboardView === 'createTree';
  const isContactView = !isSecurityView && !isCreateTreeView && state.dashboardView === 'contact';
  const isMyTicketsView = !isSecurityView && !isCreateTreeView && !isContactView && state.dashboardView === 'myTickets';
  const isTicketDetailView =
    !isSecurityView && !isCreateTreeView && !isContactView && !isMyTicketsView && state.dashboardView === 'ticketDetail';
  const isPendingRequestsView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    state.dashboardView === 'pendingRequests';
  const isMyRequestsView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    state.dashboardView === 'myRequests';
  const isAdminView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    state.dashboardView === 'admin';
  const isMediaLibraryView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    !isAdminView &&
    state.dashboardView === 'mediaLibrary' &&
    Boolean(state.selectedTreeId);
  const isTimelineView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    !isAdminView &&
    !isMediaLibraryView &&
    state.dashboardView === 'timeline' &&
    Boolean(state.selectedTreeId);
  const isViewerView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    !isAdminView &&
    !isMediaLibraryView &&
    !isTimelineView &&
    Boolean(state.selectedTreeId);

  // "Requests" and "Support" are each a single sidebar nav item covering two
  // sibling views - render the underline tab row above whichever one is
  // active so the other stays reachable. ticketDetail is a drill-in from My
  // Support Tickets (it has its own back-link), so it doesn't get tabs.
  const isRequestsSection = isPendingRequestsView || isMyRequestsView;
  const isSupportSection = isContactView || isMyTicketsView;
  const sectionTabs = isRequestsSection
    ? renderSectionTabs({
        idPrefix: 'requests-tab',
        activeId: isPendingRequestsView ? 'pendingRequests' : 'myRequests',
        tabs: [
          { id: 'myRequests', label: 'My Requests', icon: 'list' },
          { id: 'pendingRequests', label: 'Pending Requests', icon: 'mail' },
        ],
      })
    : isSupportSection
      ? renderSectionTabs({
          idPrefix: 'support-tab',
          activeId: isMyTicketsView ? 'myTickets' : 'contact',
          tabs: [
            { id: 'contact', label: 'Contact Us', icon: 'mail' },
            { id: 'myTickets', label: 'My Support Tickets', icon: 'clock' },
          ],
        })
      : '';

  app.innerHTML = `
    <div class="app-shell ${state.sidebarOpen ? 'sidebar-open' : ''} ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      ${renderSidebarNav({ email: state.user.email, activeView: isCreateTreeView ? 'trees' : state.dashboardView, isAdmin: Boolean(state.user.is_admin), activeTheme: state.theme, collapsed: state.sidebarCollapsed })}
      <div class="main-area">
        ${renderMobileTopbar()}
        <main class="content">
          ${sectionTabs}
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
                      : isPendingRequestsView
                        ? renderPendingRequestsPageContent()
                        : isMyRequestsView
                          ? renderMyRequestsPageContent()
                          : isAdminView
                            ? renderAdminPageContent()
                            : isMediaLibraryView
                              ? renderMediaLibraryPageContent(state.mediaLibrary, {
                                  readOnly: !(state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor'),
                                  currentUserId: state.user?.id,
                                  treeName: state.selectedTreeName,
                                })
                              : isTimelineView
                                ? renderTimelinePageContent(state.timeline, {
                                    memberIndex: state.memberSearchIndex || buildMemberSearchIndex(state.selectedTreeData),
                                    readOnly: !(state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor'),
                                    currentUserId: state.user?.id,
                                    treeName: state.selectedTreeName,
                                  })
                                : isViewerView
                                  ? renderTreeViewerMarkup()
                                  : renderTreesLandingMarkup()
          }
        </main>
        ${renderFooter({ variant: 'dashboard' })}
      </div>
    </div>
  `;

  if (isRequestsSection || isSupportSection) attachSectionTabListeners();

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

  if (isPendingRequestsView) {
    attachPendingRequestsListeners();
    if (!state.pendingRequests.loaded) loadPendingRequests();
    return;
  }

  if (isMyRequestsView) {
    if (!state.myRequests.loaded) loadMyRequests();
    return;
  }

  if (isAdminView) {
    if (state.user.is_admin) attachAdminListeners(state, render);
    return;
  }

  if (isMediaLibraryView) {
    attachMediaLibraryPageListeners(
      state.mediaLibrary,
      {
        api,
        treeId: state.selectedTreeId,
        memberIndex: state.memberSearchIndex || buildMemberSearchIndex(state.selectedTreeData),
        currentUserId: state.user?.id,
        readOnly: !(state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor'),
      },
      render,
      () => {
        state.dashboardView = 'trees';
        render();
      },
      () => {
        clearSelectedTreeView();
        render();
      }
    );
    if (!state.mediaLibrary.loaded) {
      loadMediaLibraryPage(state.mediaLibrary, { api, treeId: state.selectedTreeId }, render);
    }
    return;
  }

  if (isTimelineView) {
    attachTimelinePageListeners(
      state.timeline,
      {
        api,
        treeId: state.selectedTreeId,
        memberIndex: state.memberSearchIndex || buildMemberSearchIndex(state.selectedTreeData),
        currentUserId: state.user?.id,
        readOnly: !(state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor'),
      },
      render,
      () => {
        state.dashboardView = 'trees';
        render();
      },
      () => {
        clearSelectedTreeView();
        render();
      }
    );
    if (!state.timeline.loaded) {
      loadTimelinePage(state.timeline, { api, treeId: state.selectedTreeId }, render);
    }
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

// Sidebar nav is reachable from the authed /support shell (state.publicView
// === 'support'), which - unlike dashboardView - render() checks *before*
// state.user (that's what makes /support public). Leaving publicView set
// while switching dashboardView would trap an authed user on the support
// shell after they click e.g. My Trees, so every nav action clears it and
// resets the URL, matching the data-contact-link/legal-page "back to app"
// pattern used elsewhere.
function navigateToDashboardView(view) {
  state.publicView = null;
  if (window.location.pathname !== '/') window.history.pushState(null, '', '/');
  state.dashboardView = view;
}

function attachShellListeners() {
  document.querySelector('#logout-btn').addEventListener('click', handleSignOut);
  document.querySelector('#nav-trees-btn').addEventListener('click', () => {
    navigateToDashboardView('trees');
    clearSelectedTreeView();
    setSidebarOpen(false);
    render();
  });
  document.querySelector('#nav-security-btn').addEventListener('click', () => {
    navigateToDashboardView('security');
    setSidebarOpen(false);
    render();
    loadMfaStatus();
    loadVaultSnapshots();
  });
  document.querySelector('#nav-support-btn').addEventListener('click', () => {
    navigateToDashboardView('contact');
    setSidebarOpen(false);
    render();
  });
  document.querySelector('#nav-requests-btn').addEventListener('click', () => {
    navigateToDashboardView('myRequests');
    setSidebarOpen(false);
    render();
  });
  document.querySelector('#nav-admin-btn')?.addEventListener('click', () => {
    navigateToDashboardView('admin');
    state.admin.section = 'dashboard';
    setSidebarOpen(false);
    render();
    loadAdminSection(state, render);
  });
  document.querySelector('#sidebar-open-btn')?.addEventListener('click', () => setSidebarOpen(true));
  document.querySelector('#sidebar-close-btn')?.addEventListener('click', () => setSidebarOpen(false));
  document.querySelector('#sidebar-overlay')?.addEventListener('click', () => setSidebarOpen(false));
  document.querySelector('#sidebar-collapse-btn')?.addEventListener('click', () => setSidebarCollapsed(!state.sidebarCollapsed));
  bindDropdownTriggers(document.querySelector('.sidebar'));
  attachThemeToggleListeners();
}

// Switches dashboardView within the current section (Requests or Support) -
// the next render()'s own isMyTicketsView/isPendingRequestsView/etc. guards
// already call the right loadX() when that view isn't loaded yet, so this
// only needs to flip state.dashboardView. Arrow-key roving tabindex mirrors
// attachAuthMethodTabListeners' pattern above.
function attachSectionTabListeners() {
  const tabs = document.querySelectorAll('.section-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.tabId;
      if (view === state.dashboardView) return;
      state.dashboardView = view;
      render();
    });
  });
  const tabList = document.querySelector('.section-tabs');
  tabList?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const list = Array.from(tabs);
    const currentIndex = list.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = list[(currentIndex + delta + list.length) % list.length];
    next.click();
    next.focus();
  });
}

// Wires up every theme-toggle control currently in the DOM (sidebar, and
// potentially the floating Focus Mode toolbar). Deliberately does NOT call
// the app's render() - switching themes is a pure CSS variable/attribute
// change (see theme.js), so rebuilding the whole shell (and tearing down the
// live family-chart DOM/simulation) would be wasted work for what's just a
// color swap.
function attachThemeToggleListeners() {
  document.querySelectorAll('[data-theme-option]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.themeOption;
      if (next !== 'light' && next !== 'dark') return;
      setTheme(next);
    });
  });
}

// Reflects the active theme onto every theme-toggle control in the DOM
// (there may be more than one mounted at once, e.g. sidebar + focus mode
// toolbar) without touching anything else.
function syncThemeToggleButtons(theme) {
  document.querySelectorAll('[data-theme-option]').forEach((btn) => {
    const isActive = btn.dataset.themeOption === theme;
    btn.classList.toggle('theme-toggle-option-active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
}

function setSidebarOpen(open) {
  state.sidebarOpen = open;
  document.querySelector('.app-shell')?.classList.toggle('sidebar-open', open);
}

// Desktop icon-rail collapse. Like setSidebarOpen, this only ever toggles a
// CSS class - it deliberately does NOT call render(), since collapsing the
// sidebar has nothing to do with the tree/chart and shouldn't tear it down.
// The collapse button itself needs its label/title/aria-pressed refreshed in
// place, since those live in the (uncollapsed) markup already on the page.
function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = collapsed;
  document.querySelector('.app-shell')?.classList.toggle('sidebar-collapsed', collapsed);
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch (_error) {
    // Ignore write failures (privacy mode, quota) - the toggle still works
    // for this session.
  }
  const btn = document.querySelector('#sidebar-collapse-btn');
  if (btn) {
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    btn.setAttribute('aria-pressed', String(collapsed));
    const label = btn.querySelector('.nav-label');
    if (label) label.textContent = collapsed ? 'Expand' : 'Collapse';
  }
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

// Only the header is static markup here - everything below it (toolbar,
// discover-search, empty states, and the tree grid itself) is owned by
// renderTreeGrid() into #trees-landing-body, since that's the function every
// data-change call site (loadTrees, sort/filter, create, delete, import...)
// already calls. That lets the empty-state vs active-state layout swap
// happen automatically whenever the tree count changes, without having to
// thread a full top-level render() through every one of those call sites.
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
    <div id="trees-landing-body"></div>
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

function attachJoinResultListeners() {
  document.querySelectorAll('.join-request-btn').forEach((btn) => {
    btn.addEventListener('click', () => openJoinRoleModal(Number(btn.dataset.treeId)));
  });
}

// Collapses the compact "Discover other family branches" box back to its
// idle text-link state (see renderCompactJoinSearch's `expanded` branch) -
// only wired when state.joinSearch.expanded is true, i.e. only for the
// compact toolbar variant on the active (non-empty) trees grid. The
// full-page search on the zero-trees empty state (renderTreesEmptyStateMarkup)
// reuses the same #join-search-input/#join-search-form ids but has no
// expand/collapse concept at all, so this must never run there.
function attachCompactJoinSearchCollapseListeners() {
  const input = document.querySelector('#join-search-input');
  if (!input) return;

  const collapseIfIdle = () => {
    if (!input.value.trim() && document.activeElement !== input) {
      state.joinSearch.expanded = false;
      renderTreeGrid();
    }
  };

  input.addEventListener('blur', () => setTimeout(collapseIfIdle, 0));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (input.value) {
      input.value = '';
    } else {
      input.blur();
    }
  });
}

function attachDiscoverySectionListeners() {
  document.querySelector('#discovery-dismiss-btn')?.addEventListener('click', handleDismissDiscovery);
  document.querySelectorAll('.discovery-join-request-btn').forEach((btn) => {
    btn.addEventListener('click', () => openDiscoveryJoinRoleModal(Number(btn.dataset.treeId)));
  });
}

// Same shape as openJoinRoleModal, but reads from state.discovery.trees
// instead of state.joinSearch.results, and removes the tree from the
// discovery list (rather than flipping a membershipStatus flag) on success,
// since a matched tree's card should just disappear once a request has been
// sent for it.
function openDiscoveryJoinRoleModal(treeId) {
  const tree = state.discovery.trees.find((t) => t.id === treeId);
  if (!tree) return;

  const modal = showModal({
    bodyHtml: renderJoinRoleModalBody({ treeName: tree.name }),
  });

  modal.root.querySelector('#join-role-modal-close-btn').addEventListener('click', modal.close);
  modal.root.querySelector('#join-role-modal-cancel-btn').addEventListener('click', modal.close);
  modal.root.querySelector('#join-role-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const role = String(formData.get('role') || 'viewer');
    const message = String(formData.get('message') || '').trim();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await api(`/api/trees/${treeId}/request-join`, {
        method: 'POST',
        body: JSON.stringify({ role, message: message || undefined }),
      });
      modal.close();
      showToast('Request sent to the tree owner.');
      state.discovery.trees = state.discovery.trees.filter((t) => t.id !== treeId);
      state.myRequests.loaded = false;
      renderTreeGrid();
    } catch (error) {
      showToast(error.message || 'Could not send request.', { type: 'error' });
      submitBtn.disabled = false;
    }
  });
}

async function handleJoinSearch(event) {
  event.preventDefault();
  const query = String(new FormData(event.target).get('query') || '').trim();
  if (!query) return;

  state.joinSearch.query = query;
  state.joinSearch.loading = true;
  state.joinSearch.searched = false;
  render();

  try {
    const { trees } = await api(`/api/trees/search?query=${encodeURIComponent(query)}`);
    state.joinSearch.results = trees;
  } catch (error) {
    state.joinSearch.results = [];
    showToast(error.message || 'Search failed.', { type: 'error' });
  } finally {
    state.joinSearch.loading = false;
    state.joinSearch.searched = true;
    render();
    // render() rebuilds the input from scratch, so a plain .focus() would
    // otherwise leave the caret at position 0 instead of after the typed
    // text - jarring when the compact "discover other family branches" box
    // is narrow (shrunk/mobile view) and the query is long enough to scroll.
    const input = document.querySelector('#join-search-input');
    if (input) {
      input.focus();
      const length = input.value.length;
      input.setSelectionRange(length, length);
    }
  }
}

function openJoinRoleModal(treeId) {
  const tree = state.joinSearch.results.find((t) => t.id === treeId);
  if (!tree) return;

  const modal = showModal({
    bodyHtml: renderJoinRoleModalBody({ treeName: tree.name }),
  });

  modal.root.querySelector('#join-role-modal-close-btn').addEventListener('click', modal.close);
  modal.root.querySelector('#join-role-modal-cancel-btn').addEventListener('click', modal.close);
  modal.root.querySelector('#join-role-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const role = String(formData.get('role') || 'viewer');
    const message = String(formData.get('message') || '').trim();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await api(`/api/trees/${treeId}/request-join`, {
        method: 'POST',
        body: JSON.stringify({ role, message: message || undefined }),
      });
      modal.close();
      showToast('Request sent to the tree owner.');
      const result = state.joinSearch.results.find((t) => t.id === treeId);
      if (result) result.membershipStatus = 'pending';
      state.myRequests.loaded = false;
      render();
    } catch (error) {
      showToast(error.message || 'Could not send request.', { type: 'error' });
      submitBtn.disabled = false;
    }
  });
}

function openRoleChangeModal() {
  const treeId = state.selectedTreeId;
  const treeName = state.selectedTreeName;
  const currentRole = state.selectedTreeRole;
  if (!treeId || !currentRole || currentRole === 'owner') return;

  const modal = showModal({
    bodyHtml: renderRoleChangeModalBody({ treeName, currentRole }),
  });

  modal.root.querySelector('#role-change-modal-close-btn').addEventListener('click', modal.close);
  modal.root.querySelector('#role-change-modal-cancel-btn').addEventListener('click', modal.close);
  modal.root.querySelector('#role-change-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const role = String(formData.get('role') || '');
    const message = String(formData.get('message') || '').trim();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await api(`/api/trees/${treeId}/request-role-change`, {
        method: 'POST',
        body: JSON.stringify({ role, message: message || undefined }),
      });
      modal.close();
      showToast('Role change request sent to the tree owner.');
      state.myRequests.loaded = false;
      render();
    } catch (error) {
      showToast(error.message || 'Could not send request.', { type: 'error' });
      submitBtn.disabled = false;
    }
  });
}

function sortTrees(list, sort) {
  const copy = [...list];
  if (sort === 'alpha') copy.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'created') copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  else copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return copy;
}

// Owns everything below the page header on the homepage: picks between the
// loading skeleton, the empty-state-with-embedded-search layout (zero trees
// on the account), and the active layout (toolbar + compact discover-search
// + tree grid). Called after every load/filter/sort/create/delete so the
// layout swaps automatically as state.trees.length crosses zero.
function renderTreeGrid() {
  const body = document.querySelector('#trees-landing-body');
  if (!body) return;

  if (state.treesLoading && !state.treesLoaded) {
    body.innerHTML = `<div class="tree-grid">${renderSkeletonGrid(6)}</div>`;
    return;
  }

  const discoveryHtml =
    !state.discovery.dismissed && state.discovery.trees.length ? renderDiscoverySectionMarkup({ trees: state.discovery.trees }) : '';

  if (state.trees.length === 0) {
    body.innerHTML = discoveryHtml + renderTreesEmptyStateMarkup(state.joinSearch);
    document.querySelector('#join-search-form').addEventListener('submit', handleJoinSearch);
    document.querySelector('#skip-search-create-btn').addEventListener('click', () => {
      state.dashboardView = 'createTree';
      render();
    });
    attachJoinResultListeners();
    attachDiscoverySectionListeners();
    return;
  }

  body.innerHTML = `
    ${renderTreesToolbarRow({
      search: state.treeSearch,
      sort: state.treeSort,
      discoverSearchHtml: renderCompactJoinSearch({ query: state.joinSearch.query, expanded: state.joinSearch.expanded }),
    })}
    ${discoveryHtml}
    <div id="discover-search-results">${renderCompactJoinSearchResults(state.joinSearch)}</div>
    <div id="tree-grid" class="tree-grid"></div>
  `;

  document.querySelector('#tree-search-input').addEventListener('input', (event) => {
    state.treeSearch = event.target.value;
    renderActiveTreeGrid();
  });
  document.querySelector('#tree-sort-select').addEventListener('change', (event) => {
    state.treeSort = event.target.value;
    renderActiveTreeGrid();
  });

  if (state.joinSearch.expanded) {
    document.querySelector('#join-search-form').addEventListener('submit', handleJoinSearch);
    attachCompactJoinSearchCollapseListeners();
    // The input's `autofocus` attribute (renderCompactJoinSearch) only fires
    // reliably on elements present at initial page parse - browsers don't
    // consistently honor it on markup injected later via innerHTML, which is
    // exactly what happens here after clicking the reveal link. Focus it
    // explicitly so the box doesn't render expanded-but-unfocused (which
    // would then never collapse, since collapseIfIdle requires blur to fire
    // and there was nothing focused to blur from).
    document.querySelector('#join-search-input')?.focus();
  } else {
    document.querySelector('#join-search-reveal-btn').addEventListener('click', () => {
      state.joinSearch.expanded = true;
      renderTreeGrid();
    });
  }
  attachJoinResultListeners();
  attachDiscoverySectionListeners();

  renderActiveTreeGrid();
}

// Toggles #tree-grid between the "No trees match your search" message and
// the actual card grid based on the array that's about to be rendered, so
// the two states can never both be in the DOM at once - the message is only
// ever written when the array driving the grid is empty.
function toggleTreesEmptyState(container, sortedTrees) {
  if (sortedTrees.length === 0) {
    container.innerHTML = renderEmptyState({ mode: 'no-results' });
    document.querySelector('#empty-clear-search-btn')?.addEventListener('click', () => {
      state.treeSearch = '';
      const searchInput = document.querySelector('#tree-search-input');
      if (searchInput) searchInput.value = '';
      renderActiveTreeGrid();
    });
    return true;
  }
  return false;
}

// Just the personal tree-card grid (or its filtered-empty state), scoped
// inside #tree-grid - separated from renderTreeGrid so typing in the
// personal filter box doesn't have to re-render the discover-search widget
// or results panel next to it.
function renderActiveTreeGrid() {
  const container = document.querySelector('#tree-grid');
  if (!container) return;

  const term = state.treeSearch.trim().toLowerCase();
  const filtered = term ? state.trees.filter((tree) => tree.name.toLowerCase().includes(term)) : state.trees;
  const sorted = sortTrees(filtered, state.treeSort);

  if (toggleTreesEmptyState(container, sorted)) return;

  container.innerHTML = sorted
    .map((tree) => renderTreeCard(tree, { renaming: state.renamingTreeId === tree.id }))
    .join('');
  bindTreeGridListeners(container);
}

// Elements inside a tree card that must NOT trigger the card's own
// open-tree click handler - the kebab menu/dropdown, the rename form and its
// buttons, and the "Open" button (which already opens the tree itself).
const TREE_CARD_INTERACTIVE_SELECTOR =
  '.tree-card-menu-wrap, .tree-rename-form, .tree-open-btn, .tree-card-title';

// A disabled tree stays visible (with a badge) so owners/collaborators know
// why it vanished, but requireTreeRole rejects every role on the backend -
// short-circuit here instead of round-tripping a 403 into an unhandled
// rejection from loadTree().
function openTreeIfEnabled(treeId, card) {
  if (card?.dataset.treeStatus === 'disabled') {
    showToast('This family tree has been disabled and cannot be opened.', { type: 'error' });
    return;
  }
  loadTree(treeId);
}

function bindTreeGridListeners(container) {
  container.querySelectorAll('.tree-open-btn, .tree-card-title').forEach((el) => {
    el.addEventListener('click', () => openTreeIfEnabled(Number(el.dataset.treeId), el.closest('.tree-card-clickable')));
  });

  // Whole-card click/keyboard-activation to open the tree, per the
  // role="button" tabindex="0" article markup in renderTreeCard - skipped
  // when the click originated inside a nested interactive control (those
  // already have their own handlers above) or while the card is mid-rename.
  container.querySelectorAll('.tree-card-clickable').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest(TREE_CARD_INTERACTIVE_SELECTOR)) return;
      if (card.querySelector('.tree-rename-form')) return;
      openTreeIfEnabled(Number(card.dataset.treeId), card);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest(TREE_CARD_INTERACTIVE_SELECTOR)) return;
      if (card.querySelector('.tree-rename-form')) return;
      event.preventDefault();
      openTreeIfEnabled(Number(card.dataset.treeId), card);
    });
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
  if (action === 'tree-settings') {
    return loadTree(treeId, { viewMode: 'settings' });
  }
  if (action === 'share') {
    return openShareModal(treeId);
  }
  if (action === 'vault-snapshot') {
    return handleCreateVaultSnapshotForTree(treeId);
  }
  if (action === 'delete') {
    const tree = state.trees.find((t) => t.id === treeId);
    promptDeleteTree(treeId, tree?.name || 'this tree');
  }
  if (action === 'enable-tree') {
    return handleEnableTreeFromCard(treeId);
  }
}

// The only card action offered on a disabled tree (see renderTreeCard) -
// every other action, including "Tree Settings", calls a requireTreeRole-
// gated route and would 403 while disabled, so re-enabling can't go through
// loadTree()/the settings panel at all. Operates on the card directly
// instead: no viewer is open, so there's no selectedTree* state to update or
// clear, just the grid's own tree list.
async function handleEnableTreeFromCard(treeId) {
  const tree = state.trees.find((t) => t.id === treeId);
  try {
    const payload = await api(`/api/trees/${treeId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
    if (tree) tree.status = payload.tree.status;
    renderTreeGrid();
    showToast(`"${tree?.name || payload.tree.name}" has been re-enabled.`);
  } catch (error) {
    showToast(error.message || 'Could not enable this tree.', { type: 'error' });
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
    <div id="tree-focus-target" class="tree-focus-target">
      <div class="tree-toolbar-row">
        <div id="view-mode-toggle"></div>
      </div>
      <div class="chart-canvas-wrap">
        <div id="FamilyChart" class="f3 chart-container"></div>
        ${renderCanvasFloatingControls()}
      </div>
    </div>
    ${renderFamilyFeedPanel()}
  `;
}

// ---------------------------------------------------------------------------
// Family Feed (slide-out activity panel)
// ---------------------------------------------------------------------------

const FAMILY_FEED_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'update', label: 'Updates' },
  { value: 'milestone', label: 'Milestones' },
];

// activity_type (from the backend) -> { bucket: filter pill this item
// belongs to, badge: which .activity-badge-- variant to draw }.
const FAMILY_FEED_TYPE_META = {
  media_added: { bucket: 'update', badge: 'add' },
  event_added: { bucket: 'update', badge: 'edit' },
  member_added: { bucket: 'milestone', badge: 'add' },
  birthday: { bucket: 'milestone', badge: 'birthday' },
};

function familyFeedActorName(item) {
  return item.actor_email || 'Someone';
}

function familyFeedRelativeTime(isoString) {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(isoString).toLocaleDateString();
}

// Day-granularity label for a birthday's effective_at date, relative to
// today - distinct from familyFeedRelativeTime (which handles logged
// activity's created_at, always in the past, down to minute granularity).
// Birthdays can be up to +/-7 days from today (see BIRTHDAY_WINDOW_DAYS on
// the backend), so this needs both "in N days" and "N days ago" phrasing.
function familyFeedDayLabel(isoString) {
  const target = new Date(isoString);
  if (Number.isNaN(target.getTime())) return '';
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const diffDays = Math.round((targetUtc - todayUtc) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  return diffDays > 0 ? `in ${diffDays} days` : `${Math.abs(diffDays)} days ago`;
}

function familyFeedPersonLink(memberId, memberName) {
  if (!memberId || !memberName) return escapeHtml(memberName || 'someone');
  return `<a href="#" class="activity-person-link" data-person-id="${escapeHtml(memberId)}">${escapeHtml(memberName)}</a>`;
}

function familyFeedItemText(item) {
  const actor = `<strong>${escapeHtml(familyFeedActorName(item))}</strong>`;
  const person = familyFeedPersonLink(item.member_id, item.member_name);
  switch (item.activity_type) {
    case 'media_added':
      return `${actor} added a new photo for ${person}`;
    case 'event_added':
      return `${actor} added a new event: ${escapeHtml(item.event_title || 'Untitled event')}`;
    case 'member_added':
      return `${actor} added a new family member, ${person}`;
    case 'birthday': {
      const ageText = item.age ? ` turns <strong>${escapeHtml(String(item.age))}</strong>` : '’s birthday';
      return item.is_today ? `${person}${ageText} today` : `${person}${ageText} ${familyFeedDayLabel(item.effective_at)}`;
    }
    default:
      return escapeHtml(item.summary || '');
  }
}

const FAMILY_FEED_BADGE_ICON_PATHS = {
  add: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  edit: '<path d="M16.5 4.5 19.5 7.5 8 19 4.5 19.5 5 16 16.5 4.5Z"></path>',
  birthday:
    '<path d="M4 20.5h16"></path><path d="M5 20.5v-6a1.5 1.5 0 0 1 1.5-1.5h11a1.5 1.5 0 0 1 1.5 1.5v6"></path><path d="M5 16.5c1 .8 2 .8 3 0s2-.8 3 0 2 .8 3 0 2-.8 3 0"></path><path d="M12 13V9"></path><path d="M12 9c-1 0-1.5-.6-1.5-1.3S11 6 12 4.5c1 1.5 1.5 2.4 1.5 3.2S13 9 12 9Z"></path>',
};

function familyFeedItemHtml(item) {
  const meta = FAMILY_FEED_TYPE_META[item.activity_type] || { bucket: 'update', badge: 'add' };
  const timestamp =
    item.activity_type === 'birthday'
      ? familyFeedDayLabel(item.effective_at).replace(/^./, (c) => c.toUpperCase())
      : familyFeedRelativeTime(item.effective_at);
  return `
    <li class="activity-item" data-type="${meta.bucket}">
      <span class="activity-badge activity-badge--${meta.badge}" aria-hidden="true">
        <svg viewBox="0 0 24 24">${FAMILY_FEED_BADGE_ICON_PATHS[meta.badge]}</svg>
      </span>
      <div class="activity-card">
        <p class="activity-text">${familyFeedItemText(item)}</p>
        <span class="activity-timestamp">${escapeHtml(timestamp)}</span>
      </div>
    </li>
  `;
}

function renderFamilyFeedListHtml() {
  const { items, filter } = state.familyFeed;
  const filtered = filter === 'all' ? items : items.filter((item) => (FAMILY_FEED_TYPE_META[item.activity_type]?.bucket || 'update') === filter);
  if (!state.familyFeed.loaded) return '<p class="family-feed-empty">Loading&hellip;</p>';
  if (!filtered.length) return '<p class="family-feed-empty">No activity yet.</p>';
  return filtered.map(familyFeedItemHtml).join('');
}

function renderFamilyFeedPanel() {
  const { open, filter } = state.familyFeed;
  return `
    <div class="family-feed-backdrop${open ? ' opened' : ''}" id="family-feed-backdrop"></div>
    <aside class="family-feed-panel${open ? ' opened' : ''}" id="family-feed-panel" aria-hidden="${open ? 'false' : 'true'}" aria-label="Family feed">
      <header class="family-feed-header">
        <h2 class="family-feed-title">Family Feed</h2>
        <button type="button" class="icon-btn" id="family-feed-close-btn" aria-label="Close family feed">${icon('close')}</button>
      </header>
      <div class="family-feed-filters" role="group" aria-label="Filter activity">
        ${FAMILY_FEED_FILTERS.map(
          (f) => `<button type="button" class="chip ${filter === f.value ? 'chip-active' : ''}" data-filter="${f.value}">${f.label}</button>`
        ).join('')}
      </div>
      <div class="family-feed-body">
        <ul class="activity-list" id="family-feed-list">${renderFamilyFeedListHtml()}</ul>
      </div>
    </aside>
  `;
}

// In-place DOM update (toggle classes, re-render just the list) instead of a
// full render() - opening a side panel shouldn't tear down/rebuild the d3
// chart underneath it.
function renderFamilyFeedPanelInPlace() {
  const panel = document.querySelector('#family-feed-panel');
  const backdrop = document.querySelector('#family-feed-backdrop');
  if (!panel || !backdrop) return;
  panel.classList.toggle('opened', state.familyFeed.open);
  backdrop.classList.toggle('opened', state.familyFeed.open);
  panel.setAttribute('aria-hidden', state.familyFeed.open ? 'false' : 'true');
  panel.querySelectorAll('.family-feed-filters .chip').forEach((btn) => {
    btn.classList.toggle('chip-active', btn.dataset.filter === state.familyFeed.filter);
  });
  const list = document.querySelector('#family-feed-list');
  if (list) list.innerHTML = renderFamilyFeedListHtml();
}

function openFamilyFeed() {
  state.familyFeed.open = true;
  if (!state.familyFeed.loaded && !state.familyFeed.loading && state.selectedTreeId) {
    state.familyFeed.loading = true;
    listFamilyFeed(api, state.selectedTreeId)
      .then((result) => {
        state.familyFeed.items = result.activity;
        state.familyFeed.loaded = true;
      })
      .catch((error) => {
        showToast(error.message || 'Could not load family feed', { type: 'error' });
      })
      .finally(() => {
        state.familyFeed.loading = false;
        renderFamilyFeedPanelInPlace();
      });
  }
  renderFamilyFeedPanelInPlace();
}

function closeFamilyFeed() {
  state.familyFeed.open = false;
  renderFamilyFeedPanelInPlace();
}

function attachFamilyFeedListeners() {
  document.querySelector('#family-feed-btn')?.addEventListener('click', () => openFamilyFeed());
  document.querySelector('#family-feed-close-btn')?.addEventListener('click', () => closeFamilyFeed());
  document.querySelector('#family-feed-backdrop')?.addEventListener('click', () => closeFamilyFeed());

  const panel = document.querySelector('#family-feed-panel');
  panel?.querySelectorAll('.family-feed-filters .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.familyFeed.filter = btn.dataset.filter;
      renderFamilyFeedPanelInPlace();
    });
  });

  document.querySelector('#family-feed-list')?.addEventListener('click', (event) => {
    const link = event.target.closest('.activity-person-link');
    if (!link) return;
    event.preventDefault();
    closeFamilyFeed();
    selectSearchedMember(link.dataset.personId);
  });
}

// Binds everything that lives inside .viewer-header (breadcrumb, save,
// share/rename/import, the settings dropdown, and member search - which
// renders inside the header markup). Split out from attachTreeViewerListeners
// so a role change (e.g. after transferring ownership) can re-render just the
// header and rebind it, without rebuilding the focus-mode controller or
// re-attaching the family feed listeners (those live outside the header and
// are only meant to be wired once per tree-viewer mount).
function attachTreeViewerHeaderListeners() {
  document.querySelector('#breadcrumb-trees-btn').addEventListener('click', () => {
    clearSelectedTreeView();
    render();
  });
  document.querySelector('#save-btn').addEventListener('click', handleSaveTree);
  document.querySelector('#share-tree-btn')?.addEventListener('click', () => openShareModal(state.selectedTreeId));
  document.querySelector('#request-role-change-btn')?.addEventListener('click', () => openRoleChangeModal());
  document.querySelector('#rename-tree-inline-btn')?.addEventListener('click', () => openRenameTreeModal());
  document.querySelector('#import-tree-json-input')?.addEventListener('change', handleImportTree);

  const header = document.querySelector('.viewer-header');
  bindDropdownTriggers(header);
  header?.querySelectorAll('.dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => handleViewerSettingsAction(btn.dataset.action));
  });

  attachMemberSearchListeners();
}

// Re-renders .viewer-header from current state (used after an action that can
// change the signed-in user's role on the currently open tree, e.g.
// transferring ownership away) so owner-only controls (Share button, Delete
// Tree, etc.) disappear immediately instead of staying visible until the next
// full page load - clicking them afterwards would just 403 against the server,
// which otherwise reads as "I lost access to my tree".
function refreshTreeViewerHeader() {
  const header = document.querySelector('.viewer-header');
  if (!header) return;
  header.outerHTML = renderTreeViewerHeader({ treeName: state.selectedTreeName, role: state.selectedTreeRole });
  attachTreeViewerHeaderListeners();
}

function attachTreeViewerListeners() {
  attachTreeViewerHeaderListeners();
  document.querySelector('#reset-view-btn')?.addEventListener('click', handleResetView);
  document.querySelector('#focus-mode-btn')?.addEventListener('click', () => focusModeController?.toggle());

  attachFamilyFeedListeners();
  setupFocusMode();
}

// ---------------------------------------------------------------------------
// Member search
// ---------------------------------------------------------------------------

function attachMemberSearchListeners() {
  const container = document.querySelector('#member-search');
  const input = document.querySelector('#member-search-input');
  const resultsEl = document.querySelector('#member-search-results');
  const clearBtn = document.querySelector('#member-search-clear-btn');
  if (!container || !input || !resultsEl || !clearBtn) return;

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

  if (state.viewMode === 'relationship-manager' || state.viewMode === 'duplicate-manager') {
    // The tree-toolbar member search isn't wired into either mode's own
    // panels - fall back to Focused mode, same as the All Nodes case below.
    state.focusedMainId = id;
    state.viewMode = 'focused';
    renderChart();
    highlightFocusedCard(id);
    return;
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

  // If the searched person is already part of the currently rendered tree
  // (getTreeDatum only returns nodes calculateTree actually laid out - e.g.
  // within ancestryDepth/progenyDepth of the current main_id), just pan/
  // center on their existing card instead of re-rooting the whole tree onto
  // them. Re-rooting is a heavier, more disorienting jump (the visible
  // subtree changes) and isn't needed when they're already on screen.
  // getTreeDatum throws if the chart hasn't laid out a tree yet at all
  // (rather than returning undefined) - shouldn't happen here since
  // renderChart() always calls updateTree() right after createChart(), but
  // guard it anyway so a search never hard-crashes the app.
  let existingTreeDatum;
  try {
    existingTreeDatum = state.chart.store.getTreeDatum(id);
  } catch {
    existingTreeDatum = undefined;
  }
  if (existingTreeDatum) {
    f3.handlers.cardToMiddle({
      datum: existingTreeDatum,
      svg: state.chart.svg,
      svg_dim: state.chart.svg.getBoundingClientRect(),
      transition_time: 600,
    });
    highlightFocusedCard(id);
    return;
  }

  // Not currently rendered (outside the depth-capped tree, or a fresh
  // load) - fall back to the full re-root.
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

// ---------------------------------------------------------------------------
// Focus Mode (maximize the tree)
// ---------------------------------------------------------------------------

let focusModeController = null;

// Re-fits/re-centers whichever view is currently active to its (now resized)
// container, without re-rooting or reloading any data - same zero-transition
// idea as handleResetView, just without changing state.focusedMainId.
function refitActiveView(transition_time = 0) {
  if (state.viewMode === 'all-nodes') {
    state.allNodesGraph?.resetView?.();
    return;
  }
  state.chart?.updateTree?.({ initial: false, tree_position: 'fit', transition_time });
}

function focusModeZoom(amount) {
  const svg = state.chart?.svg;
  if (!svg) return;
  f3.handlers.manualZoom({ amount, svg, transition_time: 200 });
}

function focusModeCenter() {
  if (!state.chart) return;
  state.chart.updateTree({ initial: false, tree_position: 'main_to_middle', transition_time: 400 });
}

// Zoom/Center only make sense against the live d3 chart (Focused mode) - All
// Nodes mode has its own pan/zoom with no equivalent hooks, so disable those
// two floating-toolbar buttons instead of leaving them as silent no-ops.
function syncFocusModeToolbarState() {
  const disabled =
    state.viewMode === 'all-nodes' ||
    state.viewMode === 'relationship-manager' ||
    state.viewMode === 'duplicate-manager' ||
    state.viewMode === 'settings';
  focusModeController?.setActionDisabled('zoom-in', disabled);
  focusModeController?.setActionDisabled('zoom-out', disabled);
  focusModeController?.setActionDisabled('center', disabled);
}

// Member search lives in Row 2 (.viewer-header) now, which Focus Mode hides
// entirely along with the rest of the page chrome - so it has to physically
// move into #tree-focus-target to stay usable while maximized, then move
// back on exit rather than leaving a detached duplicate behind.
let memberSearchHomeMarker = null;

function relocateMemberSearchForFocusMode(active) {
  const memberSearch = document.querySelector('#member-search');
  if (!memberSearch) return;
  if (active) {
    memberSearchHomeMarker = document.createComment('member-search-home');
    memberSearch.after(memberSearchHomeMarker);
    document.querySelector('#tree-focus-target')?.prepend(memberSearch);
  } else if (memberSearchHomeMarker) {
    memberSearchHomeMarker.after(memberSearch);
    memberSearchHomeMarker.remove();
    memberSearchHomeMarker = null;
  }
}

// Runs once the enter/exit CSS transition has finished (focusMode.js calls
// onEnter/onExit after its own transition timer, so this never races a
// refit against a container that's still mid-resize).
function onFocusModeTransitionEnd(active) {
  document.querySelector('#focus-mode-btn')?.setAttribute('aria-pressed', String(active));
  relocateMemberSearchForFocusMode(active);
  if (active) syncFocusModeToolbarState();
  refitActiveView(0);
}

// Built once per tree-viewer mount (attachTreeViewerListeners() runs once
// when the viewer page is injected; renderChart() runs again on every
// Focused/All-Nodes toggle but never touches #tree-focus-target, so the
// controller doesn't need rebuilding then).
function setupFocusMode() {
  focusModeController = createFocusMode({
    containerSelector: '#tree-focus-target',
    actions: [
      { id: 'exit', label: 'Exit Focus Mode (Esc)', iconName: 'minimize', onClick: () => focusModeController.exit() },
      'separator',
      { id: 'reset-view', label: "Reset to the tree's default view", iconName: 'home', onClick: () => handleResetView() },
      { id: 'zoom-in', label: 'Zoom In', iconName: 'zoomIn', onClick: () => focusModeZoom(1.3) },
      { id: 'zoom-out', label: 'Zoom Out', iconName: 'zoomOut', onClick: () => focusModeZoom(1 / 1.3) },
      { id: 'fit', label: 'Fit Tree', iconName: 'scan', onClick: () => refitActiveView(400) },
      { id: 'center', label: 'Center Tree', iconName: 'crosshair', onClick: () => focusModeCenter() },
      'separator',
      { id: 'toggle-theme', label: 'Toggle Light/Dark Theme', iconName: 'sun', onClick: () => setTheme(state.theme === 'dark' ? 'light' : 'dark') },
    ],
    onEnter: () => onFocusModeTransitionEnd(true),
    onExit: () => onFocusModeTransitionEnd(false),
  });
}

function handleViewerSettingsAction(action) {
  if (action === 'rename') return openRenameTreeModal();
  if (action === 'vault-snapshot') return handleCreateVaultSnapshotForTree(state.selectedTreeId);
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
  if (state.viewMode !== 'focused') {
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
    state.relationshipBuilder.dirty = false;
    state.relationshipManager.dirty = false;
    state.duplicateManager.dirty = false;
    showToast('Tree saved successfully.');
  } catch (error) {
    showToast(error.message || 'Save failed.', { type: 'error' });
  } finally {
    syncSaveButtonAvailability();
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
  const treeName = state.trees.find((t) => t.id === treeId)?.name || state.selectedTreeName || '';
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
    const isOwnerViewing = payload.permissions.some(
      (permission) => permission.role === 'owner' && permission.user_id === state.user.id
    );
    modal.setBody(
      renderShareModalBody({ treeName, permissions: payload.permissions, loading: false, error: '', formError, isOwnerViewing })
    );
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

  bindDropdownTriggers(modal.root);

  modal.root.querySelectorAll('[data-role-option]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = Number(btn.dataset.userId);
      const role = btn.dataset.roleOption;
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

  modal.root.querySelectorAll('[data-transfer-owner-user-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const toUserId = Number(btn.dataset.transferOwnerUserId);
      if (!window.confirm('Make this person the owner? You will become an editor and lose owner-only controls.')) return;

      btn.disabled = true;
      try {
        await api(`/api/account/trees/${treeId}/transfer-ownership`, {
          method: 'POST',
          body: JSON.stringify({ toUserId }),
        });
        showToast('Ownership transferred.');
        if (state.selectedTreeId === treeId) {
          state.selectedTreeRole = 'editor';
          refreshTreeViewerHeader();
        }
        await refreshShareModal(modal, treeId, treeName);
        loadTrees();
      } catch (error) {
        showToast(error.message || 'Could not transfer ownership.', { type: 'error' });
        btn.disabled = false;
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
const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const isAnonymous = form.dataset.anonymous === 'true';
  const email = String(data.get('email') || '').trim();

  let firstInvalidId = null;
  const markInvalid = (field, message_, inputId) => {
    setContactFieldError(field, message_);
    if (message_ && !firstInvalidId) firstInvalidId = inputId;
  };

  if (isAnonymous) {
    markInvalid('email', !CONTACT_EMAIL_PATTERN.test(email) ? 'Please enter a valid email address.' : '', 'contact-email-input');
  }

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
    if (form.dataset.anonymous === 'true') {
      await submitPublicContactForm(new FormData(form));
      showToast("Message sent. We'll be in touch soon.");
      // The authed path replaces this form entirely via render() (navigates
      // to the new ticket), so it never needs a manual reset - but this
      // anonymous form stays mounted after a successful send, so it has to
      // clear itself and restore the button explicitly.
      form.reset();
      handleContactFileChange(document.querySelector('#contact-file-input'));
      if (document.body.contains(submitBtn)) setButtonBusy(submitBtn, false, 'Send Message');
    } else {
      const ticket = await createTicketFromContact(state, render, new FormData(form));
      showToast(`Ticket ${ticket.ticket_number} created. We'll be in touch soon.`);
    }
  } catch (error) {
    formErrorEl.textContent = error.message || 'Could not send your message. Please try again.';
    showToast(error.message || 'Could not send your message.', { type: 'error' });
    if (document.body.contains(submitBtn)) setButtonBusy(submitBtn, false, 'Send Message');
  }
}

function clearSelectedTreeView() {
  focusModeController?.destroy();
  focusModeController = null;
  cleanupAllNodesGraph();
  state.selectedTreeId = null;
  state.selectedTreeRole = null;
  state.selectedTreeData = [];
  state.selectedTreeName = '';
  state.selectedTreeStatus = 'active';
  state.chart = null;
  state.editor = null;
  state.viewMode = 'focused';
  state.focusedMainId = null;
  state.defaultMainId = null;
  state.treeDefaultMainId = null;
  state.relationshipManager = createRelationshipManagerState();
  state.duplicateManager = createDuplicateManagerState();
  closeMemberSearchResults();
  state.memberSearchIndex = null;
  state.mediaLibrary = createMediaLibraryPageState();
  state.timeline = createTimelinePageState();
  state.familyFeed = { open: false, loaded: false, loading: false, filter: 'all', items: [] };
}

// Appends one of the small circular hover-icon buttons tree cards use (e.g.
// drilldown, more) to `cardEl`, positioned along its top edge. Shared by both
// the editor and viewer card-rendering paths in renderChart() below.
// `horizontalPosition` is either a number (right offset in px, anchored to
// the right edge - used for icons that sit alongside each other, like the
// more icon) or the string 'center' (centered on the card's top edge via
// left:50%/translateX(-50%) - used for the standalone drilldown icon).
// `topOffset` defaults to 0 (flush with the card's top edge); pass a
// negative value (e.g. -10, half the icon's own height) to straddle the
// card's border so half the icon sits outside the card and half inside.
// data-tooltip drives the CSS-only tooltip (see the "Tooltips" section of
// styles.css) - positioned below the icon since these sit flush against the
// top edge of the card, where a top-positioned tooltip would get clipped by
// whatever tree row is rendered above it.
function addCardIcon(cardEl, horizontalPosition, iconHtml, onClick, tooltipLabel, topOffset = 0) {
  const isCentered = horizontalPosition === 'center';
  // Centering needs a `translateX(-50%)` transform, but the library's own
  // `.f3 div.card:hover > div` rule applies a -2px hover transform to every
  // direct child of `.card`, which styles.css resets back to `none` via
  // `.f3 div.card > .f3-svg-circle-hover { transform: none !important }` -
  // that reset would otherwise clobber the inline centering transform too.
  // f3-svg-circle-hover-center gets its own, more specific override instead
  // (see styles.css) so both the hover-reset and the centering can coexist.
  const positionStyle = isCentered
    ? 'left: 50%;'
    : `right: ${horizontalPosition}px;`;
  const iconSelection = d3.select(cardEl)
    .append('div')
    // `relative` so this icon's own box (not the card's) becomes the
    // offset parent for a popover appended inside it (see openCardMoreMenu),
    // letting the popover anchor to the icon instead of the whole card.
    .attr('class', `f3-svg-circle-hover${isCentered ? ' f3-svg-circle-hover-center' : ''} relative`)
    .attr('style', `cursor: pointer; width: 20px; height: 20px; position: absolute; top: ${topOffset}px; ${positionStyle}`)
    .attr('data-tooltip', tooltipLabel)
    .attr('data-tooltip-position', 'bottom')
    .html(iconHtml);
  iconSelection
    .select('svg')
    .style('padding', '0')
    .on('click', onClick);
  return iconSelection.node();
}

// Closes the tree card "more" popover (see openCardMoreMenu in renderChart
// below), if one is open. Pure DOM cleanup with no render-specific state, so
// it lives at module scope rather than being redefined on every renderChart().
function closeCardMoreMenu() {
  document.querySelectorAll('.f3-card-more-menu').forEach((m) => m.remove());
}

// Birthdays are free-text (often just a bare year, or blank - see
// docs/data-format.md) rather than a strict ISO date, so this can't just
// subtract `new Date(...)` values: an unparseable/missing birthday must sort
// after known ones instead of corrupting the comparison with NaN.
function parseBirthdayForSort(birthday) {
  if (!birthday || typeof birthday !== 'string') return null;
  const trimmed = birthday.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  const time = new Date(trimmed).getTime();
  return Number.isNaN(time) ? null : time;
}

// Receives raw Datum records (see src/layout/calculate-tree.ts's
// `children.sort(sortChildrenFunction)`), not TreeDatum tree nodes - so
// birthday lives at a.data.birthday, one level shallower than card-rendering
// code that walks TreeDatum.data.data.
function sortChildrenByBirthday(a, b) {
  const aTime = parseBirthdayForSort(a.data?.birthday);
  const bTime = parseBirthdayForSort(b.data?.birthday);
  if (aTime === null && bTime === null) return 0;
  if (aTime === null) return 1; // unknown birthdays last
  if (bTime === null) return -1;
  return aTime - bTime;
}

function renderChart() {
  cleanupAllNodesGraph();
  if (state.viewMode === 'duplicate-manager') {
    renderDuplicateManagerViewMode();
    setupViewModeToggle();
    return;
  }
  if (state.viewMode === 'relationship-manager') {
    renderRelationshipManagerViewMode();
    setupViewModeToggle();
    return;
  }
  if (state.viewMode === 'all-nodes') {
    renderAllNodesMode();
    setupViewModeToggle();
    return;
  }
  if (state.viewMode === 'settings') {
    renderTreeSettingsViewMode();
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
    .setCardYSpacing(150)
    .setSortChildrenFunction(sortChildrenByBirthday)
    // Without this, siblings of the focused person are invisible until you
    // re-root onto a parent (which shows that parent's children - your
    // siblings - as a side effect). This shows them directly on whoever is
    // currently focused, matching the "why can't I see my own siblings"
    // report.
    .setShowSiblingsOfMain(true);

  // The tree owner can configure "unlimited" as the default
  // (state.ancestryDepth/progenyDepth === null) from the Settings tab. In
  // that case, just skip setAncestryDepth/setProgenyDepth entirely rather
  // than passing some sentinel "unlimited" value, since calculateTree only
  // applies a cap when state.ancestry_depth/progeny_depth is not undefined.
  if (state.ancestryDepth !== null && state.progenyDepth !== null) {
    state.chart.setAncestryDepth(state.ancestryDepth).setProgenyDepth(state.progenyDepth);
  }

  // Re-root on whatever was previously focused (e.g. coming back from All
  // Nodes mode, or a member found via search) instead of always defaulting
  // back to the first person in the data.
  if (state.focusedMainId && state.selectedTreeData.some((d) => d.id === state.focusedMainId)) {
    state.chart.updateMainId(state.focusedMainId);
  }

  // No setDefaultPersonIcon() override: the library's own default
  // (personSvgIcon, a plain bust silhouette) already renders inside
  // `.person-icon`, which family-chart.css colors per gender via
  // --female-color/--male-color/--genderless-color - and those tokens
  // already fall back to our own --tree-female/--tree-male/--tree-genderless
  // (see src/styles/family-chart.css:6-8), so it's already on-theme with no
  // extra wiring needed.
  const card = state.chart
    .setCard(f3.CardHtml)
    .setCardDisplay([['first name', 'last name'], ['birthday', 'location']]);

  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';
  if (canEdit) {
    state.editor = state.chart
      .editTree()
      .setFields(['first name', 'last name', { id: 'birthday', type: 'date', label: 'birthday' }, 'location', 'email', 'notes', 'avatar'])
      .setEditFirst(true)
      .setLinkExistingRelConfig({
        title: 'Link to an existing member instead?',
        select_placeholder: 'Select existing member',
        linkRelLabel: (d) => getMemberLabel(d),
      })
      .setOnFormCreation(({ cont, form_creator }) => {
        hydrateAvatarPreview(cont);
        // attachAvatarUpload needs the full datum (not just datum_id) to tag
        // the uploaded photo to the right person - form_creator only carries
        // datum_id (src/types/form.ts), not the full datum, so look it up
        // from the chart's store instead of reading a `.datum` property that
        // doesn't exist on FormCreator.
        const datum = state.chart.store.getDatum(form_creator.datum_id);
        if (!datum) return;
        attachAvatarUpload({ cont, datum, api, treeId: state.selectedTreeId });
      });

    // Canceling add-relative mode (EditTree's internal cancelCallback) always
    // reopens the edit form for that person as a side effect, regardless of
    // how the cancel was triggered. We don't want that here — canceling
    // should just hide the add-relative placeholder boxes — so close the
    // form again right after in the same synchronous tick.
    const cancelAddRelative = () => {
      if (!state.editor.isAddingRelative()) return;
      state.editor.addRelativeInstance.onCancel();
      state.editor.closeForm();
    };

    if (!state.escapeCancelsAddRelativeBound) {
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!state.editor || !state.editor.isAddingRelative()) return;
        cancelAddRelative();
      });
      state.escapeCancelsAddRelativeBound = true;
    }

    // Card body click now opens the person's profile directly (view-first;
    // the form itself has its own pencil to switch to edit). Drilldown and
    // the add-relative/edit actions move to two always-visible icons in the
    // card's top-right corner so they don't collide with the click target:
    // a tree icon for re-rooting, and a "more" (⋯) icon that opens a small
    // popover with Edit / Add relative. Icons are appended to `.card`
    // itself, as siblings of `.card-inner`, not inside it: `.card:hover > div`
    // in the library CSS applies a -2px hover transform to every direct
    // child of `.card`, so an icon appended inside `.card-inner` would shift
    // on hover along with it.
    card.setOnCardUpdate(function cardUpdate(d) {
      if (d.data._new_rel_data) return;
      if (state.editor.isRemovingRelative()) return;

      const cardEl = this.querySelector('.card');
      if (!cardEl) return;

      // Drilldown icon: pure navigation, re-root the tree on this person.
      // Only shown when there's actually a subtree left to reveal - hidden
      // entirely (not just a no-op click) once everything about this person
      // is already displayed.
      if (!d.all_rels_displayed) {
        addCardIcon(cardEl, 'center', f3.icons.drilldownSvgIcon(), (e) => {
          e.stopPropagation();
          state.editor.closeForm();
          card.onCardClickDefault(e, d);
        }, 'Drill down', -10);
      }

      // More icon: opens a small popover with Edit and Add relative. Built
      // directly here (not the app's shared dropdownMenu()) since that
      // helper targets static page markup and app-icon set, not per-card
      // D3-driven re-renders using f3.icons' inline SVGs.
      const moreIconEl = addCardIcon(cardEl, 0, f3.icons.moreSvgIcon(), (e) => {
        e.stopPropagation();
        openCardMoreMenu(moreIconEl, d);
      }, 'More');
    });

    // Popover for the "more" icon. Reuses the app's .dropdown-menu/.dropdown-item
    // classes for visual consistency, but is built by hand (not
    // components.js's dropdownMenu()) since it's driven by f3's per-card
    // TreeDatum rather than static page state, and needs direct click
    // handlers rather than the data-action dispatch used elsewhere.
    //
    // Anchored to the "..." icon itself (anchorEl), not the whole card - the
    // icon div is `position: absolute` inside the card, so it isn't itself an
    // offset parent, but appending the menu as its child still positions the
    // menu relative to the icon's own box (top-left corner) rather than the
    // card's, which is what previously made the popover anchor to the
    // bottom of the entire card instead of tucking under the small circular
    // button.
    function openCardMoreMenu(anchorEl, d) {
      const alreadyOpenForThisCard = anchorEl.querySelector('.f3-card-more-menu');
      closeCardMoreMenu();
      if (alreadyOpenForThisCard) return;

      const menu = document.createElement('div');
      menu.className = 'dropdown-menu open f3-card-more-menu';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'dropdown-item';
      editBtn.innerHTML = `${f3.icons.userEditSvgIcon()}<span>Edit</span>`;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCardMoreMenu();
        state.editor.setEditFirst(true);
        state.editor.open(d.data);
      });

      const addRelativeBtn = document.createElement('button');
      addRelativeBtn.type = 'button';
      addRelativeBtn.className = 'dropdown-item';
      addRelativeBtn.innerHTML = `${f3.icons.userPlusSvgIcon()}<span>Add relative</span>`;
      addRelativeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCardMoreMenu();
        activateAddRelative(d.data, { linkMode: false });
      });

      // Link existing member: activates the same placeholder-slot flow as
      // "Add relative" (father/mother/spouse/son/daughter), but in link mode
      // the placeholder cards read "Link Father"/"Link Mother"/etc (via
      // setAddRelLabels below) and clicking one opens a form that shows
      // *only* the "existing member" picker (wired via
      // setLinkExistingRelConfig above) - the create-new name/birthday/etc
      // fields are hidden entirely so linking can't be confused with
      // creating a new person.
      const linkExistingBtn = document.createElement('button');
      linkExistingBtn.type = 'button';
      linkExistingBtn.className = 'dropdown-item';
      linkExistingBtn.innerHTML = `${f3.icons.linkSvgIcon()}<span>Link existing member</span>`;
      linkExistingBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCardMoreMenu();
        activateAddRelative(d.data, { linkMode: true });
      });

      menu.appendChild(editBtn);
      menu.appendChild(addRelativeBtn);
      menu.appendChild(linkExistingBtn);
      anchorEl.appendChild(menu);
    }

    const addRelLabelsDefault = { father: 'Add Father', mother: 'Add Mother', spouse: 'Add Spouse', son: 'Add Son', daughter: 'Add Daughter' };
    const addRelLabelsLinkMode = { father: 'Link Father', mother: 'Link Mother', spouse: 'Link Spouse', son: 'Link Son', daughter: 'Link Daughter' };

    function activateAddRelative(datum, { linkMode }) {
      const alreadyActiveForThisPersonAndMode =
        state.editor.isAddingRelative() &&
        state.editor.addRelativeInstance.datum?.id === datum.id &&
        state.editor.addRelativeInstance.link_mode === linkMode;
      if (alreadyActiveForThisPersonAndMode) {
        cancelAddRelative();
        return;
      }
      cancelAddRelative();
      state.chart.updateMainId(datum.id);
      state.editor.setAddRelLabels(linkMode ? addRelLabelsLinkMode : addRelLabelsDefault);
      state.editor.addRelativeInstance.activate(datum, { link_mode: linkMode });
    }

    // Plain card click opens the profile panel (view-first: setEditFirst(false)
    // means fields render as text, with the form's own pencil to switch into
    // edit mode). Re-rooting the tree is handled by the drilldown icon above,
    // not bundled into this click, so opening a profile doesn't also
    // unexpectedly move the tree around.
    card.setOnCardClick((e, d) => {
      closeCardMoreMenu();
      if (state.editor.isAddingRelative()) {
        if (d.data._new_rel_data) {
          state.editor.open(d.data);
          return;
        }
        cancelAddRelative();
      }
      if (state.editor.isRemovingRelative()) {
        state.editor.open(d.data);
        return;
      }
      state.editor.setEditFirst(false);
      state.editor.open(d.data);
    });
  } else {
    // Viewers get the same profile panel as editors, just permanently
    // read-only: setNoEdit() forces editable=false regardless of
    // setEditFirst() and (per src/renderers/create-form-html.ts) hides the
    // Add relative/Edit/Remove relation/Delete actions, leaving only the
    // read-only field grid.
    state.editor = state.chart
      .editTree()
      .setFields(['first name', 'last name', { id: 'birthday', type: 'date', label: 'birthday' }, 'location', 'email', 'notes', 'avatar'])
      .setNoEdit()
      .setEditFirst(false)
      .setOnFormCreation(({ cont }) => hydrateAvatarPreview(cont));

    // Drilldown icon mirrors the editor path above: pure navigation,
    // re-roots the tree on this person, hidden once there's no subtree left
    // to reveal. Plain card click opens the read-only profile panel instead
    // of re-rooting, so the two actions don't happen together on a single tap.
    card.setOnCardUpdate(function cardUpdate(d) {
      const cardEl = this.querySelector('.card');
      if (!cardEl) return;

      if (!d.all_rels_displayed) {
        addCardIcon(cardEl, 'center', f3.icons.drilldownSvgIcon(), (e) => {
          e.stopPropagation();
          state.editor.closeForm();
          card.onCardClickDefault(e, d);
        }, 'Drill down', -10);
      }
    });

    card.setOnCardClick((e, d) => {
      state.editor.open(d.data);
    });
  }

  state.chart.updateTree({
    initial: true,
    tree_position: 'inherit',
  });
  // Don't auto-open the editor on load — it should only appear once the
  // user explicitly clicks the edit icon on a card.
  if (state.chart) {
    const main = state.chart.getMainDatum();
    state.focusedMainId = main?.id || state.focusedMainId;
  }

  setupViewModeToggle();
}

function setupViewModeToggle() {
  const cont = document.querySelector('#view-mode-toggle');
  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';
  const isOwner = state.selectedTreeRole === 'owner';
  cont.innerHTML = renderViewModeToggle({ viewMode: state.viewMode, canEdit, isOwner });

  const focusedBtn = document.querySelector('#focused-mode-btn');
  const allNodesBtn = document.querySelector('#all-nodes-mode-btn');
  const relationshipManagerBtn = document.querySelector('#relationship-manager-mode-btn');
  const duplicateManagerBtn = document.querySelector('#duplicate-manager-mode-btn');
  const treeSettingsBtn = document.querySelector('#tree-settings-mode-btn');

  const syncModeButtons = () => {
    focusedBtn.disabled = state.viewMode === 'focused';
    allNodesBtn.disabled = state.viewMode === 'all-nodes';
    if (relationshipManagerBtn) relationshipManagerBtn.disabled = state.viewMode === 'relationship-manager';
    if (duplicateManagerBtn) duplicateManagerBtn.disabled = state.viewMode === 'duplicate-manager';
    if (treeSettingsBtn) treeSettingsBtn.disabled = state.viewMode === 'settings';
    syncSaveButtonAvailability();
    syncFocusModeToolbarState();
  };

  const saveFocusedMainId = () => {
    if (state.chart?.getMainDatum && state.viewMode === 'focused') {
      const currentMain = state.chart.getMainDatum();
      if (currentMain?.id) state.focusedMainId = currentMain.id;
    }
  };

  focusedBtn.addEventListener('click', () => {
    saveFocusedMainId();
    state.viewMode = 'focused';
    renderChart();
    syncModeButtons();
  });

  allNodesBtn.addEventListener('click', () => {
    saveFocusedMainId();
    state.viewMode = 'all-nodes';
    renderChart();
    syncModeButtons();
  });

  relationshipManagerBtn?.addEventListener('click', () => {
    saveFocusedMainId();
    state.viewMode = 'relationship-manager';
    renderChart();
    syncModeButtons();
  });

  duplicateManagerBtn?.addEventListener('click', () => {
    saveFocusedMainId();
    state.viewMode = 'duplicate-manager';
    renderChart();
    syncModeButtons();
  });

  treeSettingsBtn?.addEventListener('click', () => {
    saveFocusedMainId();
    state.viewMode = 'settings';
    renderChart();
    syncModeButtons();
  });

  // Media Library/Timeline/Family Feed chips are rendered inside #view-mode-toggle
  // alongside the mode tabs (Row 3), so cont.innerHTML above just recreated
  // their DOM nodes too - re-wire them every call rather than once in
  // attachTreeViewerListeners(), which would only ever bind the first copy.
  document.querySelector('#media-library-btn')?.addEventListener('click', () => {
    state.mediaLibrary = createMediaLibraryPageState();
    state.dashboardView = 'mediaLibrary';
    render();
  });
  document.querySelector('#timeline-btn')?.addEventListener('click', () => {
    state.timeline = createTimelinePageState();
    state.dashboardView = 'timeline';
    render();
  });
  document.querySelector('#family-feed-btn')?.addEventListener('click', () => openFamilyFeed());

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
    state.signInMethod = 'password';
    state.otpSent = false;
    await loadSession();
    return;
  }

  if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
    state.totpSetup = null;
    state.authStep = 'mfaCode';
    render();
    return;
  }

  if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE') {
    state.otpSent = true;
    state.otpResendAvailableAt = Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000;
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
    setRememberedEmail(state.rememberMe ? email : '');
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
    <section class="security-panel vault-panel">${renderVaultDrawerMarkup()}</section>
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

  attachVaultDrawerListeners();
}

// ---------------------------------------------------------------------------
// Private Vault: instant JSONB snapshots of trees the user owns.
//
// Deliberately scoped to ownership only (backend/models/vaultModel.js -
// createSnapshotForTree checks trees.owner_id, not tree_permissions
// membership) - an editor/viewer on someone else's tree can never clone that
// owner's data into their own permanent archive.
// ---------------------------------------------------------------------------

function renderVaultDrawerMarkup() {
  const vault = state.vault;
  const ownedTrees = state.trees.filter((tree) => tree.role === 'owner');

  const snapshotRows = vault.snapshots.length
    ? vault.snapshots
        .map(
          (snapshot) => `
      <li class="vault-snapshot-row" data-snapshot-id="${snapshot.id}">
        <div class="vault-snapshot-info">
          <span class="vault-snapshot-name">${escapeHtml(snapshot.archiveName)}</span>
          <span class="muted vault-snapshot-date">Saved on ${new Date(snapshot.createdAt).toLocaleString()}</span>
        </div>
        <div class="vault-snapshot-actions row">
          <button type="button" class="btn-secondary vault-restore-snapshot-btn" data-snapshot-id="${snapshot.id}">${icon('upload')}<span>Restore</span></button>
          <button type="button" class="btn-secondary vault-download-gedcom-btn" data-snapshot-id="${snapshot.id}">${icon('download')}<span>Download GEDCOM</span></button>
          <button type="button" class="icon-btn vault-delete-snapshot-btn" data-snapshot-id="${snapshot.id}" aria-label="Delete archive">${icon('trash')}</button>
        </div>
      </li>`
        )
        .join('')
    : `<p class="muted">No vault snapshots yet. Create one below to keep an instant private backup of a tree you own.</p>`;

  const createControls = ownedTrees.length
    ? `
      <div class="vault-create-row row">
        <select id="vault-create-tree-select">
          ${ownedTrees.map((tree) => `<option value="${tree.id}">${escapeHtml(tree.name)}</option>`).join('')}
        </select>
        <button type="button" id="vault-create-snapshot-btn" class="btn btn-primary" ${vault.creatingTreeId ? 'disabled' : ''}>
          ${icon('save')}<span>${vault.creatingTreeId ? 'Saving...' : 'Create Snapshot'}</span>
        </button>
      </div>`
    : `<p class="muted">You don't own any trees yet, so there's nothing to snapshot.</p>`;

  return `
    <h2>${icon('lock')}<span>Private Vault</span></h2>
    <p class="muted">Instant private backups of trees you own, stored separately from the live tree. Each snapshot can also be downloaded as a GEDCOM file.</p>
    ${createControls}
    <ul class="vault-snapshot-list">${vault.loading ? '<p class="muted">Loading archives...</p>' : snapshotRows}</ul>
  `;
}

function attachVaultDrawerListeners() {
  document.querySelector('#vault-create-snapshot-btn')?.addEventListener('click', handleCreateVaultSnapshot);

  document.querySelectorAll('.vault-restore-snapshot-btn').forEach((btn) => {
    btn.addEventListener('click', () => openVaultRestoreModal(Number(btn.dataset.snapshotId)));
  });

  document.querySelectorAll('.vault-download-gedcom-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDownloadVaultSnapshotGedcom(Number(btn.dataset.snapshotId)));
  });

  document.querySelectorAll('.vault-delete-snapshot-btn').forEach((btn) => {
    const snapshotId = Number(btn.dataset.snapshotId);
    btn.addEventListener('click', () => {
      showConfirmDialog({
        title: 'Delete Archive',
        message: 'Are you sure you want to delete this vault snapshot? This cannot be undone.',
        confirmLabel: 'Delete',
        onConfirm: () => handleDeleteVaultSnapshot(snapshotId),
      });
    });
  });
}

async function loadVaultSnapshots() {
  state.vault.loading = true;
  render();
  try {
    const { snapshots } = await api('/api/vault/snapshots');
    state.vault.snapshots = snapshots;
  } catch (error) {
    showToast(error.message || 'Could not load vault snapshots.', { type: 'error' });
  } finally {
    state.vault.loading = false;
    state.vault.loaded = true;
    render();
  }
}

async function handleCreateVaultSnapshot() {
  const select = document.querySelector('#vault-create-tree-select');
  const treeId = Number(select?.value);
  if (!treeId) return;

  const tree = state.trees.find((t) => t.id === treeId);
  state.vault.creatingTreeId = treeId;
  render();
  try {
    const { snapshot } = await api(`/api/vault/trees/${treeId}/snapshots`, {
      method: 'POST',
      body: JSON.stringify({ archiveName: tree?.name || '' }),
    });
    state.vault.snapshots = [snapshot, ...state.vault.snapshots];
    showToast('Snapshot saved to your vault.');
  } catch (error) {
    showToast(error.message || 'Could not create snapshot.', { type: 'error' });
  } finally {
    state.vault.creatingTreeId = null;
    render();
  }
}

// Entry point for the "Save to Vault" action in the tree-card menu and the
// viewer's settings menu - unlike handleCreateVaultSnapshot (vault drawer's
// own tree picker), the tree is already known from context here.
async function handleCreateVaultSnapshotForTree(treeId) {
  const tree = state.trees.find((t) => t.id === treeId);
  const archiveName = tree?.name || state.selectedTreeName || '';
  try {
    const { snapshot } = await api(`/api/vault/trees/${treeId}/snapshots`, {
      method: 'POST',
      body: JSON.stringify({ archiveName }),
    });
    state.vault.snapshots = [snapshot, ...state.vault.snapshots];
    state.vault.loaded = true;
    showToast('Snapshot saved to your vault.');
  } catch (error) {
    showToast(error.message || 'Could not create snapshot.', { type: 'error' });
  }
}

async function handleDownloadVaultSnapshotGedcom(snapshotId) {
  try {
    const { blob, filename } = await fetchAttachment(`/api/vault/snapshots/${snapshotId}/export/gedcom`);
    downloadBlob(blob, filename);
  } catch (error) {
    showToast(error.message || 'Could not download GEDCOM file.', { type: 'error' });
  }
}

async function handleDeleteVaultSnapshot(snapshotId) {
  try {
    await api(`/api/vault/snapshots/${snapshotId}`, { method: 'DELETE' });
    state.vault.snapshots = state.vault.snapshots.filter((snapshot) => snapshot.id !== snapshotId);
    render();
    showToast('Archive deleted.');
  } catch (error) {
    showToast(error.message || 'Could not delete archive.', { type: 'error' });
  }
}

// Lets a snapshot be replayed either into a brand-new tree or over an
// existing tree the user owns (only owned trees, mirroring the same
// ownership-only guarantee createSnapshotForTree already enforces - see
// backend/models/vaultModel.js's restoreSnapshotIntoTree). Deliberately a
// small standalone modal rather than reusing openGedcomImportWizard: there's
// no file to upload or validate here, the data's already a frozen, trusted
// past snapshot.
function openVaultRestoreModal(snapshotId) {
  const snapshot = state.vault.snapshots.find((s) => s.id === snapshotId);
  const ownedTrees = state.trees.filter((tree) => tree.role === 'owner');
  const restoreState = {
    mode: 'new',
    newTreeName: snapshot?.archiveName || '',
    targetTreeId: ownedTrees[0]?.id ?? null,
    submitting: false,
  };

  const modal = showModal({ bodyHtml: '<p>Loading...</p>', className: 'modal-vault-restore' });
  const renderBody = () => {
    modal.setBody(vaultRestoreModalMarkup(restoreState, ownedTrees));
    bindVaultRestoreModalListeners(modal, restoreState, ownedTrees, snapshotId, renderBody);
  };
  renderBody();
}

function vaultRestoreModalMarkup(restoreState, ownedTrees) {
  return `
    <button type="button" class="icon-btn modal-close" id="vault-restore-close-btn" aria-label="Close">${icon('close')}</button>
    <h3>Restore Snapshot</h3>
    <p class="modal-message">Restore this vault snapshot as a new tree, or replace an existing tree you own with it.</p>
    <div class="wizard-option-group">
      <label class="wizard-radio-row">
        <input type="radio" name="vault-restore-mode" value="new" ${restoreState.mode === 'new' ? 'checked' : ''} />
        <span>Restore as a new tree</span>
      </label>
      ${
        restoreState.mode === 'new'
          ? `<input type="text" id="vault-restore-new-name" placeholder="e.g. Smith Family Tree" value="${escapeHtml(restoreState.newTreeName)}" maxlength="120" />`
          : ''
      }
      <label class="wizard-radio-row">
        <input type="radio" name="vault-restore-mode" value="replace" ${restoreState.mode === 'replace' ? 'checked' : ''} ${ownedTrees.length ? '' : 'disabled'} />
        <span>Replace an existing tree</span>
      </label>
      ${
        restoreState.mode === 'replace'
          ? `<select id="vault-restore-target-select">
              ${ownedTrees.map((t) => `<option value="${t.id}" ${String(t.id) === String(restoreState.targetTreeId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
            </select>
            <p class="modal-message wizard-tone-warning">This permanently replaces everything currently in that tree with this snapshot.</p>`
          : ''
      }
      ${!ownedTrees.length ? '<p class="muted">You don\'t own any trees yet to replace.</p>' : ''}
    </div>
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="vault-restore-cancel-btn">Cancel</button>
      <button type="button" class="btn btn-primary" id="vault-restore-confirm-btn" ${restoreState.submitting ? 'disabled' : ''}>
        ${restoreState.submitting ? 'Restoring...' : 'Restore'}
      </button>
    </div>
  `;
}

function bindVaultRestoreModalListeners(modal, restoreState, ownedTrees, snapshotId, renderBody) {
  const root = modal.root;

  root.querySelector('#vault-restore-close-btn')?.addEventListener('click', modal.close);
  root.querySelector('#vault-restore-cancel-btn')?.addEventListener('click', modal.close);

  root.querySelectorAll('input[name="vault-restore-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      restoreState.mode = radio.value;
      renderBody();
    });
  });

  root.querySelector('#vault-restore-new-name')?.addEventListener('input', (event) => {
    restoreState.newTreeName = event.target.value;
  });
  root.querySelector('#vault-restore-target-select')?.addEventListener('change', (event) => {
    restoreState.targetTreeId = event.target.value;
  });

  root.querySelector('#vault-restore-confirm-btn')?.addEventListener('click', async () => {
    if (restoreState.mode === 'replace' && !restoreState.targetTreeId) {
      showToast('Choose a tree to replace.', { type: 'error' });
      return;
    }

    const runRestore = async () => {
      restoreState.submitting = true;
      renderBody();
      try {
        const body =
          restoreState.mode === 'replace'
            ? { mode: 'replace', treeId: Number(restoreState.targetTreeId) }
            : { mode: 'new', treeName: restoreState.newTreeName.trim() };

        const { tree } = await api(`/api/vault/snapshots/${snapshotId}/restore`, {
          method: 'POST',
          body: JSON.stringify(body),
        });

        modal.close();
        await loadTrees();
        if (restoreState.mode === 'replace' && state.selectedTreeId === tree.id) {
          await loadTree(tree.id);
        }
        showToast(
          restoreState.mode === 'replace' ? `Replaced "${tree.name}" with this snapshot.` : `Restored as "${tree.name}".`
        );
      } catch (error) {
        restoreState.submitting = false;
        renderBody();
        showToast(error.message || 'Could not restore snapshot.', { type: 'error' });
      }
    };

    if (restoreState.mode === 'replace') {
      const targetName = ownedTrees.find((t) => String(t.id) === String(restoreState.targetTreeId))?.name || 'this tree';
      showConfirmDialog({
        title: 'Replace Tree',
        message: `Are you sure you want to replace "${targetName}" with this snapshot? Everything currently in that tree will be permanently overwritten.`,
        confirmLabel: 'Replace',
        onConfirm: runRestore,
      });
      return;
    }

    await runRestore();
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

async function requestEmailOtp(email) {
  let result;
  try {
    result = await signIn({ username: email, options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' } });
  } catch (error) {
    if (error.name !== 'UserAlreadyAuthenticatedException') throw error;
    // A stale session from an earlier sign-in is still cached locally; clear it and retry once.
    await signOut();
    result = await signIn({ username: email, options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' } });
  }
  if (result.isSignedIn) {
    await handleAuthNextStep({ signInStep: 'DONE' });
  } else {
    await handleAuthNextStep(result.nextStep);
  }
}

async function handleOtpSignInRequest(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = String(form.get('email') || '').trim();
  const submitBtn = document.querySelector('#otp-request-btn');
  const errorEl = document.querySelector('#auth-error');
  errorEl.textContent = '';

  setButtonBusy(submitBtn, true, 'Sending...');
  try {
    state.authEmail = email;
    setRememberedEmail(state.rememberMe ? email : '');
    await requestEmailOtp(email);
  } catch (error) {
    // Accounts with MFA enrolled aren't offered EMAIL_OTP as a first factor by
    // Cognito, so handleAuthNextStep's fail-fast throws here instead of routing
    // to the code-entry screen - send them back to password+MFA sign-in instead
    // of surfacing the raw "Unsupported sign-in step" message.
    const message =
      typeof error?.message === 'string' && error.message.startsWith('Unsupported sign-in step')
        ? 'This account requires your password to sign in. Use the sign-in form instead.'
        : authErrorMessage(error);
    errorEl.textContent = message;
    showToast(message, { type: 'error' });
    setButtonBusy(submitBtn, false, 'Email me a sign-in code');
  }
}

async function handleOtpChallengeSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const code = String(form.get('code') || '').trim();
  const submitBtn = document.querySelector('#otp-challenge-btn');
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
    setButtonBusy(submitBtn, false, 'Verify & sign in');
    // Clear the boxes so the user isn't left staring at a code that just failed.
    document.querySelectorAll('.otp-box').forEach((box) => {
      box.value = '';
      box.classList.remove('filled');
    });
    const hidden = document.querySelector('#otp-code-hidden');
    if (hidden) hidden.value = '';
    document.querySelector('.otp-box')?.focus();
  }
}

async function handleResendOtpCode() {
  const btn = document.querySelector('#resend-otp-btn');
  if (btn) setButtonBusy(btn, true, 'Resending...');
  try {
    await requestEmailOtp(state.authEmail);
    showToast('Code resent.');
  } catch (error) {
    showToast(authErrorMessage(error), { type: 'error' });
    if (btn) setButtonBusy(btn, false, 'Resend code');
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
  resetAuthCardEntrance();
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
    // discovery-check (auto-grant) and loadDiscoveryMatches (list-for-display)
    // fire in parallel rather than sequentially - a tree that gets
    // auto-granted mid-flight simply won't show in this load's discovery
    // list, which is harmless (matches the "recomputed every time" semantics;
    // it'll simply be absent next time discovery is fetched).
    await Promise.all([
      loadTrees(),
      api('/api/auth/discovery-check', { method: 'POST' }).catch(() => {}),
      loadDiscoveryMatches(),
    ]);
    render();
    await maybeOpenDeepLinkedTicket();
  } catch (error) {
    state.user = null;
    render();
    // 401 just means "no session yet" - expected on every page load before
    // sign-in, and must stay silent. 403 means Cognito auth succeeded but
    // our backend rejected the account itself (e.g. suspended) - that has a
    // real message the caller (handleSignIn/handleAuthNextStep) should show,
    // so it's the one case worth re-throwing instead of swallowing.
    if (error?.status === 403) throw error;
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

// "Trees you may belong to" - trees where a person-node's email matches this
// user's own account email. Recomputed on every call (see loadSession()),
// not a one-time "seen it" flag, so a match created later (e.g. an owner
// adds someone's email after the fact) still surfaces. `dismissed` compares
// the current match-set's hash against the last-dismissed hash stored in
// localStorage, so a changed match-set always resurfaces even if the user
// previously dismissed a different set of matches.
async function loadDiscoveryMatches() {
  state.discovery.loading = true;
  try {
    const payload = await api('/api/trees/discovery');
    state.discovery.trees = payload.trees;
    const hash = hashTreeIds(payload.trees);
    state.discovery.dismissed = payload.trees.length === 0 || hash === getDismissedDiscoveryHash(state.user.id);
  } catch (_error) {
    state.discovery.trees = [];
    state.discovery.dismissed = true;
  } finally {
    state.discovery.loading = false;
    state.discovery.loaded = true;
  }
  if (state.user && state.dashboardView === 'trees' && !state.selectedTreeId) {
    renderTreeGrid();
  }
}

function handleDismissDiscovery() {
  state.discovery.dismissed = true;
  setDismissedDiscoveryHash(state.user.id, hashTreeIds(state.discovery.trees));
  renderTreeGrid();
}

async function loadTree(treeId, { viewMode = 'focused' } = {}) {
  cleanupAllNodesGraph();
  const payload = await api(`/api/trees/${treeId}`);
  state.selectedTreeId = treeId;
  state.selectedTreeRole = payload.role;
  state.selectedTreeData = payload.data;
  state.selectedTreeName = payload.tree.name;
  state.selectedTreeStatus = payload.tree.status || 'active';
  // 'settings' is only reachable here for owners (see handleTreeCardAction's
  // 'tree-settings' shortcut) - requireTreeRole on the API side is the real
  // guard, this is just so a non-owner deep link can't get stuck showing an
  // owner-only tab.
  state.viewMode = viewMode === 'settings' && payload.role !== 'owner' ? 'focused' : viewMode;
  state.treeDefaultMainId = payload.tree.default_main_id ?? null;
  // NULL always means "unlimited" here - both for a tree nobody has ever
  // configured a depth for, and for one where the owner explicitly chose
  // Unlimited. There's no separate "unset" state to distinguish from that.
  state.treeDefaultGenerationDepth = payload.tree.default_generation_depth ?? null;
  state.treeEmailAutoVisibility = payload.tree.email_auto_visibility ?? false;
  state.ancestryDepth = state.treeDefaultGenerationDepth;
  state.progenyDepth = state.treeDefaultGenerationDepth;

  // Prefer the owner-configured default focus person; fall back to the
  // largest-connected-component heuristic if it's unset, or if it points at
  // someone no longer in the tree (e.g. deleted since it was set).
  const ownerDefaultStillExists =
    state.treeDefaultMainId && payload.data.some((d) => d.id === state.treeDefaultMainId);
  state.focusedMainId = ownerDefaultStillExists ? state.treeDefaultMainId : pickDefaultMainId(payload.data);
  state.defaultMainId = state.focusedMainId;
  state.relationshipBuilder = createRelationshipBuilderState();
  state.relationshipManager = createRelationshipManagerState();
  setSidebarOpen(false);
  render();
}

function renderAllNodesMode() {
  const graphData = buildAllNodesGraphData(state.selectedTreeData);
  state.chart = null;
  state.editor = null;
  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';
  state.allNodesGraph = renderAllNodesGraph('#FamilyChart', graphData, {
    onConnectAttempt: canEdit
      ? (sourceId, targetId) => handleConnectAttempt(state, syncSaveButtonAvailability, sourceId, targetId)
      : undefined,
    onNodeClick: canEdit ? (nodeId, screenPos) => openAllNodesOptionsMenu(nodeId, screenPos) : undefined,
  });
}

// Small options menu opened by clicking a node in the All Nodes view.
// Reuses .dropdown-menu/.dropdown-item for visual consistency with the
// card's own "more" menu (see openCardMoreMenu above), but is positioned at
// the click's screen coordinates instead of anchored to a DOM element,
// since All Nodes renders raw SVG circles rather than HTML cards.
let allNodesOptionsMenuEl = null;

function closeAllNodesOptionsMenu() {
  if (allNodesOptionsMenuEl) {
    allNodesOptionsMenuEl.remove();
    allNodesOptionsMenuEl = null;
    document.removeEventListener('click', closeAllNodesOptionsMenu);
  }
}

function openAllNodesOptionsMenu(nodeId, { clientX, clientY }) {
  closeAllNodesOptionsMenu();

  const datum = state.selectedTreeData.find((d) => d.id === nodeId);
  if (!datum) return;

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu open all-nodes-options-menu';
  menu.style.left = `${clientX}px`;
  menu.style.top = `${clientY}px`;

  const removeRelationBtn = document.createElement('button');
  removeRelationBtn.type = 'button';
  removeRelationBtn.className = 'dropdown-item';
  removeRelationBtn.innerHTML = `${icon('unlink')}<span>Remove relation</span>`;
  removeRelationBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllNodesOptionsMenu();
    const name = toAllNodesLabel(datum);
    showConfirmDialog({
      title: 'Remove all relations',
      message: `Detach "${name}" from every parent, spouse, and child? "${name}" stays in the tree as an isolated node — remember to save afterward.`,
      confirmLabel: 'Remove relations',
      onConfirm: () => {
        removeAllRelations(state.selectedTreeData, nodeId);
        state.relationshipBuilder.dirty = true;
        cleanupAllNodesGraph();
        renderAllNodesMode();
        syncSaveButtonAvailability();
        showToast('Relations removed — remember to save.');
      },
    });
  });

  const deleteNodeBtn = document.createElement('button');
  deleteNodeBtn.type = 'button';
  deleteNodeBtn.className = 'dropdown-item dropdown-item-danger';
  deleteNodeBtn.innerHTML = `${icon('trash')}<span>Delete node</span>`;
  deleteNodeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllNodesOptionsMenu();
    const name = toAllNodesLabel(datum);
    showConfirmDialog({
      title: 'Delete this person',
      message: `Permanently delete "${name}" from this tree? This also removes them from every relative's parent/spouse/child list. This action cannot be undone once saved.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        deleteNode(state.selectedTreeData, nodeId);
        state.relationshipBuilder.dirty = true;
        cleanupAllNodesGraph();
        renderAllNodesMode();
        syncSaveButtonAvailability();
        showToast('Person deleted — remember to save.');
      },
    });
  });

  menu.appendChild(removeRelationBtn);
  menu.appendChild(deleteNodeBtn);
  document.body.appendChild(menu);
  allNodesOptionsMenuEl = menu;

  // Deferred so the click that opened the menu doesn't immediately close it
  // via this same document-level listener (event.stopPropagation() on the
  // node's own click handler already keeps it from bubbling, but the
  // listener is added after that click's dispatch has finished either way).
  setTimeout(() => document.addEventListener('click', closeAllNodesOptionsMenu), 0);
}

function toAllNodesLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum?.id ?? '');
}

function renderRelationshipManagerViewMode() {
  state.chart = null;
  state.editor = null;
  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';
  state.memberSearchIndex = buildMemberSearchIndex(state.selectedTreeData);

  const container = document.querySelector('#FamilyChart');
  container.innerHTML = renderRelationshipManagerMode(state.relationshipManager, state.selectedTreeData, {
    canEdit,
    searchIndex: state.memberSearchIndex,
  });

  attachDisconnectedListListeners(state, renderRelationshipManagerViewMode, state.selectedTreeData, state.memberSearchIndex);
  if (canEdit) {
    attachBuilderPanelListeners(state, renderRelationshipManagerViewMode, syncSaveButtonAvailability);
  }
  attachTreeHierarchyListeners(state, renderRelationshipManagerViewMode, (targetId) => {
    if (!canEdit || state.relationshipManager.selectedSourceIds.length === 0) return;
    state.relationshipManager.builder.targetId = targetId;
    state.relationshipManager.builder.step = 'choose-type';
    renderRelationshipManagerViewMode();
  });

  const root = document.querySelector('#relationship-manager-root');
  if (root) {
    if (relationshipManagerKeyboardCleanup) relationshipManagerKeyboardCleanup();
    relationshipManagerKeyboardCleanup = attachRelationshipManagerKeyboard(state, renderRelationshipManagerViewMode, root);
  }

  document.querySelector('#rm-undo-btn')?.addEventListener('click', () => {
    if (undoRelationship(state.relationshipManager.undoStack, state.selectedTreeData)) {
      state.relationshipManager.dirty = true;
      renderRelationshipManagerViewMode();
      syncSaveButtonAvailability();
    }
  });
  document.querySelector('#rm-redo-btn')?.addEventListener('click', () => {
    if (redoRelationship(state.relationshipManager.undoStack, state.selectedTreeData)) {
      state.relationshipManager.dirty = true;
      renderRelationshipManagerViewMode();
      syncSaveButtonAvailability();
    }
  });

  syncSaveButtonAvailability();
}

function renderDuplicateManagerViewMode() {
  state.chart = null;
  state.editor = null;
  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';

  const container = document.querySelector('#FamilyChart');
  container.innerHTML = renderDuplicateManagerMode(state.duplicateManager, state.selectedTreeData, { canEdit });

  attachDuplicateListListeners(state, renderDuplicateManagerViewMode);
  if (canEdit) {
    attachComparePanelListeners(state, renderDuplicateManagerViewMode);
  }

  syncSaveButtonAvailability();
}

function renderTreeSettingsViewMode() {
  state.chart = null;
  state.editor = null;

  const container = document.querySelector('#FamilyChart');
  container.innerHTML = renderTreeSettingsPanel(state.selectedTreeData, {
    currentDefaultMainId: state.treeDefaultMainId,
    currentGenerationDepth: state.treeDefaultGenerationDepth,
    currentEmailAutoVisibility: state.treeEmailAutoVisibility,
    currentStatus: state.selectedTreeStatus,
  });

  const unlimitedCheckbox = document.querySelector('#tree-settings-unlimited-depth-checkbox');
  const depthInput = document.querySelector('#tree-settings-generation-depth-input');
  unlimitedCheckbox?.addEventListener('change', () => {
    if (depthInput) depthInput.disabled = unlimitedCheckbox.checked;
  });

  document.querySelector('#tree-settings-save-btn')?.addEventListener('click', handleSaveTreeSettings);

  document.querySelector('#tree-settings-disable-btn')?.addEventListener('click', () => {
    showConfirmDialog({
      title: 'Disable this tree',
      message: `You and every collaborator will be blocked from opening "${state.selectedTreeName}" until you re-enable it. Tree data is not affected. Continue?`,
      confirmLabel: 'Disable',
      onConfirm: () => handleSetTreeStatus('disabled'),
    });
  });

  document.querySelector('#tree-settings-enable-btn')?.addEventListener('click', () => handleSetTreeStatus('active'));

  syncSaveButtonAvailability();
}

// Disabling makes the tree immediately unreachable (requireTreeRole 403s
// every role, owner included - see authorizeTree.js), so unlike
// handleSaveTreeSettings this can't leave the viewer open afterwards:
// enabling stays in place to show the result, disabling bounces back to the
// tree grid since every other API call against this tree would now 403.
async function handleSetTreeStatus(status) {
  const treeId = state.selectedTreeId;
  const treeName = state.selectedTreeName;
  try {
    const payload = await api(`/api/trees/${treeId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    const nextStatus = payload.tree.status;

    const treeInList = state.trees.find((tree) => tree.id === treeId);
    if (treeInList) treeInList.status = nextStatus;

    if (nextStatus === 'disabled') {
      clearSelectedTreeView();
      render();
      showToast(`"${treeName}" has been disabled.`);
    } else {
      state.selectedTreeStatus = nextStatus;
      render();
      showToast(`"${treeName}" has been re-enabled.`);
    }
  } catch (error) {
    showToast(error.message || 'Could not update this tree.', { type: 'error' });
    throw error;
  }
}

async function handleSaveTreeSettings() {
  const select = document.querySelector('#tree-settings-default-main-select');
  const unlimitedCheckbox = document.querySelector('#tree-settings-unlimited-depth-checkbox');
  const depthInput = document.querySelector('#tree-settings-generation-depth-input');
  const emailAutoVisibilityCheckbox = document.querySelector('#tree-settings-email-auto-visibility-checkbox');
  const errorEl = document.querySelector('#tree-settings-error');
  const saveBtn = document.querySelector('#tree-settings-save-btn');
  if (!select || !unlimitedCheckbox || !depthInput || !emailAutoVisibilityCheckbox || !saveBtn) return;

  const defaultMainId = select.value || null;
  const defaultGenerationDepth = unlimitedCheckbox.checked ? null : Number(depthInput.value);
  const emailAutoVisibility = emailAutoVisibilityCheckbox.checked;

  errorEl.textContent = '';
  if (!unlimitedCheckbox.checked && (!Number.isInteger(defaultGenerationDepth) || defaultGenerationDepth < MIN_GENERATION_DEPTH || defaultGenerationDepth > MAX_GENERATION_DEPTH)) {
    errorEl.textContent = `Generations to show must be a whole number between ${MIN_GENERATION_DEPTH} and ${MAX_GENERATION_DEPTH}.`;
    return;
  }

  saveBtn.disabled = true;
  const originalLabel = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';

  try {
    const result = await api(`/api/trees/${state.selectedTreeId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        default_main_id: defaultMainId,
        default_generation_depth: defaultGenerationDepth,
        email_auto_visibility: emailAutoVisibility,
      }),
    });
    state.treeDefaultMainId = result.default_main_id;
    state.treeDefaultGenerationDepth = result.default_generation_depth;
    state.treeEmailAutoVisibility = result.email_auto_visibility;
    state.ancestryDepth = state.treeDefaultGenerationDepth;
    state.progenyDepth = state.treeDefaultGenerationDepth;
    showToast('Tree settings updated.');
  } catch (error) {
    errorEl.textContent = error.message || 'Could not save these settings.';
    showToast(error.message || 'Could not save these settings.', { type: 'error' });
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel;
  }
}

let relationshipManagerKeyboardCleanup = null;

// Re-evaluates the Save button's disabled state from current role/view-mode/
// dirty flags. Module-scoped (rather than nested inside setupViewModeToggle,
// like the rest of that closure's button wiring) so relationshipBuilder's
// onDirtyChange callback can call it directly after a relationship is applied.
function syncSaveButtonAvailability() {
  const saveBtn = document.querySelector('#save-btn');
  if (!saveBtn) return;
  const canEdit = state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor';
  const allNodesBlocked = state.viewMode === 'all-nodes' && !state.relationshipBuilder.dirty;
  const relationshipManagerBlocked = state.viewMode === 'relationship-manager' && !state.relationshipManager.dirty;
  const duplicateManagerBlocked = state.viewMode === 'duplicate-manager' && !state.duplicateManager.dirty;
  // Settings mode saves via its own button (handleSaveTreeDefaultFocus),
  // straight to PATCH /:id/settings - it never has bulk json_data changes
  // pending, so the main Save button has nothing to do there.
  const settingsBlocked = state.viewMode === 'settings';
  saveBtn.disabled = !canEdit || allNodesBlocked || relationshipManagerBlocked || duplicateManagerBlocked || settingsBlocked;
}

function cleanupAllNodesGraph() {
  closeAllNodesOptionsMenu();
  if (!state.allNodesGraph) return;
  state.allNodesGraph.destroy();
  state.allNodesGraph = null;
}

// The tree's own colors (family-chart.css) update live via the CSS cascade
// when data-theme changes, so the f3 chart never needs to be told about
// this. The All Nodes graph is the one exception - it bakes colors into SVG
// attributes at draw time (see allNodesGraph.js), so it needs an explicit,
// cheap redraw (same data, no reload) to pick up the new palette.
initTheme((theme) => {
  state.theme = theme;
  syncThemeToggleButtons(theme);
  if (state.viewMode === 'all-nodes' && state.allNodesGraph && state.selectedTreeData.length) {
    cleanupAllNodesGraph();
    renderAllNodesMode();
  }
});

// Lets any code (including non-module inline snippets and fetch error
// handlers that don't import appToast directly) surface a toast by
// dispatching a CustomEvent, e.g.
//   document.dispatchEvent(new CustomEvent('app:toast', { detail: { message, type } }))
appToast.attachToastEventBridge();

// /terms and /privacy render immediately, without waiting on the auth check
// below, since they're public. Every other route keeps the existing
// behavior of showing nothing until loadSession() resolves.
syncRouteFromLocation();
if (state.publicView) render();

// A stale-but-still-valid Cognito session can hit this on page load if the
// account was suspended since the last visit - loadSession() re-throws that
// case (see its 403 handling) instead of swallowing it like a fresh/expired
// session, so it needs its own catch here rather than the caught rejection
// silently reported to the console via handleSignIn's flow.
loadSession().catch((error) => showToast(authErrorMessage(error), { type: 'error' }));
