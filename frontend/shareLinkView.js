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

const OTP_RESEND_COOLDOWN_MS = 30 * 1000;

const shareLinkState = {
  loadedToken: null,
  loading: true,
  error: '',
  notFound: false,
  passcodeRequired: false,
  passcodeError: '',
  // Email-verification gate state (see design.md decision 3: passcode gate
  // resolves first, then this one). passcodeVerified is trivially true when
  // no passcode is required at all, so the render logic below only needs to
  // check passcodeRequired before falling through to the email gate.
  emailVerificationRequired: false,
  otpEmail: '',
  otpRequested: false,
  otpError: '',
  otpCooldownUntil: 0,
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
  shareLinkState.emailVerificationRequired = false;
  shareLinkState.otpEmail = '';
  shareLinkState.otpRequested = false;
  shareLinkState.otpError = '';
  shareLinkState.otpCooldownUntil = 0;
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

// Same session-only reasoning as sessionKeyForToken, but for the OTP gate:
// caches the last email+code pair that successfully verified so a reload
// resubmits it instead of forcing a fresh email round-trip (see
// backend/routes/publicTrees.js otp/verify - a once-consumed code stays
// valid for the rest of the browser session for exactly this purpose).
function otpSessionKeyForToken(shareToken) {
  return `family-chart-share-link-otp-verified-${shareToken}`;
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

  // Only reached once the passcode gate (if any) is satisfied - see
  // design.md decision 3.
  if (shareLinkState.emailVerificationRequired) {
    renderShareLinkShell(renderOtpGate());
    attachOtpGateListeners(shareToken);
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

function readCachedOtp(shareToken) {
  const raw = sessionStorage.getItem(otpSessionKeyForToken(shareToken));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.email && parsed?.code ? parsed : null;
  } catch (_error) {
    return null;
  }
}

// Attempts to resume a previously-verified OTP session silently (no gate
// shown, no error surfaced on failure) - if the cached code no longer works
// (expired between visits, owner reset something), this just falls through
// to the normal gate flow below rather than flashing a confusing "incorrect
// code" message on what the visitor experiences as a fresh page load.
async function tryResumeOtpSession(shareToken, cachedOtp, cachedPasscode) {
  try {
    const payload = await apiPublic(`/api/public/trees/${encodeURIComponent(shareToken)}/otp/verify`, {
      method: 'POST',
      body: JSON.stringify({ email: cachedOtp.email, code: cachedOtp.code, passcode: cachedPasscode ?? undefined }),
    });
    shareLinkState.tree = payload.tree;
    shareLinkState.data = payload.data || [];
    shareLinkState.loading = false;
    await renderShareLinkPage(shareToken);
    return true;
  } catch (_error) {
    sessionStorage.removeItem(otpSessionKeyForToken(shareToken));
    return false;
  }
}

async function fetchPlainGate(shareToken) {
  try {
    const payload = await apiPublic(`/api/public/trees/${encodeURIComponent(shareToken)}`);
    shareLinkState.tree = payload.tree;
    shareLinkState.data = payload.data || [];
    shareLinkState.loading = false;
  } catch (error) {
    shareLinkState.loading = false;
    if (error.status === 401) {
      shareLinkState.passcodeRequired = Boolean(error.payload?.passcode_required);
      shareLinkState.emailVerificationRequired = Boolean(error.payload?.email_verification_required);
    } else if (error.status === 404) {
      shareLinkState.notFound = true;
    } else {
      shareLinkState.error = error.message || 'Could not load this family tree.';
    }
  }
  await renderShareLinkPage(shareToken);
}

async function loadShareLinkTree(shareToken) {
  // A passcode verified earlier this tab session is cached client-side only
  // (see sessionKeyForToken) - re-send it rather than the plain GET so a
  // reload doesn't re-prompt; the server still re-checks it, it's just not
  // re-typed by the visitor. A cached, previously-verified OTP session is
  // checked first since it implies the passcode gate (if any) already
  // succeeded too.
  const cachedPasscode = sessionStorage.getItem(sessionKeyForToken(shareToken));
  const cachedOtp = readCachedOtp(shareToken);

  if (cachedOtp) {
    const resumed = await tryResumeOtpSession(shareToken, cachedOtp, cachedPasscode);
    if (resumed) return;
  }

  if (cachedPasscode !== null) {
    await verifyAndLoad(shareToken, cachedPasscode);
    return;
  }

  await fetchPlainGate(shareToken);
}

async function verifyAndLoad(shareToken, passcode) {
  try {
    const payload = await apiPublic(`/api/public/trees/${encodeURIComponent(shareToken)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
    sessionStorage.setItem(sessionKeyForToken(shareToken), passcode);
    shareLinkState.loading = false;
    shareLinkState.passcodeRequired = false;
    shareLinkState.passcodeError = '';

    // Passcode gate satisfied - if email verification is also required, the
    // response carries no tree data yet; the OTP gate renders next.
    if (payload.email_verification_required) {
      shareLinkState.emailVerificationRequired = true;
    } else {
      shareLinkState.tree = payload.tree;
      shareLinkState.data = payload.data || [];
    }
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

async function requestOtpCode(shareToken, email, { resend = false } = {}) {
  const cachedPasscode = sessionStorage.getItem(sessionKeyForToken(shareToken));
  shareLinkState.otpEmail = email;
  try {
    await apiPublic(`/api/public/trees/${encodeURIComponent(shareToken)}/otp/request`, {
      method: 'POST',
      body: JSON.stringify({ email, passcode: cachedPasscode ?? undefined }),
    });
    shareLinkState.otpRequested = true;
    shareLinkState.otpError = '';
    shareLinkState.otpCooldownUntil = Date.now() + OTP_RESEND_COOLDOWN_MS;
    if (resend) showToast('A new code has been sent.');
    // Re-render once the cooldown lapses so the Resend button re-enables
    // itself without requiring another interaction to unstick it.
    setTimeout(() => {
      if (shareLinkState.loadedToken === shareToken) renderShareLinkPage(shareToken);
    }, OTP_RESEND_COOLDOWN_MS + 50);
  } catch (error) {
    if (error.status === 404) {
      shareLinkState.notFound = true;
    } else {
      shareLinkState.otpError = error.message || 'Could not send a verification code. Please try again.';
    }
  }
  await renderShareLinkPage(shareToken);
}

async function otpVerifyAndLoad(shareToken, email, code) {
  const cachedPasscode = sessionStorage.getItem(sessionKeyForToken(shareToken));
  try {
    const payload = await apiPublic(`/api/public/trees/${encodeURIComponent(shareToken)}/otp/verify`, {
      method: 'POST',
      body: JSON.stringify({ email, code, passcode: cachedPasscode ?? undefined }),
    });
    shareLinkState.tree = payload.tree;
    shareLinkState.data = payload.data || [];
    shareLinkState.loading = false;
    shareLinkState.emailVerificationRequired = false;
    shareLinkState.otpError = '';
    sessionStorage.setItem(otpSessionKeyForToken(shareToken), JSON.stringify({ email, code }));
  } catch (error) {
    shareLinkState.loading = false;
    sessionStorage.removeItem(otpSessionKeyForToken(shareToken));
    if (error.status === 404) {
      shareLinkState.notFound = true;
    } else {
      // Covers both a wrong/expired code (403) and a rate limit (429) - the
      // server's message already distinguishes them for the visitor.
      shareLinkState.emailVerificationRequired = true;
      shareLinkState.otpRequested = true;
      shareLinkState.otpError = error.message || 'Incorrect or expired code.';
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

// Two-step gate: collect an email, send a code (POST otp/request), then
// collect the 6-digit code and verify it (POST otp/verify). Modeled on
// renderPasscodeGate's single-step shell above.
function renderOtpGate() {
  const errorHtml = shareLinkState.otpError ? `<p class="error">${escapeHtml(shareLinkState.otpError)}</p>` : '';

  if (!shareLinkState.otpRequested) {
    return `
      <div class="share-link-message share-link-passcode-gate">
        <h1>Email verification required</h1>
        <p>Enter your email address to receive a one-time verification code.</p>
        <form id="share-link-otp-request-form" class="share-link-passcode-gate-form">
          <input
            type="email"
            id="share-link-otp-email-input"
            placeholder="you@example.com"
            autocomplete="email"
            value="${escapeHtml(shareLinkState.otpEmail)}"
            autofocus
            required
          />
          <button type="submit" class="btn btn-primary">Send code</button>
        </form>
        ${errorHtml}
      </div>
    `;
  }

  const resendDisabled = Date.now() < shareLinkState.otpCooldownUntil;

  return `
    <div class="share-link-message share-link-passcode-gate">
      <h1>Enter your verification code</h1>
      <p>We sent a 6-digit code to ${escapeHtml(shareLinkState.otpEmail)}.</p>
      <form id="share-link-otp-verify-form" class="share-link-passcode-gate-form">
        <input
          type="text"
          id="share-link-otp-code-input"
          placeholder="6-digit code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          autofocus
          required
        />
        <button type="submit" class="btn btn-primary">Verify</button>
      </form>
      <button type="button" id="share-link-otp-resend-btn" class="btn btn-ghost btn-sm" ${resendDisabled ? 'disabled' : ''}>
        Resend code
      </button>
      ${errorHtml}
    </div>
  `;
}

function attachOtpGateListeners(shareToken) {
  document.querySelector('#share-link-otp-request-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#share-link-otp-email-input');
    const email = input?.value.trim() || '';
    if (!email) return;

    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    await requestOtpCode(shareToken, email);
  });

  const verifyForm = document.querySelector('#share-link-otp-verify-form');
  verifyForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#share-link-otp-code-input');
    const code = input?.value.trim() || '';
    if (!code) return;

    const submitBtn = verifyForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    shareLinkState.loading = true;
    await otpVerifyAndLoad(shareToken, shareLinkState.otpEmail, code);
  });

  document.querySelector('#share-link-otp-resend-btn')?.addEventListener('click', async (event) => {
    if (Date.now() < shareLinkState.otpCooldownUntil) return;
    event.target.disabled = true;
    await requestOtpCode(shareToken, shareLinkState.otpEmail, { resend: true });
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
