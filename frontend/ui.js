/** @typedef {{ ok: true }} DeleteTreeResponse */

let activeDialog = null;

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
  if (activeDialog) activeDialog.close();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h3 id="modal-title"></h3>
      <p class="modal-message"></p>
      <div class="modal-actions row">
        <button type="button" class="secondary modal-cancel">${cancelLabel}</button>
        <button type="button" class="btn-danger modal-confirm">${confirmLabel}</button>
      </div>
    </div>
  `;

  overlay.querySelector('#modal-title').textContent = title;
  overlay.querySelector('.modal-message').textContent = message;

  const cancelBtn = overlay.querySelector('.modal-cancel');
  const confirmBtn = overlay.querySelector('.modal-confirm');
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    if (activeDialog?.close === close) activeDialog = null;
  };

  const setLoading = (loading) => {
    cancelBtn.disabled = loading;
    confirmBtn.disabled = loading;
    confirmBtn.textContent = loading ? 'Deleting...' : confirmLabel;
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && !confirmBtn.disabled) {
      onCancel?.();
      close();
    }
  };

  cancelBtn.addEventListener('click', () => {
    if (confirmBtn.disabled) return;
    onCancel?.();
    close();
  });

  confirmBtn.addEventListener('click', async () => {
    if (confirmBtn.disabled) return;
    setLoading(true);
    try {
      await onConfirm?.();
      close();
    } catch (_error) {
      setLoading(false);
    }
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay && !confirmBtn.disabled) {
      onCancel?.();
      close();
    }
  });

  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeyDown);
  cancelBtn.focus();

  const controller = { close, setLoading };
  activeDialog = controller;
  return controller;
}

/**
 * @param {string} message
 * @param {{ type?: 'success' | 'error', duration?: number }} [options]
 */
export function showToast(message, { type = 'success', duration = 4000 } = {}) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="toast-message">${message}</span>
    <button type="button" class="toast-close secondary" aria-label="Dismiss">×</button>
  `;

  const dismiss = () => {
    toast.classList.add('toast-hide');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}
