// The public, unauthenticated "anyone with the link can view" page
// (/tree/t/:shareToken). Deliberately its own small standalone shell rather
// than a stripped-down renderDashboard(): the dashboard shell assumes
// state.user/state.selectedTreeRole and is wired for editing, autosave,
// focus mode, relationship management, etc. Reusing it here would mean
// auditing every one of those code paths to make sure none of them leak an
// edit affordance to a signed-out visitor. A from-scratch render with no
// editor, no toolbar, and exactly one interactive element (the access-request
// banner) is easier to reason about as read-only-by-construction.
import f3 from '../src/index.ts';
import { api, apiPublic } from './api.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { getCardStyle, toF3CardStyle } from './cardStyle.js';
import { getTreeOrientation } from './treeOrientation.js';
import { sortChildren } from './siblingOrder.js';
import { showToast } from './ui.js';

export const PENDING_SHARE_ACCESS_REQUEST_KEY = 'family-chart-pending-share-access-request';

const shareLinkState = {
  loadedToken: null,
  loading: true,
  error: '',
  notFound: false,
  passcodeRequired: false,
  passcodeError: '',
  tree: null,
  data: [],
  requestSent: false,
};

export function resetShareLinkState() {
  shareLinkState.loadedToken = null;
  shareLinkState.loading = true;
  shareLinkState.error = '';
  shareLinkState.notFound = false;
  shareLinkState.passcodeRequired = false;
  shareLinkState.passcodeError = '';
  shareLinkState.tree = null;
  shareLinkState.data = [];
  shareLinkState.requestSent = false;
}

// A verified passcode is remembered only for this tab's session (not
// persisted to localStorage/cookies) so a visitor isn't re-prompted on every
// reload within the same visit, but the passcode isn't silently retained
// forever on a shared machine either.
function sessionKeyForToken(shareToken) {
  return `family-chart-share-link-verified-${shareToken}`;
}

function renderShareLinkShell(bodyHtml) {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="share-link-page">
      <header class="share-link-header">
        <a href="/" data-internal-link="/" class="share-link-brand">
          <span class="share-link-brand-icon">${icon('logo')}</span>
          <span>Family Chart</span>
        </a>
        <a href="/" data-internal-link="/" class="btn btn-secondary btn-sm">${icon('home')}<span>Go to Family Chart</span></a>
      </header>
      <main class="share-link-main">${bodyHtml}</main>
    </div>
  `;
}

function renderShareLinkMessage(title, message) {
  return `
    <div class="share-link-message">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <a href="/" data-internal-link="/" class="btn btn-primary">Go to Family Chart</a>
    </div>
  `;
}

export async function renderShareLinkPage(shareToken) {
  if (shareLinkState.loadedToken !== shareToken) {
    resetShareLinkState();
    shareLinkState.loadedToken = shareToken;
    renderShareLinkShell('<p class="share-link-loading">Loading family tree...</p>');
    await loadShareLinkTree(shareToken);
    return;
  }

  if (shareLinkState.loading) {
    renderShareLinkShell('<p class="share-link-loading">Loading family tree...</p>');
    return;
  }

  if (shareLinkState.notFound) {
    renderShareLinkShell(
      renderShareLinkMessage('This link is no longer available', 'The owner may have turned off link sharing or reset the link.')
    );
    return;
  }

  if (shareLinkState.passcodeRequired) {
    renderShareLinkShell(renderPasscodeGate());
    attachPasscodeFormListener(shareToken);
    return;
  }

  if (shareLinkState.error) {
    renderShareLinkShell(renderShareLinkMessage('Something went wrong', shareLinkState.error));
    return;
  }

  renderShareLinkShell(`
    <div class="share-link-tree-name">${escapeHtml(shareLinkState.tree.name)}</div>
    <div class="chart-canvas-wrap share-link-canvas-wrap">
      <div id="FamilyChart" class="f3 chart-container"></div>
      ${renderAccessBanner()}
    </div>
  `);
  mountReadOnlyChart();
  attachShareLinkPageListeners(shareToken);
}

async function loadShareLinkTree(shareToken) {
  // A passcode verified earlier this tab session is cached client-side only
  // (see sessionKeyForToken) - re-send it to /verify rather than the plain
  // GET so a reload doesn't re-prompt; the server still re-checks it, it's
  // just not re-typed by the visitor.
  const cachedPasscode = sessionStorage.getItem(sessionKeyForToken(shareToken));
  if (cachedPasscode !== null) {
    await verifyAndLoad(shareToken, cachedPasscode);
    return;
  }

  try {
    const payload = await apiPublic(`/api/public/trees/${encodeURIComponent(shareToken)}`);
    shareLinkState.tree = payload.tree;
    shareLinkState.data = payload.data || [];
    shareLinkState.loading = false;
  } catch (error) {
    shareLinkState.loading = false;
    if (error.status === 401 && error.payload?.passcode_required) {
      shareLinkState.passcodeRequired = true;
    } else if (error.status === 404) {
      shareLinkState.notFound = true;
    } else {
      shareLinkState.error = error.message || 'Could not load this family tree.';
    }
  }
  await renderShareLinkPage(shareToken);
}

async function verifyAndLoad(shareToken, passcode) {
  try {
    const payload = await apiPublic(`/api/public/trees/${encodeURIComponent(shareToken)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
    shareLinkState.tree = payload.tree;
    shareLinkState.data = payload.data || [];
    shareLinkState.loading = false;
    shareLinkState.passcodeRequired = false;
    shareLinkState.passcodeError = '';
    sessionStorage.setItem(sessionKeyForToken(shareToken), passcode);
  } catch (error) {
    shareLinkState.loading = false;
    sessionStorage.removeItem(sessionKeyForToken(shareToken));
    if (error.status === 403) {
      shareLinkState.passcodeRequired = true;
      shareLinkState.passcodeError = 'Incorrect passcode. Please try again.';
    } else if (error.status === 404) {
      shareLinkState.notFound = true;
    } else {
      shareLinkState.error = error.message || 'Could not load this family tree.';
    }
  }
  await renderShareLinkPage(shareToken);
}

function renderPasscodeGate() {
  const errorHtml = shareLinkState.passcodeError ? `<p class="error">${escapeHtml(shareLinkState.passcodeError)}</p>` : '';
  return `
    <div class="share-link-message share-link-passcode-gate">
      <h1>Passcode required</h1>
      <p>This family tree is protected. Enter the passcode to view it.</p>
      <form id="share-link-passcode-gate-form" class="share-link-passcode-gate-form">
        <input
          type="password"
          id="share-link-passcode-gate-input"
          placeholder="Passcode"
          autocomplete="off"
          autofocus
          required
        />
        <button type="submit" class="btn btn-primary">Continue</button>
      </form>
      ${errorHtml}
    </div>
  `;
}

function attachPasscodeFormListener(shareToken) {
  const form = document.querySelector('#share-link-passcode-gate-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#share-link-passcode-gate-input');
    const passcode = input?.value || '';
    if (!passcode) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    shareLinkState.loading = true;
    await verifyAndLoad(shareToken, passcode);
  });
}

function renderAccessBanner() {
  if (shareLinkState.requestSent) {
    return `
      <div class="share-link-banner" id="share-link-banner">
        <span>Request sent to the tree owner.</span>
      </div>
    `;
  }

  return `
    <div class="share-link-banner" id="share-link-banner">
      <span>Viewing in Read-Only mode.</span>
      <button type="button" id="request-edit-access-btn" class="btn btn-primary btn-sm">Request Edit Access</button>
    </div>
  `;
}

function mountReadOnlyChart() {
  const container = document.querySelector('#FamilyChart');
  if (!container) return;

  const chart = f3
    .createChart('#FamilyChart', shareLinkState.data)
    .setTransitionTime(1000)
    .setCardXSpacing(250)
    .setCardYSpacing(150)
    .setSortChildrenFunction(sortChildren)
    .setShowSiblingsOfMain(true);

  if (getTreeOrientation() === 'horizontal') {
    chart.setOrientationHorizontal();
  } else {
    chart.setOrientationVertical();
  }

  const defaultGenerationDepth = shareLinkState.tree?.default_generation_depth ?? null;
  if (defaultGenerationDepth !== null) {
    chart.setAncestryDepth(defaultGenerationDepth).setProgenyDepth(defaultGenerationDepth);
  }

  chart
    .setCard(f3.CardHtml)
    .setCardDisplay([['first name', 'last name']])
    .setStyle(toF3CardStyle(getCardStyle()));

  const defaultMainId = shareLinkState.tree?.default_main_id;
  if (defaultMainId && shareLinkState.data.some((d) => d.id === defaultMainId)) {
    chart.updateMainId(defaultMainId);
  }

  // Triggers the actual first paint - createChart()/setCard() only configure
  // the chart, they don't render it (see renderChart()'s identical final
  // call in main.js). No editTree() here at all: unlike the authenticated
  // viewer role (which still gets a permanently-locked editTree() instance
  // for the read-only profile popover), this page has no card-click
  // interaction to wire up, so there's nothing for an editor instance to do.
  chart.updateTree({ initial: true });
}

function attachShareLinkPageListeners(shareToken) {
  document.querySelector('#request-edit-access-btn')?.addEventListener('click', () => handleRequestEditAccess(shareToken));
}

async function handleRequestEditAccess(shareToken) {
  const btn = document.querySelector('#request-edit-access-btn');

  // No way to know here whether the visitor happens to already have a signed-
  // in session in this browser without importing main.js's whole auth/state
  // machinery (and creating a circular import - main.js is what imports this
  // module). /api/trees/:id/request-join-via-link itself requires auth, so
  // just attempt it; a 401 means "not signed in", which is the expected,
  // common case for a link visitor and is handled the same way as explicitly
  // checking would be - fall through to sending them to sign in/up.
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending request...';
  }

  try {
    await api(`/api/trees/${shareLinkState.tree.id}/request-join-via-link`, { method: 'POST', body: JSON.stringify({}) });
    shareLinkState.requestSent = true;
    await renderShareLinkPage(shareToken);
    return;
  } catch (error) {
    if (error.status !== 401) {
      showToast(error.message || 'Could not send request.', { type: 'error' });
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Request Edit Access';
      }
      return;
    }
  }

  // Not signed in: stash intent (same sessionStorage-resume-flag pattern as
  // PENDING_ACCOUNT_DELETION_KEY in main.js) and send them into the normal
  // sign-in/sign-up screen. main.js's loadSession() checks for this key right
  // after a successful sign-in (any method) and fires the request then.
  sessionStorage.setItem(PENDING_SHARE_ACCESS_REQUEST_KEY, JSON.stringify({ treeId: shareLinkState.tree.id }));
  window.history.pushState(null, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}
