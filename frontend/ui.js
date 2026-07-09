// Thin compatibility layer over appUX.js's appModal/appToast engine.
// Kept as the import surface for the app's existing ~20 call sites
// (showConfirmDialog/showModal/showToast) so appUX.js's move to native
// <dialog> landed without touching any of them - new code should prefer
// importing { appModal, appToast } from './appUX.js' directly.
import { appModal, appToast } from './appUX.js';

/** @typedef {{ ok: true }} DeleteTreeResponse */

/**
 * @param {{
 *   title?: string,
 *   message?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   onConfirm?: () => void | Promise<void>,
 *   onCancel?: () => void,
 * }} options
 * @returns {{ close: () => void, setLoading: (loading: boolean) => void }}
 */
export function showConfirmDialog({
  title = 'Delete Family Tree',
  message = 'Are you sure you want to delete this family tree? This action cannot be undone.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
} = {}) {
  return appModal.confirm({ title, message, confirmLabel, cancelLabel, type: 'danger', onConfirm, onCancel });
}

/**
 * @param {{ bodyHtml: string, className?: string, onMount?: (root: HTMLElement) => void, onClose?: () => void }} options
 * @returns {{ close: () => void, setBody: (html: string) => void, root: HTMLElement }}
 */
export function showModal({ bodyHtml, className = '', onMount, onClose }) {
  return appModal.open({ bodyHtml, className, onMount, onClose });
}

/**
 * @param {string} message
 * @param {{ type?: 'success' | 'error', duration?: number }} [options]
 */
export function showToast(message, { type = 'success', duration = 4000 } = {}) {
  appToast.show(message, { type, duration });
}
