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
import { sortChildren } from './siblingOrder.js';
import { openSortChildrenDialog } from './sortChildrenDialog.js';
import { createRelationshipManagerState } from './relationshipManager/state.js';
import { renderRelationshipManagerMode } from './relationshipManager/components.js';
import { attachDisconnectedListListeners } from './relationshipManager/disconnectedListPanel.js';
import { attachBuilderPanelListeners } from './relationshipManager/builderPanel.js';
import { attachTreeHierarchyListeners } from './relationshipManager/treeHierarchyPanel.js';
import { attachRelationshipManagerKeyboard } from './relationshipManager/keyboardNav.js';
import { undo as undoRelationship, redo as redoRelationship, canUndo as canUndoRelationship, canRedo as canRedoRelationship } from './relationshipManager/undoStack.js';
import { createDuplicateManagerState, loadDismissed } from './duplicateManager/state.js';
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
import { appToast, FormGuard } from './appUX.js';
import { createFocusMode } from './focusMode.js';
import { initTheme, getPreferredTheme, setTheme } from './theme.js';
import { getCardStyle, toggleCardStyle, toF3CardStyle } from './cardStyle.js';
import { getTreeOrientation, toggleTreeOrientation } from './treeOrientation.js';
import { escapeHtml, downloadJson, downloadCsv, downloadBlob, treeDataToCsv, slugifyFilename } from './utils.js';
import { icon } from './icons.js';
import { api, fetchAttachment } from './api.js';
import { isMaintenanceActive } from './maintenanceView.js';
import { buildMemberSearchIndex, searchMembers, getLabel as getMemberLabel, getRelativesSummary } from './memberSearch.js';
import { renderRelationshipFinderPageContent, attachRelationshipFinderPageListeners } from './relationshipFinder.js';
import { openGedcomImportWizard } from './gedcomWizard.js';
import { openCsvImportPanel } from './csvImportPanel.js';
import { openTreeExportDialog } from './treeExportDialog.js';
import { hydrateAvatarPreview, attachAvatarUpload } from './avatarUpload.js';
import {
  createMediaLibraryPageState,
  renderMediaLibraryPageContent,
  renderMediaLibraryFilterPills,
  renderMediaLibraryActions,
  attachMediaLibraryPageListeners,
  loadMediaLibraryPage,
} from './mediaLibraryPanel.js';
import {
  createTimelinePageState,
  renderTimelinePageContent,
  renderTimelineFilterPills,
  renderTimelineActions,
  attachTimelinePageListeners,
  loadTimelinePage,
} from './timelinePanel.js';
import { listFeed as listFamilyFeed } from './familyFeedApi.js';
import { buildJsonExportEnvelope } from './jsonExport.js';
import { buildCsvText, SAMPLE_ROWS } from './csvTemplate.js';
import {
  renderSidebarNav,
  renderMobileTopbar,
  renderTopbar,
  renderPageHeader,
  renderCreateTreeCard,
  renderTreesActionBar,
  renderTreesToolbarRow,
  renderTreeCard,
  renderEmptyState,
  renderSkeletonGrid,
  renderAppHeader,
  renderPrimaryTabSwitcher,
  renderCanvasFloatingControls,
  renderMemberSearch,
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
  renderManageClaimsPageMarkup,
  renderMyClaimsPageMarkup,
  renderTopbarTabs,
} from './components.js';
import { LEGAL_DOCS } from './legal/content.js';
import { renderLegalPageMarkup, attachLegalPageListeners, clearLegalSeo } from './legal/legalPageLayout.js';
import { renderShareLinkPage as renderShareLinkPageView, PENDING_SHARE_ACCESS_REQUEST_KEY } from './shareLinkView.js';
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
  // Set by state.editor's onChange (see renderChart()) whenever a card is
  // added/edited/removed on the main canvas; drives the autosave status
  // indicator alongside the relationshipBuilder/relationshipManager/
  // duplicateManager dirty flags below (see hasUnsavedTreeChanges()).
  treeDirty: false,
  // Google-Docs-style Editing/Viewing override for owners/editors (see
  // renderRoleModeControl in components.js and canEditSelectedTree below) -
  // lets someone who *can* edit choose to browse read-only instead, without
  // touching their actual role. Always false for viewers (they have no
  // toggle to begin with) and reset on every loadTree()/clearSelectedTreeView()
  // so it never leaks from one tree to the next.
  treeViewOnly: false,
  // Which segmented-control option the tree viewer toolbar shows as active
  // ('tree' | 'media' | 'events') - a pure display concern, independent of
  // viewMode/dashboardView (see renderPrimaryTabSwitcher in components.js
  // and setupViewModeToggle below).
  treeToolbarPrimaryTab: 'tree',
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
  // My Trees toolbar's search-mode-select: 'trees' filters state.trees by
  // name locally, 'members' switches the visible box to the join-search form
  // below (searches the whole database by tree/member name) - see
  // renderTreesToolbarRow's .search-box-group.
  treeSearchMode: 'trees',
  // "Search before you create" step on the Create Tree page, also reused as
  // the Members-mode search on the My Trees toolbar.
  joinSearch: {
    query: '',
    loading: false,
    searched: false,
    results: [],
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
  // "Manage Claims" dashboard view (incoming "this is me" member claims for
  // trees this user owns) - same shape as pendingRequests, but for identity
  // claims rather than access requests.
  manageClaims: {
    loading: false,
    loaded: false,
    claims: [],
  },
  // "My Claims" dashboard view (member claims this user has proposed, any status).
  myClaims: {
    loading: false,
    loaded: false,
    claims: [],
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

// Global ⌘K/Ctrl+K shortcut into member search, same delegated/registered-
// once pattern as the listeners above - #member-search-input only exists
// while a tree is open (see renderTreeCanvasMarkup), so this is a no-op
// everywhere else rather than needing its own mount/unmount lifecycle.
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    const input = document.querySelector('#member-search-input');
    if (!input) return;
    event.preventDefault();
    input.focus();
    input.select();
  }
});

// Minimal SPA router for the public legal pages (no router library exists in
// this app - see maybeOpenDeepLinkedTicket's note on the ?ticket= param).
// Maps a URL pathname to the publicView it should activate; anything else
// falls through to the normal auth/dashboard flow.
const PUBLIC_ROUTES = { '/terms': 'terms', '/privacy': 'privacy', '/support': 'support' };

// Shareable tree links (/tree/t/:shareToken) are the one *parameterized*
// public route, so they can't live in the flat PUBLIC_ROUTES map above - the
// token itself has to be captured out of the path, not just matched against it.
const SHARE_LINK_PATTERN = /^\/tree\/t\/([A-Za-z0-9_-]+)$/;

function syncRouteFromLocation() {
  const shareMatch = SHARE_LINK_PATTERN.exec(window.location.pathname);
  if (shareMatch) {
    state.publicView = 'share-link';
    state.publicShareToken = shareMatch[1];
    return;
  }
  state.publicShareToken = null;
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
  // Once the maintenance takeover screen is showing, no further render() may
  // overwrite #app - otherwise the very next render() call (e.g. from
  // loadSession()'s catch block, which swallows the 503 as "no session yet")
  // clobbers it with the normal login screen a moment after it appears.
  if (isMaintenanceActive()) return;
  // Checked before state.user, same as /support below - a share link must
  // render identically whether or not the visitor happens to be signed in
  // elsewhere in this browser, since the whole point is that no account is
  // required to view it.
  if (state.publicView === 'share-link') return renderShareLinkPageView(state.publicShareToken);
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
        activeView: 'contact',
        isAdmin: Boolean(state.user.is_admin),
        collapsed: state.sidebarCollapsed,
      })}
      <div class="main-area">
        ${renderMobileTopbar()}
        ${renderTopbar({
          email: state.user.email,
          activeTheme: state.theme,
          leftLabel: 'Contact Us',
        })}
        <main class="content">
          ${renderContactPageContent()}
        </main>
        ${state.selectedTreeId ? renderFamilyFeedPanel() : ''}
      </div>
    </div>
  `;
  attachShellListeners();
  if (state.selectedTreeId) attachFamilyFeedListeners();
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

function renderManageClaimsPageContent() {
  return renderManageClaimsPageMarkup({ ...state.manageClaims });
}

async function loadManageClaims() {
  if (state.manageClaims.loading) return;
  state.manageClaims.loading = true;
  render();
  try {
    const { claims } = await api('/api/trees/manage-claims');
    state.manageClaims.claims = claims;
  } catch (error) {
    showToast(error.message || 'Could not load pending claims.', { type: 'error' });
  } finally {
    state.manageClaims.loading = false;
    state.manageClaims.loaded = true;
    render();
  }
}

function attachManageClaimsListeners() {
  document.querySelectorAll('.pending-claim-approve-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDecideClaim(Number(btn.dataset.claimId), 'approved'));
  });
  document.querySelectorAll('.pending-claim-reject-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDecideClaim(Number(btn.dataset.claimId), 'rejected'));
  });
}

async function handleDecideClaim(claimId, status) {
  try {
    await api(`/api/trees/claims/${claimId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    state.manageClaims.claims = state.manageClaims.claims.filter((c) => c.id !== claimId);
    render();
    showToast(status === 'approved' ? 'Claim approved.' : 'Claim rejected.');
  } catch (error) {
    showToast(error.message || 'Could not update the claim.', { type: 'error' });
  }
}

function renderMyClaimsPageContent() {
  return renderMyClaimsPageMarkup({ ...state.myClaims });
}

async function loadMyClaims() {
  if (state.myClaims.loading) return;
  state.myClaims.loading = true;
  render();
  try {
    const { claims } = await api('/api/trees/my-claims');
    state.myClaims.claims = claims;
  } catch (error) {
    showToast(error.message || 'Could not load your claims.', { type: 'error' });
  } finally {
    state.myClaims.loading = false;
    state.myClaims.loaded = true;
    render();
  }
}

// A tree member proposes "this person is me" from the tree view's per-card
// menu (see openCardMoreMenu). Always lands 'pending' - the tree's owner
// must approve it via Manage Claims. Refreshes the current tree's
// memberId/claimStatus immediately so the card menu reflects the new
// pending state without a full reload, and marks myClaims stale so it
// refetches next visit.
async function handleClaimMember(memberId) {
  const treeId = state.selectedTreeId;
  if (!treeId || !memberId) return;
  try {
    await api(`/api/trees/${treeId}/claims`, { method: 'POST', body: JSON.stringify({ member_id: memberId }) });
    state.selectedTreeClaimStatus = 'pending';
    state.myClaims.loaded = false;
    render();
    showToast('Claim sent. The tree owner needs to approve it.');
  } catch (error) {
    showToast(error.message || 'Could not send that claim.', { type: 'error' });
  }
}

// Gates handleClaimMember behind a confirmation, since claiming an identity
// sends a request the tree owner has to act on and isn't something to
// trigger on a stray click.
function confirmClaimMember(memberId) {
  showConfirmDialog({
    title: 'Link this member to my profile',
    message: 'This will send a request to the tree owner to link this family member to your account as you. Continue?',
    confirmLabel: 'Send request',
    onConfirm: () => handleClaimMember(memberId),
  });
}

function renderDashboard() {
  const isSecurityView = state.dashboardView === 'security';
  const isCreateTreeView = !isSecurityView && state.dashboardView === 'createTree';
  // Private Vault - reached via the My Trees/Private Vault tab switcher in
  // the top bar (see renderDashboard's isTreesSection/topbarTabsHtml below).
  // A plain dashboardView page like every sibling flag here, rather than a
  // modal - see renderVaultPageMarkup's comment for why.
  const isVaultView = !isSecurityView && !isCreateTreeView && state.dashboardView === 'vault';
  const isContactView = !isSecurityView && !isCreateTreeView && !isVaultView && state.dashboardView === 'contact';
  const isMyTicketsView =
    !isSecurityView && !isCreateTreeView && !isVaultView && !isContactView && state.dashboardView === 'myTickets';
  const isTicketDetailView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isVaultView &&
    !isContactView &&
    !isMyTicketsView &&
    state.dashboardView === 'ticketDetail';
  const isPendingRequestsView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isVaultView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    state.dashboardView === 'pendingRequests';
  const isMyRequestsView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isVaultView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    state.dashboardView === 'myRequests';
  const isManageClaimsView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    state.dashboardView === 'manageClaims';
  const isMyClaimsView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    !isManageClaimsView &&
    state.dashboardView === 'myClaims';
  const isAdminView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isVaultView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    !isManageClaimsView &&
    !isMyClaimsView &&
    state.dashboardView === 'admin';
  const isMediaLibraryView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isVaultView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    !isManageClaimsView &&
    !isMyClaimsView &&
    !isAdminView &&
    state.dashboardView === 'mediaLibrary' &&
    Boolean(state.selectedTreeId);
  const isTimelineView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isVaultView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    !isManageClaimsView &&
    !isMyClaimsView &&
    !isAdminView &&
    !isMediaLibraryView &&
    state.dashboardView === 'timeline' &&
    Boolean(state.selectedTreeId);
  // The one tree-detail sub-view that keeps its own compact, self-contained
  // header (breadcrumb with an event-title 4th segment + a Delete Event
  // button - see eventDetail/eventStubDetail in timelinePanel.js) instead of
  // the shared renderAppHeader/#primary-tab-switcher pair every other view uses.
  // Threading that rich edit-forms/comments/participants view through the
  // shared header wasn't worth the risk for this pass - it's a drill-in
  // detail state, not a peer "view mode" of Tree View/Media/Events.
  const isTimelineDetailView = isTimelineView && state.timeline.view === 'detail' && Boolean(state.timeline.detail);
  // Relationship Finder used to be its own dashboardView (a standalone page
  // like Media/Timeline), which is why it once needed a dedicated flag here.
  // It's now just another viewMode nested under Tree View - same as
  // Focused/All Nodes/Relationships/Duplicates/Settings - so it renders
  // through isViewerView below like the rest of them (see renderChart's
  // 'relationship-finder' branch), and gets the same shared header/breadcrumb
  // for free instead of the bespoke ones it used to carry.
  const isViewerView =
    !isSecurityView &&
    !isCreateTreeView &&
    !isVaultView &&
    !isContactView &&
    !isMyTicketsView &&
    !isTicketDetailView &&
    !isPendingRequestsView &&
    !isMyRequestsView &&
    !isManageClaimsView &&
    !isMyClaimsView &&
    !isAdminView &&
    !isMediaLibraryView &&
    !isTimelineView &&
    Boolean(state.selectedTreeId);

  // "My Trees"/"Requests"/"Support" are each a single sidebar nav item that
  // actually covers several sibling views - render a tab switcher in the top
  // bar's title slot for whichever one is active (see renderTopbar's
  // tabsHtml) so the other views stay reachable without an extra header
  // row. Claims (My Claims/Manage Claims) live under the Requests nav item
  // too, alongside join requests, since both are "asking the tree owner for
  // something" flows. ticketDetail (a drill-in from My Support Tickets, with
  // its own back-link) and Create Tree (a drill-in from My Trees, ditto)
  // don't get tabs - same reasoning as isVaultView not covering
  // isCreateTreeView.
  const isTreesSection = state.dashboardView === 'trees' || isVaultView;
  const isRequestsSection = isPendingRequestsView || isMyRequestsView || isManageClaimsView || isMyClaimsView;
  const isSupportSection = isContactView || isMyTicketsView;
  const topbarTabsHtml = isTreesSection
    ? renderTopbarTabs({
        idPrefix: 'trees-tab',
        activeId: isVaultView ? 'vault' : 'trees',
        tabs: [
          { id: 'trees', label: 'My Trees', icon: 'trees', tooltip: 'Create, manage, and collaborate on your family trees' },
          { id: 'vault', label: 'Private Vault', icon: 'lock' },
        ],
      })
    : isRequestsSection
      ? renderTopbarTabs({
          idPrefix: 'requests-tab',
          activeId: isPendingRequestsView
            ? 'pendingRequests'
            : isManageClaimsView
              ? 'manageClaims'
              : isMyClaimsView
                ? 'myClaims'
                : 'myRequests',
          tabs: [
            { id: 'myRequests', label: 'My Requests', icon: 'list' },
            { id: 'pendingRequests', label: 'Pending Requests', icon: 'mail' },
            { id: 'myClaims', label: 'My Claims', icon: 'list' },
            { id: 'manageClaims', label: 'Manage Claims', icon: 'mail' },
          ],
        })
      : isSupportSection
        ? renderTopbarTabs({
            idPrefix: 'support-tab',
            activeId: isMyTicketsView ? 'myTickets' : 'contact',
            tabs: [
              { id: 'contact', label: 'Contact Us', icon: 'mail' },
              { id: 'myTickets', label: 'My Support Tickets', icon: 'clock' },
            ],
          })
        : '';

  // The tree-detail pages (Tree Canvas/Media Library/Timeline) show the
  // current tree's breadcrumb + info popover + notification bell in the
  // global renderTopbar instead of a plain title (see that function's
  // `treeName`/`hasTree` params) - they used to render their own separate
  // compact header row for this instead, see renderTopbar's comment for the
  // history. isViewerView covers every Tree View sub-mode (Focused/All
  // Nodes/Relationship Finder/Relationships/Duplicates/Settings) alike.
  const isTreeDetailHeaderView = isMediaLibraryView || (isTimelineView && !isTimelineDetailView) || isViewerView;

  // Every remaining page gets the same left-title/right-profile renderTopbar
  // (see that function's comment) - keyed off which view is active rather
  // than off state.selectedTreeId directly, since a tree can still be
  // selected in state while browsing an unrelated page like Security or
  // Admin (only "My Trees" clears it - see clearSelectedTreeView), and that
  // page's title should never get clobbered by a stale tree name. Timeline's
  // event-detail drill-in is the one tree-scoped view that keeps its own
  // breadcrumb below this bar instead of using its `treeName` slot, so it
  // still shows the tree name here as a plain title.
  const topbarTitle = isSecurityView
    ? 'Security Settings'
    : isCreateTreeView
      ? 'Create a Tree'
      : isVaultView
        ? 'Private Vault'
        : isContactView
          ? 'Contact Us'
          : isMyTicketsView
            ? 'My Support Tickets'
            : isTicketDetailView
              ? state.support.selectedTicket?.subject || 'Support Ticket'
              : isPendingRequestsView
                ? 'Pending Requests'
                : isMyRequestsView
                  ? 'My Requests'
                  : isAdminView
                    ? 'Admin'
                    : isTimelineDetailView
                      ? state.selectedTreeName
                      : state.dashboardView === 'trees'
                        ? 'My Trees'
                        : null;

  app.innerHTML = `
    <div class="app-shell ${state.sidebarOpen ? 'sidebar-open' : ''} ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      ${renderSidebarNav({
        activeView: isCreateTreeView || isVaultView ? 'trees' : state.dashboardView,
        isAdmin: Boolean(state.user.is_admin),
        collapsed: state.sidebarCollapsed,
      })}
      <div class="main-area">
        ${renderMobileTopbar()}
        ${renderTopbar({
          email: state.user.email,
          activeTheme: state.theme,
          leftLabel: topbarTitle,
          tabsHtml: topbarTabsHtml,
          treeName: isTreeDetailHeaderView ? state.selectedTreeName : null,
          memberCount: isTreeDetailHeaderView ? (state.selectedTreeData || []).length : null,
          updatedAt: isTreeDetailHeaderView ? state.trees.find((t) => t.id === state.selectedTreeId)?.updated_at : null,
          hasTree: isTreeDetailHeaderView,
        })}
        <main class="content">
          ${
            isSecurityView
              ? renderSecuritySettingsMarkup()
              : isCreateTreeView
                ? renderCreateTreePageMarkup()
                : isVaultView
                  ? renderVaultPageMarkup()
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
                          : isManageClaimsView
                            ? renderManageClaimsPageContent()
                            : isMyClaimsView
                              ? renderMyClaimsPageContent()
                              : isAdminView
                            ? renderAdminPageContent()
                            : isMediaLibraryView
                              ? `
                                ${renderTreeDetailHeader('media')}
                                ${renderMediaLibraryPageContent(state.mediaLibrary, {
                                  readOnly: !canEditSelectedTree(),
                                  currentUserId: state.user?.id,
                                })}
                              `
                              : isTimelineView
                                ? isTimelineDetailView
                                  ? // Self-contained: own breadcrumb + Delete Event button, no shared header/tabs - see isTimelineDetailView above.
                                    renderTimelinePageContent(state.timeline, {
                                      memberIndex: state.memberSearchIndex || buildMemberSearchIndex(state.selectedTreeData),
                                      memberById: new Map((state.selectedTreeData || []).map((d) => [d.id, d])),
                                      readOnly: !canEditSelectedTree(),
                                      currentUserId: state.user?.id,
                                      treeName: state.selectedTreeName,
                                    })
                                  : `
                                    ${renderTreeDetailHeader('events')}
                                    ${renderTimelinePageContent(state.timeline, {
                                      memberIndex: state.memberSearchIndex || buildMemberSearchIndex(state.selectedTreeData),
                                      memberById: new Map((state.selectedTreeData || []).map((d) => [d.id, d])),
                                      readOnly: !canEditSelectedTree(),
                                      currentUserId: state.user?.id,
                                      treeName: state.selectedTreeName,
                                    })}
                                  `
                                : isViewerView
                                  ? `
                                    ${renderTreeDetailHeader(state.treeToolbarPrimaryTab)}
                                    ${renderTreeCanvasMarkup()}
                                  `
                                  : renderTreesLandingMarkup()
          }
        </main>
        ${renderFooter({ variant: 'dashboard' })}
        ${state.selectedTreeId ? renderFamilyFeedPanel() : ''}
      </div>
    </div>
  `;

  if (isTreesSection || isRequestsSection || isSupportSection) attachSectionTabListeners();

  attachShellListeners();
  if (state.selectedTreeId) attachFamilyFeedListeners();

  if (isSecurityView) {
    attachSecuritySettingsListeners();
    return;
  }

  if (isCreateTreeView) {
    attachCreateTreePageListeners();
    return;
  }

  if (isVaultView) {
    attachVaultPageListeners();
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

  if (isManageClaimsView) {
    attachManageClaimsListeners();
    if (!state.manageClaims.loaded) loadManageClaims();
    return;
  }

  if (isMyClaimsView) {
    if (!state.myClaims.loaded) loadMyClaims();
    return;
  }

  if (isAdminView) {
    if (state.user.is_admin) attachAdminListeners(state, render);
    return;
  }

  if (isMediaLibraryView) {
    state.treeToolbarPrimaryTab = 'media';
    setupViewModeToggle();
    attachTreeViewerHeaderListeners();
    attachMediaLibraryPageListeners(
      state.mediaLibrary,
      {
        api,
        treeId: state.selectedTreeId,
        memberIndex: state.memberSearchIndex || buildMemberSearchIndex(state.selectedTreeData),
        memberById: new Map((state.selectedTreeData || []).map((d) => [d.id, d])),
        currentUserId: state.user?.id,
        readOnly: !canEditSelectedTree(),
      },
      render
    );
    if (!state.mediaLibrary.loaded) {
      loadMediaLibraryPage(state.mediaLibrary, { api, treeId: state.selectedTreeId }, render);
    }
    return;
  }

  if (isTimelineView) {
    state.treeToolbarPrimaryTab = 'events';
    // The event-detail sub-view renders its own self-contained header
    // instead of the shared one (see isTimelineDetailView above), so neither
    // #primary-tab-switcher nor .app-tree-header exist in the DOM to wire up then.
    if (!isTimelineDetailView) {
      setupViewModeToggle();
      attachTreeViewerHeaderListeners();
    }
    attachTimelinePageListeners(
      state.timeline,
      {
        api,
        treeId: state.selectedTreeId,
        memberIndex: state.memberSearchIndex || buildMemberSearchIndex(state.selectedTreeData),
        memberById: new Map((state.selectedTreeData || []).map((d) => [d.id, d])),
        currentUserId: state.user?.id,
        readOnly: !canEditSelectedTree(),
      },
      render,
      () => {
        state.treeToolbarPrimaryTab = 'tree';
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
  document.querySelector('#feed-notification-btn')?.addEventListener('click', () => openFamilyFeed());
  bindDropdownTriggers(document.querySelector('.app-topbar'));
  attachThemeToggleListeners();
}

// Switches dashboardView within the current section (Requests or Support) -
// the next render()'s own isMyTicketsView/isPendingRequestsView/etc. guards
// already call the right loadX() when that view isn't loaded yet, so this
// only needs to flip state.dashboardView. Arrow-key roving tabindex mirrors
// attachAuthMethodTabListeners' pattern above.
function attachSectionTabListeners() {
  const tabs = document.querySelectorAll('.topbar-tabs .segmented-option');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.tabId;
      if (view === state.dashboardView) return;
      state.dashboardView = view;
      render();
    });
  });
  const tabList = document.querySelector('.topbar-tabs');
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
    // Guards against double-binding when a trigger's ancestor gets bound at
    // more than one scope in the same mount pass without an intervening DOM
    // replacement - e.g. #tree-view-mode-btn (see setupViewModeToggle, which
    // always rebinds it directly) sitting inside .app-tree-header (which
    // attachTreeViewerHeaderListeners also sweeps with bindDropdownTriggers).
    // Without this, that button's open/close toggle would fire twice per
    // click and net out to a no-op.
    if (trigger.dataset.menuBound) return;
    trigger.dataset.menuBound = 'true';
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

// Trees Dashboard landing view. Row 1 (title/tabs + profile) is the global
// renderTopbar above this (see renderDashboard's isTreesSection/
// topbarTabsHtml) - Private Vault is the other tab there now, not a menu on
// this page.
// Everything here is owned by renderTreeGrid() into #trees-landing-body,
// since that's the function every data-change call site (loadTrees,
// sort/filter, create, delete, import...) already calls. That lets the
// empty-state vs active-state layout swap happen automatically whenever the
// tree count changes, without having to thread a full top-level render()
// through every one of those call sites. The Download Template/Import/New
// Tree actions (renderTreesActionButtons) live inline in the active state's
// .trees-toolbar-right next to the sort trigger, and in their own
// standalone renderTreesActionBar row for the empty state (which has no
// sort control to sit next to) - see renderTreeGrid's two branches below.
function renderTreesLandingMarkup() {
  return `<div id="trees-landing-body"></div>`;
}

// Wires the Download Template/Import/New Tree actions - rendered fresh into
// #trees-landing-body by renderTreeGrid on every load/filter/sort/
// create/delete, in both its empty-state and active-state branches, so this
// is called from both rather than once per top-level render().
function attachTreesActionButtonListeners() {
  ['landing-template-options', 'landing-import-options'].forEach((menuId) => {
    document.querySelectorAll(`[data-menu-id="${menuId}"] .dropdown-item`).forEach((btn) => {
      btn.addEventListener('click', () => handleTreesLandingHeaderAction(btn.dataset.action));
    });
  });
  document.querySelector('#new-tree-cta')?.addEventListener('click', () => {
    state.dashboardView = 'createTree';
    render();
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
    body.innerHTML = renderTreesActionBar() + discoveryHtml + renderTreesEmptyStateMarkup(state.joinSearch);
    document.querySelector('#join-search-form').addEventListener('submit', handleJoinSearch);
    document.querySelector('#skip-search-create-btn').addEventListener('click', () => {
      state.dashboardView = 'createTree';
      render();
    });
    bindDropdownTriggers(document.querySelector('.trees-action-bar'));
    attachTreesActionButtonListeners();
    attachJoinResultListeners();
    attachDiscoverySectionListeners();
    return;
  }

  body.innerHTML = `
    ${renderTreesToolbarRow({
      search: state.treeSearch,
      sort: state.treeSort,
      searchMode: state.treeSearchMode,
      joinSearchHtml: renderCompactJoinSearch({ query: state.joinSearch.query }),
    })}
    ${discoveryHtml}
    <div id="discover-search-results">${renderCompactJoinSearchResults(state.joinSearch)}</div>
    <div id="tree-grid" class="tree-grid"></div>
  `;

  document.querySelector('#tree-search-input').addEventListener('input', (event) => {
    state.treeSearch = event.target.value;
    renderActiveTreeGrid();
  });
  // Both boxes stay mounted (see .search-box-group's hidden dance in
  // renderTreesToolbarRow) - switching modes just swaps which one is
  // visible and refocuses into it, instead of tearing the grid down.
  document.querySelector('#tree-search-mode-select').addEventListener('change', (event) => {
    state.treeSearchMode = event.target.value;
    renderTreeGrid();
    if (state.treeSearchMode === 'members') document.querySelector('#join-search-input')?.focus();
  });

  bindDropdownTriggers(document.querySelector('.trees-toolbar-right'));
  document.querySelectorAll('#tree-sort-menu .dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.treeSort = btn.dataset.action.replace('sort-', '');
      renderTreeGrid();
    });
  });
  attachTreesActionButtonListeners();

  document.querySelector('#join-search-form').addEventListener('submit', handleJoinSearch);
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
// buttons, and the title (which already opens the tree itself via its own
// handler below).
const TREE_CARD_INTERACTIVE_SELECTOR = '.tree-card-menu-wrap, .tree-rename-form, .tree-card-title';

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
  container.querySelectorAll('.tree-card-title').forEach((el) => {
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

// The compact toolbar shared by the Tree Canvas/Media Library/Timeline pages
// (renderDashboard and refreshTreeViewerHeader, the only two callers) -
// contextual pills/mode toggle/actions (renderAppHeader). The breadcrumb/
// info popover/bell/avatar that used to be a separate row above this one now
// live in the persistent global renderTopbar instead (see that function's
// `treeName`/`hasTree` params). `primaryTab` is passed in explicitly rather
// than read from state.treeToolbarPrimaryTab: for the Media/Timeline
// branches that state field is only updated in the post-render attach phase
// (see isMediaLibraryView/isTimelineView below), so it can't be trusted yet
// while this string is being built.
function renderTreeDetailHeader(primaryTab) {
  const { centerHtml, actionsHtml } =
    primaryTab === 'media'
      ? {
          centerHtml: renderMediaLibraryFilterPills(state.mediaLibrary),
          actionsHtml: renderMediaLibraryActions(state.mediaLibrary, { readOnly: !canEditSelectedTree() }),
        }
      : primaryTab === 'events'
        ? {
            centerHtml: renderTimelineFilterPills(state.timeline),
            actionsHtml: renderTimelineActions(state.timeline, { readOnly: !canEditSelectedTree() }),
          }
        : { centerHtml: '', actionsHtml: '' }; // tree tab: renderPrimaryTabSwitcher builds its own view-mode dropdown

  return `
    <header class="app-tree-header">
      ${renderAppHeader({
        role: state.selectedTreeRole,
        viewMode: state.viewMode,
        primaryTab,
        viewOnly: state.treeViewOnly,
        canEdit: canEditSelectedTree(),
        isOwner: state.selectedTreeRole === 'owner',
        centerHtml,
        actionsHtml,
      })}
    </header>
  `;
}

// The tree canvas alone (Row 1/Row 2 are rendered separately by
// renderDashboard via renderTreeDetailHeader, shared with the Media
// Library/Timeline pages). Member search floats top-left over the canvas
// here (see renderMemberSearch) rather than living in the shared header, so
// it's Tree-Canvas-only - unlike renderCanvasFloatingControls, it stays
// mounted through Focus Mode for free since it's already inside
// #tree-focus-target, no relocation needed.
// Every other Tree View mode (Relationship Finder/Relationships/Duplicates/
// Settings) replaces #FamilyChart's own innerHTML with its own panel (see
// renderRelationshipFinderViewMode/renderRelationshipManagerViewMode/
// renderDuplicateManagerViewMode/renderTreeSettingsViewMode) but is still
// routed through this same markup. Both #member-search and
// #canvas-floating-controls are always rendered here (unconditionally) -
// their shown/hidden state is instead synced reactively by
// syncCanvasChromeVisibility(), called from renderChart() on every viewMode
// switch, not decided once here at markup time. That split matters:
// switchTreeViewMode's fast path (already on the tree canvas page, e.g.
// Focused -> Relationships) only replaces #FamilyChart's own innerHTML via
// renderChart() and never re-runs this function, so a markup-time-only
// condition would leave whichever chrome was showing when this wrapper was
// last fully rendered stuck in place - visible on Relationships if you
// arrived from Focused, hidden on Focused if you arrived from Relationships -
// instead of always matching the *current* mode.
function renderTreeCanvasMarkup() {
  const shortcutLabel = /Mac|iPod|iPhone|iPad/.test(navigator.platform || '') ? '⌘K' : 'Ctrl+K';
  return `
    <div id="tree-focus-target" class="tree-focus-target">
      <div class="chart-canvas-wrap">
        <div id="FamilyChart" class="f3 chart-container"></div>
        ${renderMemberSearch({ shortcutLabel })}
        ${renderCanvasFloatingControls({ cardStyle: getCardStyle(), orientation: getTreeOrientation() })}
      </div>
    </div>
  `;
}

// See renderTreeCanvasMarkup's comment above - the search box/floating
// toolbar only make sense over the live Focused/All Nodes canvas, but they're
// mounted once as part of the static wrapper markup, so their hidden state
// has to be re-applied here on every renderChart() call (both the full-page
// mount and switchTreeViewMode's in-place fast path) rather than decided once
// when that markup is built. `hidden` alone doesn't hide
// #canvas-floating-controls - its own `display: flex` (an author rule) beats
// the UA stylesheet's `[hidden] { display: none }` at equal specificity, so
// styles.css adds an explicit `.canvas-floating-controls[hidden]` override
// (same pattern as .search-box[hidden] elsewhere in that file).
function syncCanvasChromeVisibility() {
  const showChrome = state.viewMode === 'focused' || state.viewMode === 'all-nodes';
  document.querySelector('#member-search')?.toggleAttribute('hidden', !showChrome);
  document.querySelector('#canvas-floating-controls')?.toggleAttribute('hidden', !showChrome);
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
  // The opening trigger (#feed-notification-btn, the bell icon in
  // .app-topbar or .app-tree-header) is wired in attachShellListeners() since
  // it's part of the global shell, not the tree viewer; only the panel's own
  // controls (fixed markup, mounted once) are bound here.
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

// Binds everything that lives inside .app-tree-header (save status, the More
// dropdown - Share/import/export/tools/tree actions, see renderManageDataMenu
// - and the Editing/Viewing dropdown in Row 2, all rendered inside the header
// markup). Split out from attachTreeViewerListeners
// so a role change (e.g. after transferring ownership) can re-render just the
// header and rebind it, without rebuilding the focus-mode controller or
// re-attaching the family feed/member-search listeners (those live outside
// the header and are only meant to be wired once per tree-viewer mount -
// member search in particular now lives inside #tree-focus-target, which a
// header-only refresh never touches, so rebinding it here would double up
// its event listeners on the same still-mounted input).
function attachTreeViewerHeaderListeners() {
  document.querySelector('#breadcrumb-trees-btn')?.addEventListener('click', () => {
    navigateToDashboardView('trees');
    clearSelectedTreeView();
    render();
  });
  document.querySelector('#autosave-status')?.addEventListener('click', () => {
    if (document.querySelector('#autosave-status')?.dataset.state === 'error') performAutoSave();
  });
  document.querySelector('#request-role-change-btn')?.addEventListener('click', () => openRoleChangeModal());
  document.querySelector('#import-tree-json-input')?.addEventListener('change', handleImportTree);

  const header = document.querySelector('.app-tree-header');
  bindDropdownTriggers(header);
  header?.querySelectorAll('.dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => handleViewerSettingsAction(btn.dataset.action));
  });
  // Editing/Viewing mode dropdown (see renderRoleModeControl in
  // components.js) - a full render() picks up the new state.treeViewOnly
  // everywhere canEditSelectedTree() is checked, including re-wiring the
  // tree canvas's editTree() config in renderChart().
  header?.querySelectorAll('[data-role-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.treeViewOnly = btn.dataset.roleMode === 'view';
      render();
    });
  });
}

// Re-renders .app-tree-header (both rows) from current state (used after an
// action that can change the signed-in user's role on the currently open
// tree, e.g. transferring ownership away) so owner-only controls (Share
// button, Delete Tree, etc.) disappear immediately instead of staying
// visible until the next full page load - clicking them afterwards would
// just 403 against the server, which otherwise reads as "I lost access to my
// tree". Works no matter which of the three pages sharing .app-tree-header
// is currently open.
function refreshTreeViewerHeader() {
  const header = document.querySelector('.app-tree-header');
  if (!header) return;
  header.outerHTML = renderTreeDetailHeader(state.treeToolbarPrimaryTab);
  attachTreeViewerHeaderListeners();
  // outerHTML above rebuilds #primary-tab-switcher (it's nested inside the
  // header now, unlike the old sibling #view-mode-toggle row) - rebind its
  // listeners too, or the segmented control goes dead until the next full
  // render().
  setupViewModeToggle();
}

function attachTreeViewerListeners() {
  attachTreeViewerHeaderListeners();
  attachMemberSearchListeners();
  document.querySelector('#reset-view-btn')?.addEventListener('click', handleResetView);
  document.querySelector('#focus-mode-btn')?.addEventListener('click', () => focusModeController?.toggle());
  document.querySelector('#card-style-toggle-btn')?.addEventListener('click', () => {
    toggleCardStyle();
    renderChart();
    updateCardStyleToggleButton();
  });
  document.querySelector('#tree-orientation-toggle-btn')?.addEventListener('click', () => {
    toggleTreeOrientation();
    renderChart();
    updateTreeOrientationToggleButton();
  });

  // Family feed panel/listeners are now mounted at the shell level (see
  // render()) since attachShellListeners() already wires the bell trigger
  // (#feed-notification-btn, queried unscoped so it works whether it's
  // rendered in .app-topbar or .app-tree-header) whenever
  // state.selectedTreeId is set.
  setupFocusMode();
}

// Syncs the canvas-floating toggle button's icon/tooltip/aria-pressed with
// whatever card style is currently stored (see cardStyle.js). Called right
// after a toggle click - renderChart() rebuilds #FamilyChart itself but
// never touches this button (it lives outside #FamilyChart, see
// renderTreeCanvasMarkup), so its icon would otherwise go stale.
function updateCardStyleToggleButton() {
  const btn = document.querySelector('#card-style-toggle-btn');
  if (!btn) return;
  const isCircle = getCardStyle() !== 'rect';
  btn.setAttribute('aria-pressed', String(isCircle));
  btn.setAttribute('title', isCircle ? 'Switch to rectangle cards' : 'Switch to circle cards');
  btn.innerHTML = icon(isCircle ? 'user' : 'list');
}

// Syncs the canvas-floating orientation toggle button's icon/tooltip/
// aria-pressed with whatever orientation is currently stored (see
// treeOrientation.js) - same reasoning as updateCardStyleToggleButton above.
function updateTreeOrientationToggleButton() {
  const btn = document.querySelector('#tree-orientation-toggle-btn');
  if (!btn) return;
  const isHorizontal = getTreeOrientation() === 'horizontal';
  btn.setAttribute('aria-pressed', String(isHorizontal));
  btn.setAttribute('title', isHorizontal ? 'Switch to vertical tree' : 'Switch to horizontal tree');
  btn.innerHTML = icon(isHorizontal ? 'treeHorizontal' : 'treeVertical');
}

// ---------------------------------------------------------------------------
// Member search
// ---------------------------------------------------------------------------

function attachMemberSearchListeners() {
  const container = document.querySelector('#member-search');
  const input = document.querySelector('#member-search-input');
  const resultsEl = document.querySelector('#member-search-results');
  const clearBtn = document.querySelector('#member-search-clear-btn');
  const shortcutHint = document.querySelector('#member-search-shortcut');
  if (!container || !input || !resultsEl || !clearBtn) return;

  input.addEventListener('focus', () => {
    // Build (or rebuild) the index lazily on first interaction so it always
    // reflects the latest edits, without recomputing it on every keystroke.
    state.memberSearchIndex = buildMemberSearchIndex(state.selectedTreeData);
    if (input.value.trim()) runMemberSearch(input.value);
  });

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    if (shortcutHint) shortcutHint.hidden = !!input.value;
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
        if (shortcutHint) shortcutHint.hidden = false;
        closeMemberSearchResults();
      } else {
        input.blur();
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    if (shortcutHint) shortcutHint.hidden = false;
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

  const byId = new Map((state.selectedTreeData || []).map((d) => [d.id, d]));

  resultsEl.innerHTML = state.memberSearchResults
    .map((entry, index) => {
      const summary = getRelativesSummary(byId.get(entry.id), byId);
      return `
      <button
        type="button"
        class="member-search-result-item ${index === state.memberSearchActiveIndex ? 'active' : ''}"
        role="option"
        aria-selected="${index === state.memberSearchActiveIndex}"
        data-id="${escapeHtml(entry.id)}"
      >
        <span class="member-search-result-name">${highlightMatch(entry.label, query)}</span>
        ${summary ? `<span class="member-search-result-detail">${escapeHtml(summary)}</span>` : ''}
      </button>
    `;
    })
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

  // Member search is shown on the Media Library/Timeline pages too (see
  // renderAppHeader), but selecting a result re-roots/pans the tree canvas,
  // which only exists on the tree view - land there first, same as
  // switchTreeViewMode.
  if (state.dashboardView !== 'trees') {
    state.treeToolbarPrimaryTab = 'tree';
    state.dashboardView = 'trees';
    state.focusedMainId = id;
    state.viewMode = 'focused';
    render();
    highlightFocusedCard(id);
    return;
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
    state.viewMode === 'relationship-finder' ||
    state.viewMode === 'relationship-manager' ||
    state.viewMode === 'duplicate-manager' ||
    state.viewMode === 'settings';
  focusModeController?.setActionDisabled('zoom-in', disabled);
  focusModeController?.setActionDisabled('zoom-out', disabled);
  focusModeController?.setActionDisabled('center', disabled);
}

// Runs once the enter/exit CSS transition has finished (focusMode.js calls
// onEnter/onExit after its own transition timer, so this never races a
// refit against a container that's still mid-resize).
function onFocusModeTransitionEnd(active) {
  document.querySelector('#focus-mode-btn')?.setAttribute('aria-pressed', String(active));
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
  // Settings (in the Manage Data dropdown) swaps what's showing in place of
  // the canvas rather than opening a modal/triggering a download - close
  // whichever dropdown is still open first, since switchTreeViewMode()'s
  // toolbar rebuild won't touch it (the Manage Data menu lives in Row 1 of
  // .app-tree-header, outside #primary-tab-switcher entirely).
  if (action === 'settings') {
    document.querySelectorAll('.dropdown-menu.open').forEach((menu) => menu.classList.remove('open'));
    return switchTreeViewMode(action);
  }
  if (action === 'share') return openShareModal(state.selectedTreeId);
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
  // Reachable from Manage Data on the Media Library/Timeline pages too (see
  // renderAppHeader) - #FamilyChart only exists on the tree canvas, so land
  // there first; the existing Focused-mode check below still applies once
  // there (unrelated to which page the click came from).
  if (state.dashboardView !== 'trees') {
    state.treeToolbarPrimaryTab = 'tree';
    state.dashboardView = 'trees';
    render();
  }
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

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------
// Replaces the old manual Save button: any edit anywhere in the tree viewer
// (main canvas via state.editor.setOnChange, or one of the dirty flags below)
// calls scheduleAutoSave(), which debounces a PUT to /api/trees/:id and
// reflects Saving.../Saved/Unsaved changes/error via #autosave-status
// (see renderAutoSaveStatus in components.js). A failed save leaves the
// status in an "error" state that's clickable to retry immediately.
const AUTOSAVE_DEBOUNCE_MS = 1500;
let autoSaveTimer = null;
// Backstops autosave's debounce window with a native "leave site?" prompt if
// the browser tab is closed before the pending save has a chance to fire.
const autoSaveGuard = FormGuard.create({
  id: 'tree-autosave',
  message: 'Your latest tree edits are still saving. Leave without saving?',
});

function hasUnsavedTreeChanges() {
  return Boolean(
    state.treeDirty || state.relationshipBuilder.dirty || state.relationshipManager.dirty || state.duplicateManager.dirty
  );
}

function setAutoSaveStatus(nextState, { message } = {}) {
  const el = document.querySelector('#autosave-status');
  if (!el) return;
  el.dataset.state = nextState;
  const labels = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Save failed — click to retry' };
  const text = message || labels[nextState] || '';
  const textEl = el.querySelector('.autosave-status-text');
  if (textEl) textEl.textContent = text;
  el.title = nextState === 'saved' ? 'All changes saved' : text;
}

function scheduleAutoSave() {
  const canEdit = canEditSelectedTree();
  if (!canEdit || !state.selectedTreeId) return;
  setAutoSaveStatus('unsaved');
  autoSaveGuard.markDirty();
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(performAutoSave, AUTOSAVE_DEBOUNCE_MS);
}

async function performAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (!hasUnsavedTreeChanges()) {
    setAutoSaveStatus('saved');
    return;
  }
  setAutoSaveStatus('saving');
  try {
    const dataToSave = state.editor?.exportData ? state.editor.exportData() : state.selectedTreeData;
    await api(`/api/trees/${state.selectedTreeId}`, {
      method: 'PUT',
      body: JSON.stringify({ json_data: dataToSave }),
    });
    state.treeDirty = false;
    state.relationshipBuilder.dirty = false;
    state.relationshipManager.dirty = false;
    state.duplicateManager.dirty = false;
    autoSaveGuard.markClean();
    setAutoSaveStatus('saved');
  } catch (error) {
    setAutoSaveStatus('error', { message: error.message || 'Save failed — click to retry' });
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

// Tracks which tab is open and the fetched access-log rows across
// refreshShareModal() re-renders (every mutation in this modal re-fetches
// and re-renders the whole body, same pattern as shareLinkBusy/shareLinkError
// above) - reset each time the modal is (re)opened.
const shareModalState = {
  tab: 'members',
  accessLog: [],
  accessLogError: '',
  passcodeDrawerOpen: false,
};

async function openShareModal(treeId) {
  const treeName = state.trees.find((t) => t.id === treeId)?.name || state.selectedTreeName || '';
  shareModalState.tab = 'members';
  shareModalState.accessLog = [];
  shareModalState.accessLogError = '';
  shareModalState.passcodeDrawerOpen = false;
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

async function refreshShareModal(modal, treeId, treeName, formError = '', shareLinkError = '') {
  try {
    const payload = await api(`/api/trees/${treeId}/permissions`);
    const isOwnerViewing = payload.permissions.some(
      (permission) => permission.role === 'owner' && permission.user_id === state.user.id
    );
    // The raw share_token is owner-only (see GET /:id/share-link) - only
    // fetched at all when this viewer is the owner, mirroring how the
    // transfer-ownership menu item is also gated on isOwnerViewing above.
    const shareLink = isOwnerViewing ? await api(`/api/trees/${treeId}/share-link`) : null;

    if (isOwnerViewing && shareModalState.tab === 'link-sharing') {
      try {
        const accessLogPayload = await api(`/api/trees/${treeId}/access-log`);
        shareModalState.accessLog = accessLogPayload.entries;
        shareModalState.accessLogError = '';
      } catch (error) {
        shareModalState.accessLogError = error.message || 'Could not load access history.';
      }
    }

    modal.setBody(
      renderShareModalBody({
        treeName,
        permissions: payload.permissions,
        loading: false,
        error: '',
        formError,
        isOwnerViewing,
        shareLink,
        shareLinkBusy: false,
        shareLinkError,
        passcodeDrawerOpen: shareModalState.passcodeDrawerOpen,
        shareModalTab: shareModalState.tab,
        accessLog: shareModalState.accessLog,
        accessLogLoading: false,
        accessLogError: shareModalState.accessLogError,
      })
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

// General Link Access controls (restricted/view toggle, Copy Link, Reset
// Link) - split out from bindShareModalActions since renderShareLinkSection
// only renders these elements for the owner, and this keeps that gating in
// one place instead of every listener below needing its own null-check.
function bindShareLinkSectionListeners(modal, treeId, treeName) {
  modal.root.querySelectorAll('input[name="share-link-access"]').forEach((radio) => {
    radio.addEventListener('change', async (event) => {
      const linkAccess = event.target.value;
      shareModalState.passcodeDrawerOpen = false;
      modal.root.querySelectorAll('input[name="share-link-access"]').forEach((r) => (r.disabled = true));
      try {
        await api(`/api/trees/${treeId}/share-link`, { method: 'PATCH', body: JSON.stringify({ link_access: linkAccess }) });
        await refreshShareModal(modal, treeId, treeName);
      } catch (error) {
        await refreshShareModal(modal, treeId, treeName, '', error.message || 'Could not update link access.');
      }
    });
  });

  modal.root.querySelector('#copy-share-link-btn')?.addEventListener('click', async () => {
    const input = modal.root.querySelector('#share-link-url-input');
    if (!input?.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('Link copied.');
    } catch (_error) {
      input.select();
      showToast('Could not copy automatically - link is selected, press Ctrl+C.', { type: 'error' });
    }
  });

  modal.root.querySelector('#reset-share-link-btn')?.addEventListener('click', () => {
    showConfirmDialog({
      title: 'Reset Link',
      message: 'Anyone using the current link will lose access immediately. Continue?',
      confirmLabel: 'Reset Link',
      onConfirm: async () => {
        try {
          await api(`/api/trees/${treeId}/share-link/reset`, { method: 'POST' });
          showToast('Link reset.');
          await refreshShareModal(modal, treeId, treeName);
        } catch (error) {
          await refreshShareModal(modal, treeId, treeName, '', error.message || 'Could not reset the link.');
        }
      },
    });
  });

  const passcodeForm = modal.root.querySelector('#share-link-passcode-form');
  const passcodeInput = modal.root.querySelector('#share-link-passcode-input');

  modal.root.querySelector('#share-link-passcode-toggle')?.addEventListener('change', async (event) => {
    // Whether a passcode is already committed server-side - mirrors the same
    // DOM check the Cancel handler below uses, since this listener has no
    // direct access to the shareLink object refreshShareModal fetched it from.
    const alreadySaved = Boolean(modal.root.querySelector('#change-share-link-passcode-btn'));

    if (event.target.checked) {
      // Turning it on needs an actual passcode first, so just reveal the
      // input instead of PATCHing yet; the checkbox reflects committed state
      // once the form below is submitted (or reverts to unchecked on Cancel).
      // passcodeDrawerOpen is tracked outside the DOM so it survives the next
      // refreshShareModal() re-render, even if that re-render was triggered
      // by an unrelated control (e.g. the email verification toggle) before
      // this passcode gets saved - see renderShareLinkSection's comment.
      shareModalState.passcodeDrawerOpen = true;
      passcodeForm.hidden = false;
      passcodeInput?.focus();
      return;
    }

    if (!alreadySaved) {
      // Nothing was ever saved server-side - just collapse the drawer locally,
      // no PATCH needed.
      shareModalState.passcodeDrawerOpen = false;
      passcodeForm.hidden = true;
      if (passcodeInput) passcodeInput.value = '';
      return;
    }

    event.target.disabled = true;
    try {
      await api(`/api/trees/${treeId}/share-link`, {
        method: 'PATCH',
        body: JSON.stringify({ link_access: 'view', passcode: '' }),
      });
      shareModalState.passcodeDrawerOpen = false;
      showToast('Passcode removed.');
      await refreshShareModal(modal, treeId, treeName);
    } catch (error) {
      await refreshShareModal(modal, treeId, treeName, '', error.message || 'Could not remove the passcode.');
    }
  });

  modal.root.querySelector('#change-share-link-passcode-btn')?.addEventListener('click', () => {
    shareModalState.passcodeDrawerOpen = true;
    passcodeForm.hidden = false;
    passcodeInput?.focus();
  });

  modal.root.querySelector('#cancel-share-link-passcode-btn')?.addEventListener('click', () => {
    shareModalState.passcodeDrawerOpen = false;
    passcodeForm.hidden = true;
    if (passcodeInput) passcodeInput.value = '';
    // The form is only reachable via the toggle (unchecked -> checked reveals
    // it) or "Change Passcode" (already-enabled case, toggle stays checked
    // either way) - so Cancel only ever needs to walk the toggle back off
    // when a passcode isn't already saved server-side.
    const toggle = modal.root.querySelector('#share-link-passcode-toggle');
    const alreadyEnabled = Boolean(modal.root.querySelector('#change-share-link-passcode-btn'));
    if (toggle && !alreadyEnabled) toggle.checked = false;
  });

  passcodeForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const passcode = passcodeInput?.value || '';
    if (passcode.length < 4) {
      await refreshShareModal(modal, treeId, treeName, '', 'Passcode must be at least 4 characters.');
      return;
    }

    const submitBtn = passcodeForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await api(`/api/trees/${treeId}/share-link`, {
        method: 'PATCH',
        body: JSON.stringify({ link_access: 'view', passcode }),
      });
      shareModalState.passcodeDrawerOpen = false;
      showToast('Passcode saved.');
      await refreshShareModal(modal, treeId, treeName);
    } catch (error) {
      submitBtn.disabled = false;
      await refreshShareModal(modal, treeId, treeName, '', error.message || 'Could not save the passcode.');
    }
  });

  modal.root.querySelector('#share-link-email-verification-toggle')?.addEventListener('change', async (event) => {
    const requireEmailVerification = event.target.checked;
    event.target.disabled = true;
    try {
      await api(`/api/trees/${treeId}/share-link`, {
        method: 'PATCH',
        body: JSON.stringify({ link_access: 'view', requireEmailVerification }),
      });
      showToast(requireEmailVerification ? 'Email verification required.' : 'Email verification no longer required.');
      await refreshShareModal(modal, treeId, treeName);
    } catch (error) {
      await refreshShareModal(modal, treeId, treeName, '', error.message || 'Could not update email verification.');
    }
  });
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

  bindShareLinkSectionListeners(modal, treeId, treeName);
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

  modal.root.querySelectorAll('[data-share-modal-tab]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = btn.dataset.shareModalTab;
      if (tab === shareModalState.tab) return;
      shareModalState.tab = tab;
      await refreshShareModal(modal, treeId, treeName);
    });
  });

  modal.root.querySelectorAll('[data-access-log-block-email]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.accessLogBlockEmail;
      btn.disabled = true;
      try {
        await api(`/api/trees/${treeId}/access-log/block`, { method: 'POST', body: JSON.stringify({ email }) });
        showToast(`Blocked ${email}.`);
        await refreshShareModal(modal, treeId, treeName);
      } catch (error) {
        showToast(error.message || 'Could not block this email.', { type: 'error' });
        btn.disabled = false;
      }
    });
  });

  modal.root.querySelectorAll('[data-access-log-unblock-email]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.accessLogUnblockEmail;
      btn.disabled = true;
      try {
        await api(`/api/trees/${treeId}/access-log/unblock`, { method: 'POST', body: JSON.stringify({ email }) });
        showToast(`Unblocked ${email}.`);
        await refreshShareModal(modal, treeId, treeName);
      } catch (error) {
        showToast(error.message || 'Could not unblock this email.', { type: 'error' });
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
  // A debounced autosave may still be sitting in its window when the user
  // navigates away - flush it (fire-and-forget) before the tree/editor
  // references below go away, so the edit isn't silently dropped.
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    if (hasUnsavedTreeChanges() && state.selectedTreeId) {
      const dataToSave = state.editor?.exportData ? state.editor.exportData() : state.selectedTreeData;
      api(`/api/trees/${state.selectedTreeId}`, { method: 'PUT', body: JSON.stringify({ json_data: dataToSave }) }).catch(() => {});
    }
    autoSaveGuard.markClean();
  }
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
  state.treeViewOnly = false;
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

// Whether the signed-in user can currently make edits to the selected tree -
// role-gated (owner/editor) AND gated by the Editing/Viewing toggle in the
// header (see renderRoleModeControl in components.js), which lets an
// owner/editor browse read-only on purpose without touching their actual
// role. Every readOnly/canEdit check across the tree viewer, Media Library,
// and Timeline pages goes through this one function so flipping the toggle
// can't miss a spot.
function canEditSelectedTree() {
  return (state.selectedTreeRole === 'owner' || state.selectedTreeRole === 'editor') && !state.treeViewOnly;
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
    .html(iconHtml);
  // Skip data-tooltip entirely when no label is given (see the "More" icon
  // call site below) - its own popover already points back at it with an
  // arrow, so a hover tooltip on top would be redundant.
  if (tooltipLabel) {
    iconSelection
      .attr('data-tooltip', tooltipLabel)
      .attr('data-tooltip-position', 'bottom');
  }
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

// Highlights the card matching the logged-in user's own linked identity - a
// ring around the card plus a small "You" badge - so they can spot
// themselves at a glance in a large tree. selectedTreeMemberId is only ever
// populated once a claim is approved (tree_permissions.member_id stays null
// while pending - see memberClaimModel.js's decideClaim), so this never
// fires for a claim that's still awaiting the owner's decision. Safe to call
// on every card update: CardHtml rebuilds each card's innerHTML from scratch
// per render (see src/renderers/card-html.ts), so there's no stale badge to
// clean up first.
function markMyNodeCard(cardEl, d) {
  const isMine = !!state.selectedTreeMemberId && d.data.id === state.selectedTreeMemberId;
  cardEl.classList.toggle('f3-card-mine', isMine);
  if (!isMine) return;
  d3.select(cardEl)
    .append('div')
    .attr('class', 'f3-card-you-badge')
    .attr('data-tooltip', 'This is you')
    .attr('data-tooltip-position', 'bottom')
    .html(`${icon('check')}<span>You</span>`);
}

function renderChart() {
  cleanupAllNodesGraph();
  syncCanvasChromeVisibility();
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
  if (state.viewMode === 'relationship-finder') {
    renderRelationshipFinderViewMode();
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
    .setSortChildrenFunction(sortChildren)
    // Without this, siblings of the focused person are invisible until you
    // re-root onto a parent (which shows that parent's children - your
    // siblings - as a side effect). This shows them directly on whoever is
    // currently focused, matching the "why can't I see my own siblings"
    // report.
    .setShowSiblingsOfMain(true);

  // Top-down (default) or left-to-right (examples/13-horizontal-tree.html) -
  // whichever this browser last picked via the canvas-floating orientation
  // toggle (see treeOrientation.js / attachTreeViewerListeners).
  if (getTreeOrientation() === 'horizontal') {
    state.chart.setOrientationHorizontal();
  } else {
    state.chart.setOrientationVertical();
  }

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
    .setCardDisplay([['first name', 'last name']])
    // Circle (examples/11-html-card-styling.html: photo in a gender-colored
    // circle, name label overlapping its bottom edge) or the library's
    // original wide rectangle - whichever this browser last picked via the
    // canvas-floating card-style toggle (see cardStyle.js / attachTreeViewerListeners).
    .setStyle(toF3CardStyle(getCardStyle()));

  const canEdit = canEditSelectedTree();
  if (canEdit) {
    state.editor = state.chart
      .editTree()
      .setFields(['first name', 'last name', { id: 'birthday', type: 'date', label: 'birthday' }, 'location', 'email', 'notes', 'avatar'])
      .setEditFirst(true)
      .setLinkExistingRelConfig({
        title: 'Link to an existing member instead?',
        select_placeholder: 'Search existing members...',
        confirm_label: 'Select',
        linkRelLabel: (d) => getMemberLabel(d),
        linkRelDetail: (d) => getRelativesSummary(d, new Map(state.selectedTreeData.map((d2) => [d2.id, d2]))),
        linkRelSearchText: (d) => d.data.notes || '',
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
      })
      // Fires whenever a card is added, edited, or removed via the editor
      // form - this is the only signal for main-canvas edits (unlike
      // relationshipBuilder/relationshipManager/duplicateManager, which set
      // their own .dirty flags), so it's what drives autosave for ordinary
      // "click a card, edit a field" changes.
      .setOnChange(() => {
        state.treeDirty = true;
        scheduleAutoSave();
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

      markMyNodeCard(cardEl, d);

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
      // D3-driven re-renders using f3.icons' inline SVGs. No tooltip label -
      // the popover it opens already has its own pointer arrow back at this
      // icon (see .f3-card-more-menu.dropdown-menu in styles.css).
      const moreIconEl = addCardIcon(cardEl, 0, f3.icons.moreSvgIcon(), (e) => {
        e.stopPropagation();
        openCardMoreMenu(moreIconEl, d);
      });
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

      // "This is me": proposes a member claim on this node (see
      // handleClaimMember). Hidden once the logged-in user already has an
      // approved claim somewhere in this tree (on this node or another -
      // one identity per tree, see 013_member_claims.sql) or a pending one
      // in flight, since either way a new claim would just be rejected
      // server-side.
      if (state.selectedTreeClaimStatus !== 'approved' && state.selectedTreeClaimStatus !== 'pending') {
        const claimBtn = document.createElement('button');
        claimBtn.type = 'button';
        claimBtn.className = 'dropdown-item';
        claimBtn.innerHTML = `${icon('user')}<span>This is me</span>`;
        claimBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeCardMoreMenu();
          confirmClaimMember(d.data.id);
        });
        menu.appendChild(claimBtn);
      }

      // Sort children: only offered once this person actually has 2+
      // children to put in order. Opens a drag-to-reorder dialog
      // (sortChildrenDialog.js) rather than per-child move buttons here -
      // reordering a large family one click at a time was too slow, and this
      // also lets the new order override birthday entirely when the parent
      // knows the real age order but not exact birthdates (see
      // siblingOrder.js's sortChildren).
      if ((d.data.rels.children || []).length >= 2) {
        const sortChildrenBtn = document.createElement('button');
        sortChildrenBtn.type = 'button';
        sortChildrenBtn.className = 'dropdown-item';
        sortChildrenBtn.innerHTML = `${icon('list')}<span>Sort children</span>`;
        sortChildrenBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeCardMoreMenu();
          openSortChildrenDialog({
            data: state.selectedTreeData,
            parentId: d.data.id,
            onSave: () => state.chart.updateTree(),
          });
        });
        menu.appendChild(sortChildrenBtn);
      }

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

      markMyNodeCard(cardEl, d);

      // Viewers have no edit menu at all today, but claiming an identity is
      // exactly the action a viewer (not yet an editor) is most likely to
      // need - a single dedicated icon rather than a whole popover, since
      // "This is me" is the only viewer-facing card action that exists.
      // Same visibility rule as the editor branch's menu item above.
      if (state.selectedTreeClaimStatus !== 'approved' && state.selectedTreeClaimStatus !== 'pending') {
        addCardIcon(cardEl, 0, icon('user'), (e) => {
          e.stopPropagation();
          confirmClaimMember(d.data.id);
        }, 'This is me');
      }

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

// Shared by setupViewModeToggle's Focused/All Nodes chips, its Tree View
// options menu's Manage Data (Relationships/Duplicates) items, and
// handleViewerSettingsAction's gear-menu (Settings) item - anything that
// swaps what's showing in place of the chart canvas goes through here so the
// toolbar stays in sync.
function switchTreeViewMode(mode) {
  if (state.chart?.getMainDatum && state.viewMode === 'focused') {
    const currentMain = state.chart.getMainDatum();
    if (currentMain?.id) state.focusedMainId = currentMain.id;
  }
  state.viewMode = mode;
  // Every viewMode (chart, all-nodes, relationship-finder, relationship-manager,
  // duplicate-manager, settings) renders into #FamilyChart, which only exists
  // on the tree canvas page - reachable here via the Tree View options menu's
  // View/Manage Data groups or the gear menu's Settings item, all of which are
  // also shown on the Media Library/Timeline pages (see renderAppHeader), so
  // this can fire from there too and needs to route back to the canvas first.
  if (state.dashboardView !== 'trees') {
    state.treeToolbarPrimaryTab = 'tree';
    state.dashboardView = 'trees';
    render();
    return;
  }
  renderChart();
  setupViewModeToggle();
}

// Media/Events are their own full-page dashboardViews (not chart viewModes),
// but the toggle itself is shared chrome that this page also renders (see
// mediaLibraryPanel.js/timelinePanel.js), so the whole tree/media/events
// navigation stays reachable in one click no matter which of the three pages
// is currently showing - none of them requires backing out to the tree
// canvas first. `tab` is 'media' or 'events'; navigating to whichever one is
// already showing just refreshes the toggle instead of resetting its state
// and reloading.
function navigateToLibraryTab(tab) {
  state.treeToolbarPrimaryTab = tab;
  const targetView = tab === 'events' ? 'timeline' : 'mediaLibrary';
  if (state.dashboardView === targetView) {
    setupViewModeToggle();
    return;
  }
  if (targetView === 'mediaLibrary') state.mediaLibrary = createMediaLibraryPageState();
  else state.timeline = createTimelinePageState();
  state.dashboardView = targetView;
  render();
}

// Rebuilds the primary tab switcher (#primary-tab-switcher, in the primary
// bar - Tree View/Media/Events, plus Tree View's own Focused/All
// Nodes/Relationship Finder dropdown) from scratch on every call rather than
// just toggling .disabled/.open in place, because which DOM nodes exist at
// all changes with state.treeToolbarPrimaryTab/state.viewMode. Also rendered
// by the standalone Media Library/Timeline pages
// (mediaLibraryPanel.js/timelinePanel.js), so this may run with no chart
// mounted at all - guard on the container missing entirely (event-detail
// sub-view of Timeline doesn't render it). Rebinding the dropdown trigger
// here (not just relying on attachTreeViewerHeaderListeners' header-wide
// bindDropdownTriggers) matters because switchTreeViewMode's fast path calls
// only this function, not a full header rebind - see bindDropdownTriggers'
// data-menu-bound guard for why calling it from both places is still safe.
function setupViewModeToggle() {
  const switcherCont = document.querySelector('#primary-tab-switcher');
  if (switcherCont) {
    switcherCont.innerHTML = renderPrimaryTabSwitcher({
      primaryTab: state.treeToolbarPrimaryTab,
      viewMode: state.viewMode,
      canEdit: canEditSelectedTree(),
    });
    bindDropdownTriggers(switcherCont);
  }

  if (!switcherCont) return;

  document.querySelector('#primary-tab-tree-btn')?.addEventListener('click', () => {
    state.treeToolbarPrimaryTab = 'tree';
    if (state.dashboardView === 'mediaLibrary' || state.dashboardView === 'timeline') {
      state.dashboardView = 'trees';
      render();
      return;
    }
    if (state.viewMode !== 'focused' && state.viewMode !== 'all-nodes') switchTreeViewMode('focused');
    else setupViewModeToggle();
  });
  document.querySelector('#primary-tab-media-btn')?.addEventListener('click', () => navigateToLibraryTab('media'));
  document.querySelector('#primary-tab-events-btn')?.addEventListener('click', () => navigateToLibraryTab('events'));

  document.querySelector('#focused-mode-btn')?.addEventListener('click', () => switchTreeViewMode('focused'));
  document.querySelector('#all-nodes-mode-btn')?.addEventListener('click', () => switchTreeViewMode('all-nodes'));
  document.querySelector('#relationship-finder-btn')?.addEventListener('click', () => switchTreeViewMode('relationship-finder'));
  // Relationships/Duplicates are rendered `disabled` in view mode (see
  // renderPrimaryTabSwitcher's canEdit param) - disabled buttons never fire
  // click, so no extra guard is needed here.
  document.querySelector('#relationship-manager-btn')?.addEventListener('click', () => switchTreeViewMode('relationship-manager'));
  document.querySelector('#duplicate-manager-btn')?.addEventListener('click', () => switchTreeViewMode('duplicate-manager'));

  syncSaveButtonAvailability();
  syncFocusModeToolbarState();
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
    ${renderPageHeader({ subtitle: 'Manage multi-factor authentication for your account.' })}
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

// Private Vault used to be a permanently-mounted tab panel inside the trees
// landing view; it's now its own dashboardView ('vault', reached via the My
// Trees action bar's More Options menu - see handleTreesLandingHeaderAction)
// rather than a showModal() dialog. The vault's own actions open further
// modals of their own (restore picker, delete confirmation), and this app's
// modal engine only ever keeps one <dialog> open at a time (see appUX.js's
// closeActiveDialog) - a modal-based vault would silently close itself the
// moment one of those child modals opened. A page sidesteps that entirely
// and keeps every existing render()-based refresh call site below working
// unchanged.
// No breadcrumb here - the My Trees/Private Vault tab switcher in the top
// bar (see renderDashboard's topbarTabsHtml/isTreesSection) already shows
// "Private Vault" as current and lets you click back to "My Trees".
function renderVaultPageMarkup() {
  return `<section class="security-panel vault-panel">${renderVaultDrawerMarkup()}</section>`;
}

function attachVaultPageListeners() {
  attachVaultDrawerListeners();
  if (!state.vault.loaded && !state.vault.loading) loadVaultSnapshots();
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
  state.vault = { snapshots: [], loading: false, loaded: false, creatingTreeId: null };
  state.treeSearchMode = 'trees';
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
    await maybeResumeShareLinkAccessRequest();
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

// Re-entry point for "Request Edit Access" on a public share-link page
// (shareLinkView.js): a signed-out visitor's click there stashes
// { treeId } in sessionStorage and sends them through the normal sign-in/
// sign-up flow rather than duplicating auth UI on the public page. Every
// successful sign-in (password, OTP, or Google redirect) funnels through
// this same loadSession(), so checking here once covers all of them.
async function maybeResumeShareLinkAccessRequest() {
  const raw = sessionStorage.getItem(PENDING_SHARE_ACCESS_REQUEST_KEY);
  if (!raw) return;
  sessionStorage.removeItem(PENDING_SHARE_ACCESS_REQUEST_KEY);

  try {
    const { treeId } = JSON.parse(raw);
    if (!treeId) return;
    await api(`/api/trees/${treeId}/request-join-via-link`, { method: 'POST', body: JSON.stringify({}) });
    showToast('Request sent to the tree owner.');
  } catch (error) {
    showToast(error.message || 'Could not send your edit access request.', { type: 'error' });
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
  // Which person-node (if any) is a confirmed/pending identity claim for the
  // logged-in user in this tree - drives the "This is me" card menu item
  // (see openCardMoreMenu/handleClaimMember).
  state.selectedTreeMemberId = payload.memberId ?? null;
  state.selectedTreeClaimStatus = payload.claimStatus ?? 'unclaimed';
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
  state.treeDirty = false;
  state.treeViewOnly = false;
  state.treeToolbarPrimaryTab = 'tree';
  state.relationshipBuilder = createRelationshipBuilderState();
  state.relationshipManager = createRelationshipManagerState();
  state.duplicateManager = createDuplicateManagerState();
  state.duplicateManager.dismissed = loadDismissed(treeId);
  setSidebarOpen(false);
  render();
}

function renderAllNodesMode() {
  const graphData = buildAllNodesGraphData(state.selectedTreeData);
  state.chart = null;
  state.editor = null;
  const canEdit = canEditSelectedTree();
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
  const canEdit = canEditSelectedTree();
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
  const canEdit = canEditSelectedTree();

  // Selecting a row (or any other action here) redraws the whole view via
  // innerHTML, which would otherwise reset #dm-pair-list's scrollTop to 0 on
  // every click - save/restore it across the swap so scanning down a long
  // candidate list doesn't keep jumping back to the top. #dm-pair-list (not
  // its #dm-pair-list-wrap parent) is the actual overflow-y: auto element.
  const prevScrollTop = document.querySelector('#dm-pair-list')?.scrollTop ?? 0;

  const container = document.querySelector('#FamilyChart');
  container.innerHTML = renderDuplicateManagerMode(state.duplicateManager, state.selectedTreeData, { canEdit });

  const pairList = document.querySelector('#dm-pair-list');
  if (pairList) pairList.scrollTop = prevScrollTop;

  attachDuplicateListListeners(state, renderDuplicateManagerViewMode);
  if (canEdit) {
    attachComparePanelListeners(state, renderDuplicateManagerViewMode);
  }

  syncSaveButtonAvailability();
}

// Relationship Finder is a nested Tree View mode now (see the Tree View
// options menu's View group in renderPrimaryTabSwitcher), same as
// Focused/All Nodes - it used to be its own standalone dashboardView with a
// bespoke header/breadcrumb (see relationshipFinder.js's history comment),
// but that left it without the shared tabs/Editing dropdown every sibling
// mode gets, so it's routed through #FamilyChart like
// relationship-manager/duplicate-manager/settings instead.
function renderRelationshipFinderViewMode() {
  state.chart = null;
  state.editor = null;

  const container = document.querySelector('#FamilyChart');
  container.innerHTML = renderRelationshipFinderPageContent({
    data: state.selectedTreeData,
    rootId: state.focusedMainId,
  });

  attachRelationshipFinderPageListeners();
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
    currentUserMemberId: state.selectedTreeMemberId,
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

// Re-evaluates the autosave status from current role/dirty flags, arming the
// debounced autosave whenever something's pending. Module-scoped (rather
// than nested inside setupViewModeToggle, like the rest of that closure's
// button wiring) so relationshipBuilder's onDirtyChange callback can call it
// directly after a relationship is applied. Kept under its original name
// since several other modules already call it as a "something may have
// changed, reconcile the save UI" hook.
function syncSaveButtonAvailability() {
  const canEdit = canEditSelectedTree();
  if (!canEdit) return;
  if (hasUnsavedTreeChanges()) {
    scheduleAutoSave();
    return;
  }
  // Nothing pending - reflect "Saved" unless a save is actively in flight or
  // just failed, both of which own their own status transitions.
  const el = document.querySelector('#autosave-status');
  if (el && el.dataset.state !== 'saving' && el.dataset.state !== 'error') setAutoSaveStatus('saved');
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
