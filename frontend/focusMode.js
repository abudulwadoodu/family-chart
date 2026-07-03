import { icon } from './icons.js';

/**
 * Focus Mode: an isolated, reusable "maximize the current view" layout mode.
 *
 * It only ever toggles CSS classes and moves/creates a floating toolbar - it
 * never touches the tree/chart DOM or re-renders it, so zoom, pan, selection,
 * and expanded/collapsed state all survive a toggle untouched. That same
 * class-toggling shape (`document.body.classList.add(ACTIVE_CLASS)` + a
 * config describing what to render in the floating toolbar) is what would let
 * future modes (presentation, kiosk, print preview, ...) reuse this module
 * instead of duplicating it.
 */

const ACTIVE_CLASS = 'focus-mode-active';
const TRANSITION_CLASS = 'focus-mode-transitioning';
// Kept in sync with styles.css's focus-mode-fade/focus-mode-toolbar-in
// animation-duration (0.26s) - the single source of truth for how long to
// wait before running post-transition work (config.onEnter/onExit).
const TRANSITION_MS = 260;

let controller = null;

/**
 * @param {{
 *   containerSelector: string,
 *   actions: Array<{ id: string, label: string, iconName: string, onClick: () => void } | 'separator'>,
 *   onEnter?: () => void,
 *   onExit?: () => void,
 * }} config
 * @returns {{ enter: () => void, exit: () => void, toggle: () => void, isActive: () => boolean, destroy: () => void }}
 */
export function createFocusMode(config) {
  if (controller) controller.destroy();

  const state = {
    active: false,
    lastFocusedEl: null,
    toolbarEl: null,
    pendingTransitionTimer: null,
  };

  function getContainer() {
    return document.querySelector(config.containerSelector);
  }

  function buildToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'focus-mode-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Focus mode controls');

    toolbar.innerHTML = config.actions
      .map((action) => {
        if (action === 'separator') return '<span class="focus-mode-toolbar-sep" aria-hidden="true"></span>';
        return `<button type="button" class="icon-btn focus-mode-toolbar-btn" data-focus-action="${action.id}" aria-label="${action.label}" title="${action.label}">${icon(action.iconName)}</button>`;
      })
      .join('');

    toolbar.querySelectorAll('[data-focus-action]').forEach((btn) => {
      const action = config.actions.find((a) => a !== 'separator' && a.id === btn.dataset.focusAction);
      if (action) btn.addEventListener('click', action.onClick);
    });

    return toolbar;
  }

  async function requestBrowserFullscreen(el) {
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch (_error) {
      // Denied or unsupported - Focus Mode still works as a full-window layout.
    }
  }

  async function exitBrowserFullscreen() {
    try {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsEl) return;
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
    } catch (_error) {
      // Already out of fullscreen, or the API isn't available - nothing to do.
    }
  }

  // Single source of truth for "wait for the enter/exit transition, then run
  // post-transition work" - cancels any timer left over from a rapid re-toggle
  // (e.g. double-pressing "F") so a stale enter's callback can never fire
  // after a later exit has already reverted the layout, or vice versa.
  function afterTransition(fn) {
    if (state.pendingTransitionTimer) window.clearTimeout(state.pendingTransitionTimer);
    state.pendingTransitionTimer = window.setTimeout(() => {
      state.pendingTransitionTimer = null;
      document.body.classList.remove(TRANSITION_CLASS);
      fn();
    }, TRANSITION_MS);
  }

  function enter() {
    if (state.active) return;
    const container = getContainer();
    if (!container) return;

    state.active = true;
    state.lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    state.toolbarEl = buildToolbar();
    document.body.appendChild(state.toolbarEl);

    document.body.classList.add(ACTIVE_CLASS, TRANSITION_CLASS);
    container.classList.add('focus-mode-target');
    requestBrowserFullscreen(document.documentElement);

    container.setAttribute('tabindex', '-1');
    container.focus({ preventScroll: true });

    afterTransition(() => config.onEnter?.());
  }

  function exit() {
    if (!state.active) return;
    const container = getContainer();

    state.active = false;
    document.body.classList.add(TRANSITION_CLASS);
    document.body.classList.remove(ACTIVE_CLASS);
    container?.classList.remove('focus-mode-target');
    exitBrowserFullscreen();

    state.toolbarEl?.remove();
    state.toolbarEl = null;

    container?.removeAttribute('tabindex');
    if (state.lastFocusedEl && document.contains(state.lastFocusedEl)) {
      state.lastFocusedEl.focus({ preventScroll: true });
    }
    state.lastFocusedEl = null;

    afterTransition(() => config.onExit?.());
  }

  function toggle() {
    if (state.active) exit();
    else enter();
  }

  // Lets the consumer disable/enable a toolbar action after the fact (e.g.
  // zoom/center have nothing to act on in an alternate view mode) without
  // rebuilding the toolbar.
  function setActionDisabled(id, disabled) {
    const btn = state.toolbarEl?.querySelector(`[data-focus-action="${id}"]`);
    if (btn) btn.disabled = disabled;
  }

  // Registered for the controller's whole lifetime (not just while active) so
  // "F" can both enter and exit Focus Mode; Escape is only meaningful once
  // active, so it's left untouched the rest of the time. Bubble phase (not
  // capture) so it never runs ahead of a modal/dialog's own Escape handler
  // (see ui.js's showModal/showConfirmDialog) - and it defers to one entirely
  // if any is open, so a single Escape closes the modal, not both at once.
  function onKeyDown(event) {
    if (isTypingTarget(event.target) || document.querySelector('.modal-overlay')) return;
    if (event.key === 'Escape') {
      if (!state.active) return;
      event.preventDefault();
      exit();
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      toggle();
    }
  }

  function isTypingTarget(el) {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }

  // The browser can exit fullscreen behind our back (user presses the
  // browser's own "Esc to exit fullscreen" hint, or an OS shortcut) - stay in
  // sync so Focus Mode's floating toolbar doesn't linger with no fullscreen.
  function onFullscreenChange() {
    const fsActive = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (!fsActive && state.active) exit();
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  function destroy() {
    if (state.active) exit();
    if (state.pendingTransitionTimer) window.clearTimeout(state.pendingTransitionTimer);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
  }

  controller = { enter, exit, toggle, setActionDisabled, isActive: () => state.active, destroy };
  return controller;
}

export function isFullscreenSupported() {
  return Boolean(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
}
