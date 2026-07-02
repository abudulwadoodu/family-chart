// CSV import panel: a single-view documentation modal (not a multi-step
// wizard like gedcomWizard.js) with two sub-states - `upload` and
// `reviewing`. CSV's failure surface is narrow and warn-first (see
// backend/utils/csv/validator.js), so there's no need for GEDCOM's staged
// Validation/Preview/Options flow; what's needed instead is guidance content
// (required/optional columns, date format, relationship ids) plus a preview
// step before committing. Deliberately decoupled from main.js's app state,
// like gedcomWizard.js - only depends on `api`/`showModal`/`showToast`.
import { showModal, showToast } from './ui.js';
import { escapeHtml, downloadCsv } from './utils.js';
import { icon } from './icons.js';
import { buildCsvText, REQUIRED_COLUMNS, OPTIONAL_COLUMNS, SAMPLE_ROWS } from './csvTemplate.js';

const SUMMARY_TEXT =
  'The CSV template uses unique IDs to define relationships. Parent-child relationships are created automatically using father_id and mother_id. Open the sample template in Excel or Google Sheets to prepare your family tree.';

export function openCsvImportPanel({ api, treeId, onImported }) {
  const state = {
    view: 'upload', // 'upload' | 'reviewing'
    file: null,
    uploadError: '',
    validating: false,
    preview: null, // { ok, errors, warnings, summary, people }
    importing: false,
  };

  const modal = showModal({ bodyHtml: '<p>Loading...</p>', className: 'modal-csv-import' });
  const render = () => {
    modal.setBody(bodyForView(state));
    bindListeners(modal, state, { api, treeId, onImported, render, close: modal.close });
  };
  render();

  return modal;
}

function bodyForView(state) {
  return state.view === 'reviewing' ? renderReviewingView(state) : renderUploadView(state);
}

function renderUploadView(state) {
  return `
    <button type="button" class="icon-btn modal-close" id="csv-panel-close-btn" aria-label="Close">${icon('close')}</button>
    <h3>Import CSV</h3>
    <p class="modal-message">${escapeHtml(SUMMARY_TEXT)}</p>

    <div class="csv-help-section">
      <p class="csv-help-title">Required columns</p>
      <p class="csv-help-text">${REQUIRED_COLUMNS.map(escapeHtml).join(', ')}</p>
      <p class="csv-help-title">Optional columns</p>
      <p class="csv-help-text">${OPTIONAL_COLUMNS.map(escapeHtml).join(', ')}</p>
    </div>

    <ul class="csv-help-list">
      <li><strong>Dates:</strong> use ISO format YYYY-MM-DD, e.g. 1985-06-10.</li>
      <li><strong>Relationship IDs:</strong> father_id, mother_id, and spouse_ids reference another row's own id column, not a name.</li>
      <li><strong>Multiple spouses:</strong> separate more than one spouse id with a semicolon, e.g. p2;p3.</li>
      <li><strong>Gender:</strong> Male, Female, Other, or Unknown (M/F/O/U also accepted).</li>
      <li><strong>Children:</strong> don't list them directly - anyone whose father_id or mother_id points at a row is automatically added as that person's child.</li>
    </ul>

    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="csv-download-blank-btn">${icon('download')}<span>Download Blank Template</span></button>
      <button type="button" class="btn-secondary" id="csv-download-sample-btn">${icon('download')}<span>Download Sample Template</span></button>
    </div>

    <label class="gedcom-dropzone" for="csv-panel-file-input">
      ${icon('upload')}
      <span>${state.file ? escapeHtml(state.file.name) : 'Choose a .csv file'}</span>
    </label>
    <input type="file" id="csv-panel-file-input" accept=".csv,text/csv" hidden />
    ${state.uploadError ? `<p class="field-error">${escapeHtml(state.uploadError)}</p>` : ''}

    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="csv-panel-cancel-btn">Cancel</button>
      <button type="button" class="btn btn-primary" id="csv-panel-validate-btn" ${state.file ? '' : 'disabled'}>
        ${state.validating ? 'Validating...' : 'Validate File'}
      </button>
    </div>
  `;
}

function renderReviewingView(state) {
  const { errors = [], warnings = [], summary = {} } = state.preview || {};
  return `
    <button type="button" class="icon-btn modal-close" id="csv-panel-close-btn" aria-label="Close">${icon('close')}</button>
    <h3>Review Import</h3>
    <div class="wizard-summary-grid">
      <div class="wizard-summary-card"><strong>${summary.importedCount ?? summary.rowCount ?? 0}</strong><span>People</span></div>
      <div class="wizard-summary-card"><strong>${warnings.length}</strong><span>Warnings</span></div>
      <div class="wizard-summary-card"><strong>${errors.length}</strong><span>Errors</span></div>
    </div>
    ${errors.length === 0 && warnings.length === 0 ? '<p class="modal-message">No problems found. This file is ready to import.</p>' : ''}
    ${renderIssueList('Errors', errors, 'danger')}
    ${renderIssueList('Warnings', warnings, 'warning')}
    ${errors.length > 0 ? '<p class="modal-message wizard-tone-warning">Fix these errors and re-upload the file to import.</p>' : ''}
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="csv-panel-back-btn">Back</button>
      <button type="button" class="btn btn-primary" id="csv-panel-confirm-btn" ${errors.length > 0 || state.importing ? 'disabled' : ''}>
        ${state.importing ? 'Importing...' : 'Confirm Import'}
      </button>
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

function bindListeners(modal, state, ctx) {
  const { api, treeId, onImported, render, close } = ctx;
  const root = modal.root;

  root.querySelector('#csv-panel-close-btn')?.addEventListener('click', close);

  if (state.view === 'upload') {
    root.querySelector('#csv-download-blank-btn')?.addEventListener('click', () => {
      downloadCsv('family-import-template-blank.csv', buildCsvText([]));
    });
    root.querySelector('#csv-download-sample-btn')?.addEventListener('click', () => {
      downloadCsv('family-import-template-sample.csv', buildCsvText(SAMPLE_ROWS));
    });

    const fileInput = root.querySelector('#csv-panel-file-input');
    root.querySelector('.gedcom-dropzone')?.addEventListener('click', (event) => {
      event.preventDefault();
      fileInput.click();
    });
    fileInput?.addEventListener('change', () => {
      state.file = fileInput.files?.[0] || null;
      state.uploadError = '';
      render();
    });

    root.querySelector('#csv-panel-cancel-btn')?.addEventListener('click', close);
    root.querySelector('#csv-panel-validate-btn')?.addEventListener('click', async () => {
      if (!state.file || state.validating) return;
      state.validating = true;
      render();
      try {
        const formData = new FormData();
        formData.append('file', state.file);
        const preview = await api('/api/trees/csv/preview', { method: 'POST', body: formData });
        state.preview = preview;
        state.validating = false;
        state.view = 'reviewing';
        render();
      } catch (error) {
        state.validating = false;
        state.uploadError = error.message || 'Could not parse this file.';
        render();
      }
    });
  }

  if (state.view === 'reviewing') {
    root.querySelector('#csv-panel-back-btn')?.addEventListener('click', () => {
      state.view = 'upload';
      state.preview = null;
      render();
    });
    root.querySelector('#csv-panel-confirm-btn')?.addEventListener('click', async () => {
      if (state.importing || !state.file || !treeId) return;
      state.importing = true;
      render();
      try {
        const formData = new FormData();
        formData.append('file', state.file);
        const result = await api(`/api/trees/${treeId}/import-csv`, { method: 'POST', body: formData });
        close();
        onImported?.(result);
      } catch (error) {
        state.importing = false;
        showToast(error.message || 'Import failed.', { type: 'error' });
        render();
      }
    });
  }
}
