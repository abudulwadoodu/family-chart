// Core UX engine: confirmation dialogs, generic modals, toast notifications,
// contextual tooltips, and an unsaved-changes guard (FormGuard). ui.js's
// showConfirmDialog/showModal/showToast are thin wrappers around appModal/
// appToast below - kept as the import surface for the app's ~20 existing
// call sites so this module could land without touching any of them.
//
// Exposed on window (appToast/appModal/FormGuard) per the app-wide UX spec,
// in addition to the ES exports every other frontend/*.js module uses -
// window access lets error handlers and non-module inline snippets reach
// them without an import, and lets `app:toast` events be fired from
// anywhere (see attachToastEventBridge below).

import { escapeHtml } from './utils.js';

/* -------------------------------------------------------------------- */
/* appModal - native <dialog>-based confirmation + generic modal engine  */
/* -------------------------------------------------------------------- */

let activeDialogEl = null;

function closeActiveDialog() {
  if (activeDialogEl && activeDialogEl.open) activeDialogEl.close();
}

/**
 * @param {{
 *   title?: string,
 *   message?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   type?: 'danger' | 'warning' | 'info',
 *   onConfirm?: () => void | Promise<void>,
 *   onCancel?: () => void,
 * }} options
 * @returns {{ close: () => void, setLoading: (loading: boolean) => void }}
 */
function confirm({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'danger',
  onConfirm,
  onCancel,
} = {}) {
  closeActiveDialog();

  const dialog = document.createElement('dialog');
  dialog.className = `modal-overlay modal-dialog card modal-${type}`;
  dialog.innerHTML = `
    <h3 id="modal-title">${escapeHtml(title)}</h3>
    <p class="modal-message">${escapeHtml(message)}</p>
    <div class="modal-actions row">
      <button type="button" class="secondary modal-cancel">${escapeHtml(cancelLabel)}</button>
      <button type="button" class="${type === 'info' ? '' : 'btn-danger'} modal-confirm">${escapeHtml(confirmLabel)}</button>
    </div>
  `;
  dialog.setAttribute('aria-labelledby', 'modal-title');

  const cancelBtn = dialog.querySelector('.modal-cancel');
  const confirmBtn = dialog.querySelector('.modal-confirm');

  const setLoading = (loading) => {
    cancelBtn.disabled = loading;
    confirmBtn.disabled = loading;
    confirmBtn.textContent = loading ? 'Working...' : confirmLabel;
  };

  let settled = false;
  const close = () => {
    if (dialog.open) dialog.close();
  };

  cancelBtn.addEventListener('click', () => {
    if (confirmBtn.disabled) return;
    settled = true;
    onCancel?.();
    close();
  });

  confirmBtn.addEventListener('click', async () => {
    if (confirmBtn.disabled) return;
    setLoading(true);
    try {
      await onConfirm?.();
      settled = true;
      close();
    } catch (error) {
      // onConfirm handlers are expected to catch and toast their own errors
      // (see e.g. admin/users/logic.js's setStatus) - this is a last-resort
      // net so an unexpected throw doesn't leave the dialog silently stuck
      // with no explanation at all.
      console.error('[appModal.confirm] onConfirm threw', error);
      setLoading(false);
    }
  });

  // cancel fires on Escape and on backdrop click (native <dialog> behavior);
  // treat both as an implicit "cancel" unless the confirm action is pending.
  dialog.addEventListener('cancel', (event) => {
    if (confirmBtn.disabled) {
      event.preventDefault();
      return;
    }
    settled = true;
    onCancel?.();
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !confirmBtn.disabled) close();
  });

  dialog.addEventListener('close', () => {
    if (!settled) onCancel?.();
    dialog.remove();
    if (activeDialogEl === dialog) activeDialogEl = null;
  });

  document.body.appendChild(dialog);
  activeDialogEl = dialog;
  dialog.showModal();
  cancelBtn.focus();

  return { close, setLoading };
}

/**
 * @param {{ bodyHtml: string, className?: string, onMount?: (root: HTMLElement) => void, onClose?: () => void }} options
 * @returns {{ close: () => void, setBody: (html: string) => void, root: HTMLElement }}
 */
function open({ bodyHtml, className = '', onMount, onClose } = {}) {
  closeActiveDialog();

  const dialog = document.createElement('dialog');
  dialog.className = `modal-overlay modal-dialog card ${className}`.trim();
  dialog.innerHTML = bodyHtml;

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  let closedFired = false;
  dialog.addEventListener('close', () => {
    if (activeDialogEl === dialog) activeDialogEl = null;
    dialog.remove();
    if (!closedFired) {
      closedFired = true;
      onClose?.();
    }
  });

  const close = () => {
    if (dialog.open) dialog.close();
  };

  const setBody = (html) => {
    dialog.innerHTML = html;
    onMount?.(dialog);
  };

  document.body.appendChild(dialog);
  activeDialogEl = dialog;
  dialog.showModal();
  onMount?.(dialog);

  return { close, setBody, root: dialog };
}

export const appModal = { confirm, open };

/* -------------------------------------------------------------------- */
/* appToast - stacking, auto-dismissing toast notifications              */
/* -------------------------------------------------------------------- */

const TOAST_MAX_VISIBLE = 3;
const TOAST_DEFAULT_DURATION = 4000;
const TOAST_ICONS = { success: '✓', error: '!', warning: '!', info: 'i' };

let toastContainer = null;
const toastQueue = [];

function getToastContainer() {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  toastContainer.setAttribute('aria-live', 'polite');
  toastContainer.setAttribute('aria-atomic', 'false');
  document.body.appendChild(toastContainer);
  return toastContainer;
}

function renderNextQueued() {
  const container = getToastContainer();
  if (toastQueue.length === 0) return;
  if (container.children.length >= TOAST_MAX_VISIBLE) return;
  const next = toastQueue.shift();
  next();
}

/**
 * @param {string} message
 * @param {{ type?: 'success' | 'error' | 'info' | 'warning', duration?: number }} [options]
 */
function show(message, { type = 'success', duration = TOAST_DEFAULT_DURATION } = {}) {
  const spawn = () => {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
      <span class="toast-icon" aria-hidden="true">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" aria-label="Dismiss notification">×</button>
    `;

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      toast.classList.remove('toast-show');
      toast.classList.add('toast-hide');
      toast.addEventListener('transitionend', () => {
        toast.remove();
        renderNextQueued();
      }, { once: true });
      // Fallback in case transitionend never fires (e.g. reduced-motion).
      setTimeout(() => {
        if (toast.isConnected) toast.remove();
        renderNextQueued();
      }, 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));

    let timer = duration > 0 ? setTimeout(dismiss, duration) : null;

    return dismiss;
  };

  const container = getToastContainer();
  if (container.children.length >= TOAST_MAX_VISIBLE) {
    toastQueue.push(spawn);
    return;
  }
  spawn();
}

/** Listens for `app:toast` CustomEvents so any fetch/error handler can fire
 * a toast without importing this module directly, e.g.:
 *   document.dispatchEvent(new CustomEvent('app:toast', {
 *     detail: { message: 'Could not save changes.', type: 'error' }
 *   }));
 * Called once during app bootstrap (see main.js).
 */
function attachToastEventBridge(target = document) {
  target.addEventListener('app:toast', (event) => {
    const { message, type, duration } = event.detail || {};
    if (!message) return;
    show(message, { type, duration });
  });
}

export const appToast = { show, attachToastEventBridge };

/* -------------------------------------------------------------------- */
/* Tooltips - CSS-driven, activated via data-tooltip[-position]          */
/* -------------------------------------------------------------------- */

/**
 * Tooltips are pure CSS (see the "Tooltips" section of styles.css): any
 * element with a `data-tooltip="..."` attribute gets a floating label on
 * hover/focus via ::after, positioned by `data-tooltip-position`
 * ('top' default | 'bottom' | 'left' | 'right'). This initializer only
 * handles the one thing CSS can't: keeping the tooltip from being clipped
 * off-screen near a viewport edge, by flipping to the opposite side.
 */
function initTooltips(root = document) {
  const elements = root.querySelectorAll('[data-tooltip]');
  elements.forEach((el) => {
    if (el.dataset.tooltipInit) return;
    el.dataset.tooltipInit = 'true';

    const reposition = () => {
      const rect = el.getBoundingClientRect();
      const position = el.dataset.tooltipPosition || 'top';
      if (position === 'top' && rect.top < 48) {
        el.dataset.tooltipPosition = 'bottom';
        el.dataset.tooltipFlipped = 'true';
      } else if (position === 'bottom' && rect.bottom > window.innerHeight - 48 && el.dataset.tooltipFlipped) {
        el.dataset.tooltipPosition = 'top';
      }
    };

    el.addEventListener('mouseenter', reposition);
    el.addEventListener('focus', reposition);
  });
}

export const appTooltip = { init: initTooltips };

/* -------------------------------------------------------------------- */
/* FormValidation - inline micro-copy driver for .field-hint/.field-error*/
/* -------------------------------------------------------------------- */

/**
 * Drives the neutral-helper -> warning transition on a field's hint slot
 * (a `<span class="field-hint" id="{field}-hint">` placed below an input,
 * styled in the "Form Validation micro-copy" section of styles.css).
 *
 * @param {string} fieldId base id shared by the input/hint, e.g. 'record-name'
 *   expects `#{fieldId}-input` and `#{fieldId}-hint` to exist in the DOM.
 * @param {{ valid: boolean, message: string }} result
 */
function setFieldValidation(fieldId, { valid, message }) {
  const hintEl = document.getElementById(`${fieldId}-hint`);
  const inputEl = document.getElementById(`${fieldId}-input`);
  if (hintEl) {
    hintEl.textContent = message || '';
    hintEl.classList.toggle('field-hint-invalid', !valid && Boolean(message));
    hintEl.classList.toggle('field-hint-valid', valid && Boolean(message));
  }
  if (inputEl) {
    inputEl.setAttribute('aria-invalid', !valid ? 'true' : 'false');
    if (!valid) {
      inputEl.classList.remove('field-shake');
      // eslint-disable-next-line no-unused-expressions -- reflow to restart animation
      void inputEl.offsetWidth;
      inputEl.classList.add('field-shake');
    }
  }
}

/** Resets a field's hint back to its neutral helper text (e.g. on focus). */
function resetFieldValidation(fieldId, helperText = '') {
  const hintEl = document.getElementById(`${fieldId}-hint`);
  const inputEl = document.getElementById(`${fieldId}-input`);
  if (hintEl) {
    hintEl.textContent = helperText;
    hintEl.classList.remove('field-hint-invalid', 'field-hint-valid');
  }
  if (inputEl) inputEl.setAttribute('aria-invalid', 'false');
}

export const FormValidation = { setField: setFieldValidation, resetField: resetFieldValidation };

/* -------------------------------------------------------------------- */
/* FormGuard - dirty-state tracking + navigation guard                   */
/* -------------------------------------------------------------------- */

/**
 * Tracks "dirty" state for one or more forms/data sources and guards
 * against losing unsaved work via the native beforeunload prompt plus a
 * pluggable hook for in-app (SPA-style) navigation.
 *
 * Usage:
 *   const guard = FormGuard.create({ id: 'family-record' });
 *   guard.watch(formEl);              // marks dirty on input/change
 *   guard.markDirty() / markClean();  // manual control (e.g. chart editors)
 *   guard.isDirty();
 *   FormGuard.guardNavigation(async () => {
 *     // called before any in-app navigation the app wants guarded
 *     return appModal.confirm({ ... }); // resolve/reject-style gate
 *   });
 */
function createFormGuard({ id = 'default', message = 'You have unsaved changes. Leave without saving?' } = {}) {
  let dirty = false;
  const watchedForms = new Set();

  const markDirty = () => {
    dirty = true;
  };
  const markClean = () => {
    dirty = false;
  };
  const isDirty = () => dirty;

  const onInput = (event) => {
    if (event.target.matches?.('input, select, textarea')) markDirty();
  };

  const watch = (formEl) => {
    if (!formEl || watchedForms.has(formEl)) return;
    watchedForms.add(formEl);
    formEl.addEventListener('input', onInput);
    formEl.addEventListener('change', onInput);
  };

  const unwatch = (formEl) => {
    if (!watchedForms.has(formEl)) return;
    watchedForms.delete(formEl);
    formEl.removeEventListener('input', onInput);
    formEl.removeEventListener('change', onInput);
  };

  const destroy = () => {
    watchedForms.forEach(unwatch);
    registeredGuards.delete(id);
  };

  const guard = { id, message, watch, unwatch, markDirty, markClean, isDirty, destroy };
  registeredGuards.set(id, guard);
  return guard;
}

const registeredGuards = new Map();

function anyDirty() {
  for (const guard of registeredGuards.values()) {
    if (guard.isDirty()) return true;
  }
  return false;
}

let beforeUnloadAttached = false;
function attachBeforeUnload() {
  if (beforeUnloadAttached || typeof window === 'undefined') return;
  beforeUnloadAttached = true;
  window.addEventListener('beforeunload', (event) => {
    if (!anyDirty()) return;
    // Modern browsers ignore custom copy and show their own generic
    // message, but preventDefault + returnValue is still the required
    // incantation to trigger the native "leave site?" prompt at all.
    event.preventDefault();
    event.returnValue = '';
  });
}

/**
 * Fallback hook for client-side/in-app navigation (sidebar links, tree
 * switching, tab changes) that beforeunload can't intercept since the page
 * never actually unloads. Callers should invoke this before performing the
 * navigation and only proceed if it resolves true.
 *
 * @param {() => Promise<boolean> | boolean} [confirmFn] Custom confirm
 *   step; defaults to appModal.confirm using the most recently dirtied
 *   guard's message. Return/resolve true to allow navigation.
 * @returns {Promise<boolean>}
 */
async function guardNavigation(confirmFn) {
  if (!anyDirty()) return true;
  if (confirmFn) return Boolean(await confirmFn());

  const dirtyGuard = [...registeredGuards.values()].find((guard) => guard.isDirty());
  return new Promise((resolve) => {
    appModal.confirm({
      title: 'Unsaved changes',
      message: dirtyGuard?.message || 'You have unsaved changes. Leave without saving?',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      type: 'warning',
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

attachBeforeUnload();

export const FormGuard = { create: createFormGuard, guardNavigation, anyDirty };

/* -------------------------------------------------------------------- */
/* Global exposure                                                       */
/* -------------------------------------------------------------------- */

if (typeof window !== 'undefined') {
  window.appToast = appToast;
  window.appModal = appModal;
  window.FormGuard = FormGuard;
  window.appTooltip = appTooltip;
  window.FormValidation = FormValidation;
}
