// Six-step GEDCOM import wizard (Upload -> Validation -> Preview -> Import
// Options -> Progress -> Summary). Deliberately decoupled from main.js's
// app state - it only depends on the generic `api`/`showModal`/`showToast`
// primitives the rest of the app already uses, and reports back through
// `onImported` so main.js stays the only place that touches the global
// dashboard state.
import { showModal, showToast } from './ui.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

const TOTAL_STEPS = 6;
const STEP_LABELS = ['Upload', 'Validation', 'Preview', 'Import Options', 'Progress', 'Summary'];

export function openGedcomImportWizard({ api, mode, treeId, treeName, treeOptions = [], onImported }) {
  const wiz = {
    step: 1,
    file: null,
    validating: false,
    preview: null, // { ok, errors, warnings, summary }
    uploadError: '',
    options: {
      targetMode: mode === 'existing' ? 'existing' : 'create',
      newTreeName: '',
      targetTreeId: treeId || treeOptions[0]?.id || null,
      importNotes: true,
      importUnsupportedAsNotes: false,
    },
    committing: false,
    commitError: '',
    result: null,
  };

  const modal = showModal({ bodyHtml: '<p>Loading...</p>', className: 'modal-gedcom-wizard' });
  const renderStep = () => {
    modal.setBody(shell(wiz.step, bodyForStep(wiz, { treeName, treeOptions })));
    bindListeners(modal, wiz, { api, treeId, treeName, treeOptions, onImported, renderStep });
  };
  renderStep();

  return modal;
}

function shell(step, innerHtml) {
  return `
    <button type="button" class="icon-btn modal-close" id="wizard-close-btn" aria-label="Close">${icon('close')}</button>
    <p class="wizard-step-label">Step ${step} of ${TOTAL_STEPS} &middot; ${STEP_LABELS[step - 1]}</p>
    ${innerHtml}
  `;
}

function bodyForStep(wiz, ctx) {
  switch (wiz.step) {
    case 1:
      return renderUploadStep(wiz);
    case 2:
      return renderValidationStep(wiz);
    case 3:
      return renderPreviewStep(wiz);
    case 4:
      return renderOptionsStep(wiz, ctx);
    case 5:
      return renderProgressStep(wiz);
    case 6:
      return renderSummaryStep(wiz);
    default:
      return '';
  }
}

function renderUploadStep(wiz) {
  return `
    <h3>Import GEDCOM</h3>
    <p class="modal-message">Select a .ged file exported from another genealogy program. Nothing is saved until you confirm at the end of this wizard.</p>
    <label class="gedcom-dropzone" for="wizard-file-input">
      ${icon('upload')}
      <span>${wiz.file ? escapeHtml(wiz.file.name) : 'Choose a .ged file'}</span>
    </label>
    <input type="file" id="wizard-file-input" accept=".ged,text/plain,application/octet-stream" hidden />
    ${wiz.uploadError ? `<p class="field-error">${escapeHtml(wiz.uploadError)}</p>` : ''}
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="wizard-cancel-btn">Cancel</button>
      <button type="button" class="btn btn-primary" id="wizard-validate-btn" ${wiz.file ? '' : 'disabled'}>Validate File</button>
    </div>
  `;
}

function renderValidationStep(wiz) {
  if (wiz.validating) {
    return `
      <h3>Validating&hellip;</h3>
      <p class="modal-message">Parsing and checking your GEDCOM file for problems.</p>
      <div class="wizard-spinner">${icon('spinner')}</div>
    `;
  }

  const { errors = [], warnings = [] } = wiz.preview || {};
  return `
    <h3>Validation</h3>
    ${
      errors.length === 0 && warnings.length === 0
        ? '<p class="modal-message">No problems found. This file is ready to import.</p>'
        : ''
    }
    ${renderIssueList('Errors', errors, 'danger')}
    ${renderIssueList('Warnings', warnings, 'warning')}
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="wizard-back-btn">Back</button>
      <button type="button" class="btn btn-primary" id="wizard-next-btn" ${errors.length > 0 ? 'disabled' : ''}>Continue</button>
    </div>
  `;
}

function renderIssueList(title, items, tone) {
  if (items.length === 0) return '';
  return `
    <div class="wizard-issue-group">
      <p class="wizard-issue-title wizard-tone-${tone}">${title} (${items.length})</p>
      <ul class="wizard-issue-list">
        ${items.map((item) => `<li>${escapeHtml(item.message)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderPreviewStep(wiz) {
  const { summary = {}, people = [] } = wiz.preview || {};
  const sample = people.slice(0, 8);
  return `
    <h3>Preview</h3>
    <div class="wizard-summary-grid">
      <div class="wizard-summary-card"><strong>${summary.individuals ?? 0}</strong><span>Individuals</span></div>
      <div class="wizard-summary-card"><strong>${summary.families ?? 0}</strong><span>Families</span></div>
      <div class="wizard-summary-card"><strong>${summary.warningCount ?? 0}</strong><span>Warnings</span></div>
    </div>
    ${
      sample.length
        ? `<ul class="wizard-preview-list">
            ${sample
              .map((p) => `<li>${escapeHtml(`${p.data?.['first name'] || ''} ${p.data?.['last name'] || ''}`.trim() || p.id)}</li>`)
              .join('')}
            ${people.length > sample.length ? `<li class="wizard-preview-more">+ ${people.length - sample.length} more</li>` : ''}
          </ul>`
        : ''
    }
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="wizard-back-btn">Back</button>
      <button type="button" class="btn btn-primary" id="wizard-next-btn">Continue</button>
    </div>
  `;
}

function renderOptionsStep(wiz, { treeOptions }) {
  const { options } = wiz;
  return `
    <h3>Import Options</h3>
    <div class="wizard-option-group">
      <label class="wizard-radio-row">
        <input type="radio" name="wizard-target-mode" value="create" ${options.targetMode === 'create' ? 'checked' : ''} />
        <span>Create a new tree</span>
      </label>
      ${
        options.targetMode === 'create'
          ? `<input type="text" id="wizard-new-tree-name" placeholder="e.g. Smith Family Tree" value="${escapeHtml(options.newTreeName)}" maxlength="120" />`
          : ''
      }
      <label class="wizard-radio-row">
        <input type="radio" name="wizard-target-mode" value="existing" ${options.targetMode === 'existing' ? 'checked' : ''} />
        <span>Import into an existing tree</span>
      </label>
      ${
        options.targetMode === 'existing'
          ? `<select id="wizard-target-tree-select">
              ${
                treeOptions.length
                  ? treeOptions
                      .map(
                        (t) =>
                          `<option value="${t.id}" ${String(t.id) === String(options.targetTreeId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
                      )
                      .join('')
                  : '<option value="">No editable trees available</option>'
              }
            </select>
            <p class="modal-message wizard-tone-warning">This replaces everything currently in that tree with the people from this file.</p>`
          : ''
      }
    </div>
    <div class="wizard-option-group">
      <label class="wizard-checkbox-row">
        <input type="checkbox" id="wizard-opt-import-notes" ${options.importNotes ? 'checked' : ''} />
        <span>Import notes</span>
      </label>
      <label class="wizard-checkbox-row">
        <input type="checkbox" id="wizard-opt-unsupported-as-notes" ${options.importUnsupportedAsNotes ? 'checked' : ''} />
        <span>Import unsupported fields as notes</span>
      </label>
    </div>
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="wizard-back-btn">Back</button>
      <button type="button" class="btn btn-primary" id="wizard-start-import-btn">Start Import</button>
    </div>
  `;
}

function renderProgressStep(wiz) {
  return `
    <h3>Importing&hellip;</h3>
    <p class="modal-message">Saving people and relationships to your family tree.</p>
    <div class="wizard-spinner">${icon('spinner')}</div>
    ${wiz.commitError ? `<p class="field-error">${escapeHtml(wiz.commitError)}</p>` : ''}
    ${
      wiz.commitError
        ? `<div class="modal-actions row">
            <button type="button" class="btn-secondary" id="wizard-back-btn">Back</button>
          </div>`
        : ''
    }
  `;
}

function renderSummaryStep(wiz) {
  const result = wiz.result || {};
  const warnings = result.warnings || [];
  return `
    <h3>Import Complete</h3>
    <div class="wizard-summary-grid">
      <div class="wizard-summary-card"><strong>${result.imported_count ?? 0}</strong><span>Imported</span></div>
      <div class="wizard-summary-card"><strong>${warnings.length}</strong><span>Warnings</span></div>
    </div>
    ${renderIssueList('Warnings', warnings, 'warning')}
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="wizard-close-summary-btn">Close</button>
      <button type="button" class="btn btn-primary" id="wizard-open-tree-btn">Open Tree</button>
    </div>
  `;
}

function bindListeners(modal, wiz, ctx) {
  const { api, treeOptions, onImported, renderStep } = ctx;
  const root = modal.root;

  root.querySelector('#wizard-close-btn')?.addEventListener('click', () => {
    modal.close();
    if (wiz.result) onImported?.({ ...wiz.result, openTree: false });
  });

  if (wiz.step === 1) {
    const fileInput = root.querySelector('#wizard-file-input');
    root.querySelector('.gedcom-dropzone')?.addEventListener('click', (event) => {
      event.preventDefault();
      fileInput.click();
    });
    fileInput?.addEventListener('change', () => {
      wiz.file = fileInput.files?.[0] || null;
      wiz.uploadError = '';
      renderStep();
    });
    root.querySelector('#wizard-cancel-btn')?.addEventListener('click', modal.close);
    root.querySelector('#wizard-validate-btn')?.addEventListener('click', async () => {
      if (!wiz.file) return;
      wiz.step = 2;
      wiz.validating = true;
      renderStep();
      try {
        const formData = new FormData();
        formData.append('file', wiz.file);
        const result = await api('/api/trees/gedcom/preview', { method: 'POST', body: formData });
        wiz.preview = result;
        wiz.validating = false;
        renderStep();
      } catch (error) {
        wiz.step = 1;
        wiz.validating = false;
        wiz.uploadError = error.message || 'Could not parse this file.';
        renderStep();
      }
    });
  }

  if (wiz.step === 2 && !wiz.validating) {
    root.querySelector('#wizard-back-btn')?.addEventListener('click', () => {
      wiz.step = 1;
      renderStep();
    });
    root.querySelector('#wizard-next-btn')?.addEventListener('click', () => {
      wiz.step = 3;
      renderStep();
    });
  }

  if (wiz.step === 3) {
    root.querySelector('#wizard-back-btn')?.addEventListener('click', () => {
      wiz.step = 2;
      renderStep();
    });
    root.querySelector('#wizard-next-btn')?.addEventListener('click', () => {
      wiz.step = 4;
      renderStep();
    });
  }

  if (wiz.step === 4) {
    root.querySelectorAll('input[name="wizard-target-mode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        wiz.options.targetMode = radio.value;
        renderStep();
      });
    });
    root.querySelector('#wizard-new-tree-name')?.addEventListener('input', (event) => {
      wiz.options.newTreeName = event.target.value;
    });
    root.querySelector('#wizard-target-tree-select')?.addEventListener('change', (event) => {
      wiz.options.targetTreeId = event.target.value;
    });
    root.querySelector('#wizard-opt-import-notes')?.addEventListener('change', (event) => {
      wiz.options.importNotes = event.target.checked;
    });
    root.querySelector('#wizard-opt-unsupported-as-notes')?.addEventListener('change', (event) => {
      wiz.options.importUnsupportedAsNotes = event.target.checked;
    });
    root.querySelector('#wizard-back-btn')?.addEventListener('click', () => {
      wiz.step = 3;
      renderStep();
    });
    root.querySelector('#wizard-start-import-btn')?.addEventListener('click', async () => {
      if (wiz.options.targetMode === 'create' && !wiz.options.newTreeName.trim()) {
        showToast('Enter a name for the new tree.', { type: 'error' });
        return;
      }
      if (wiz.options.targetMode === 'existing' && !wiz.options.targetTreeId) {
        showToast('Choose a tree to import into.', { type: 'error' });
        return;
      }
      wiz.step = 5;
      wiz.committing = true;
      wiz.commitError = '';
      renderStep();
      try {
        let targetTreeId = wiz.options.targetTreeId;
        let targetTreeName;
        if (wiz.options.targetMode === 'create') {
          const created = await api('/api/trees', { method: 'POST', body: JSON.stringify({ name: wiz.options.newTreeName.trim() }) });
          targetTreeId = created.id;
          targetTreeName = created.name;
        } else {
          targetTreeName = treeOptions.find((t) => String(t.id) === String(targetTreeId))?.name;
        }

        const formData = new FormData();
        formData.append('file', wiz.file);
        formData.append(
          'options',
          JSON.stringify({
            importNotes: wiz.options.importNotes,
            importUnsupportedAsNotes: wiz.options.importUnsupportedAsNotes,
          })
        );

        const result = await api(`/api/trees/${targetTreeId}/import-gedcom`, { method: 'POST', body: formData });
        wiz.result = { ...result, treeId: targetTreeId, treeName: targetTreeName };
        wiz.committing = false;
        wiz.step = 6;
        renderStep();
      } catch (error) {
        wiz.committing = false;
        wiz.commitError = error.message || 'Import failed.';
        renderStep();
      }
    });
  }

  if (wiz.step === 5 && wiz.commitError) {
    root.querySelector('#wizard-back-btn')?.addEventListener('click', () => {
      wiz.step = 4;
      wiz.commitError = '';
      renderStep();
    });
  }

  if (wiz.step === 6) {
    root.querySelector('#wizard-close-summary-btn')?.addEventListener('click', () => {
      modal.close();
      onImported?.({ ...wiz.result, openTree: false });
    });
    root.querySelector('#wizard-open-tree-btn')?.addEventListener('click', () => {
      modal.close();
      onImported?.({ ...wiz.result, openTree: true });
    });
  }
}
