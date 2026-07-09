// Integration example: a family record edit form wired up to all four
// appUX.js systems at once. Not imported anywhere in the running app -
// this is reference code showing the intended usage pattern for future
// forms (e.g. a custom "add relative" panel), mirroring the conventions
// already used by the Contact Us form (novalidate + field-error spans +
// aria-invalid) and by main.js's handleSaveTree()/promptDeleteTree() flows.
//
// Persistence note: there is no per-member REST endpoint (see backend/
// routes/trees.js) - member add/edit/delete all happens in memory against
// the tree's people array and is persisted as one bulk
// `PUT /api/trees/:id { json_data }` call. This example follows that same
// shape: onSave receives the edited record and is expected to fold it into
// the in-memory tree and trigger that same bulk save.

import { appModal, appToast, FormGuard, FormValidation } from '../appUX.js';
import { escapeHtml } from '../utils.js';

/**
 * @param {{
 *   record: { id: string, firstName: string, lastName: string, birthday?: string },
 *   onSave: (record: object) => Promise<void>,
 *   onDelete: (id: string) => Promise<void>,
 * }} options
 */
export function renderFamilyRecordForm({ record, onSave, onDelete }) {
  const bodyHtml = `
    <h3 id="modal-title">Edit family member</h3>
    <form id="family-record-form" class="contact-form" novalidate>
      <label>First name
        <span data-tooltip="Shown on the tree card and used to match duplicates." data-tooltip-position="right">${infoDot()}</span>
        <input id="record-firstName-input" name="firstName" type="text" value="${escapeHtml(record.firstName || '')}" aria-describedby="record-firstName-hint" />
        <span class="field-hint" id="record-firstName-hint">Required.</span>
      </label>

      <label>Last name
        <input id="record-lastName-input" name="lastName" type="text" value="${escapeHtml(record.lastName || '')}" aria-describedby="record-lastName-hint" />
        <span class="field-hint" id="record-lastName-hint"></span>
      </label>

      <label>Birthday
        <span data-tooltip="Accepts partial dates, e.g. just a year." data-tooltip-position="right">${infoDot()}</span>
        <input id="record-birthday-input" name="birthday" type="text" placeholder="YYYY-MM-DD" value="${escapeHtml(record.birthday || '')}" aria-describedby="record-birthday-hint" />
        <span class="field-hint" id="record-birthday-hint">Optional.</span>
      </label>

      <p class="field-error" id="family-record-form-error" role="alert"></p>

      <div class="modal-actions row">
        <button type="button" class="btn-danger" id="record-delete-btn" style="margin-right:auto">Delete</button>
        <button type="button" class="secondary" id="record-cancel-btn">Cancel</button>
        <button type="submit" id="record-save-btn">Save changes</button>
      </div>
    </form>
  `;

  const modal = appModal.open({
    bodyHtml,
    className: 'modal-family-record',
    onMount: (root) => attachListeners(root, { record, onSave, onDelete, modal: () => modal }),
    onClose: () => guard.destroy(),
  });

  // 1. Unsaved-changes guard - marks dirty on any input/change inside the
  // form and blocks the tab/window from closing unnoticed via beforeunload.
  const guard = FormGuard.create({
    id: `family-record-${record.id}`,
    message: `You have unsaved changes to ${record.firstName || 'this record'}. Leave without saving?`,
  });
  guard.watch(modal.root.querySelector('#family-record-form'));

  return modal;
}

function infoDot() {
  return '<span class="field-info-dot" aria-hidden="true">i</span>';
}

function attachListeners(root, { record, onSave, onDelete, modal }) {
  const form = root.querySelector('#family-record-form');
  const formErrorEl = root.querySelector('#family-record-form-error');

  // 2. Real-time validation micro-copy - transitions the first-name hint
  // from neutral helper text to a warning as the user types, instead of
  // waiting for submit.
  const firstNameInput = root.querySelector('#record-firstName-input');
  firstNameInput.addEventListener('input', () => {
    const value = firstNameInput.value.trim();
    if (!value) {
      FormValidation.setField('record-firstName', { valid: false, message: 'First name is required.' });
    } else {
      FormValidation.setField('record-firstName', { valid: true, message: 'Looks good.' });
    }
  });

  root.querySelector('#record-cancel-btn').addEventListener('click', async () => {
    // Fallback hook for in-app "navigation" - closing this modal counts as
    // one, so it's guarded the same way a sidebar link or tree switch would
    // be (see FormGuard.guardNavigation in appUX.js).
    const canLeave = await FormGuard.guardNavigation();
    if (canLeave) modal().close();
  });

  root.querySelector('#record-delete-btn').addEventListener('click', () => {
    // 3. Native <dialog>-based destructive confirmation.
    appModal.confirm({
      title: 'Delete family member',
      message: `Remove ${record.firstName || 'this person'} ${record.lastName || ''}? This cannot be undone.`.trim(),
      confirmLabel: 'Delete',
      type: 'danger',
      onConfirm: async () => {
        await onDelete(record.id);
        // 4. Toast on success, decoupled from the delete call itself - any
        // other part of the app could also trigger this by dispatching
        // 'app:toast' instead of importing appToast directly.
        appToast.show(`${record.firstName || 'Member'} was removed.`, { type: 'success' });
        modal().close();
      },
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formErrorEl.textContent = '';

    const data = new FormData(form);
    const firstName = String(data.get('firstName') || '').trim();
    if (!firstName) {
      FormValidation.setField('record-firstName', { valid: false, message: 'First name is required.' });
      firstNameInput.focus();
      return;
    }

    const saveBtn = root.querySelector('#record-save-btn');
    const originalLabel = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await onSave({
        ...record,
        firstName,
        lastName: String(data.get('lastName') || '').trim(),
        birthday: String(data.get('birthday') || '').trim(),
      });
      appToast.show('Family member saved.', { type: 'success' });
      modal().close();
    } catch (error) {
      // Same error-surfacing convention as the rest of the app: inline
      // field-error text plus a toast, so it's visible whether or not the
      // user is looking at the modal.
      formErrorEl.textContent = error.message || 'Could not save changes. Please try again.';
      appToast.show(error.message || 'Could not save changes.', { type: 'error' });
      saveBtn.disabled = false;
      saveBtn.textContent = originalLabel;
    }
  });
}
