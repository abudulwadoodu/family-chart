// UI layer for the "Export as Image / PDF" flow: format choice + progress
// state. Actual rendering is delegated to ExportService so this file only
// deals with the dialog - it doesn't know how rasterization works.
import { ExportService } from './exportService.js';
import { showModal, showToast } from './ui.js';
import { icon } from './icons.js';
import { slugifyFilename } from './utils.js';

const PROGRESS_LABELS = {
  measuring: 'Measuring tree...',
  rendering: 'Rendering full tree...',
  encoding: 'Preparing file...',
};

/**
 * @param {{ container: HTMLElement, treeName: string }} options
 */
export function openTreeExportDialog({ container, treeName }) {
  const state = { format: 'png' };
  const modal = showModal({ bodyHtml: renderBody(state), className: 'modal-tree-export' });
  bindListeners(modal, state, { container, treeName });
}

function renderBody(state) {
  return `
    <button type="button" class="icon-btn modal-close" id="tree-export-close-btn" aria-label="Close">${icon('close')}</button>
    <h3>Export as Image / PDF</h3>
    <p class="modal-message">Exports the entire tree, not just what's currently visible on screen.</p>
    <div class="wizard-option-group export-format-group" role="radiogroup" aria-label="Export format">
      <label class="export-format-option">
        <input type="radio" name="export-format" value="png" ${state.format === 'png' ? 'checked' : ''} />
        ${icon('image')}
        <span>
          <strong>PNG Image</strong>
          <small>High-resolution image, great for sharing.</small>
        </span>
      </label>
      <label class="export-format-option">
        <input type="radio" name="export-format" value="pdf" ${state.format === 'pdf' ? 'checked' : ''} />
        ${icon('fileText')}
        <span>
          <strong>PDF Document</strong>
          <small>Single page sized to the tree, ready to print.</small>
        </span>
      </label>
    </div>
    <div class="export-progress" id="tree-export-progress" hidden>
      <span class="spinner">${icon('spinner')}</span>
      <span id="tree-export-progress-label">Preparing...</span>
    </div>
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="tree-export-cancel-btn">Cancel</button>
      <button type="button" class="btn btn-primary" id="tree-export-confirm-btn">${icon('download')}<span>Export</span></button>
    </div>
  `;
}

function bindListeners(modal, state, { container, treeName }) {
  const root = modal.root;
  let inFlight = null;

  const close = () => {
    inFlight?.abort();
    modal.close();
  };

  root.querySelector('#tree-export-close-btn').addEventListener('click', close);
  root.querySelector('#tree-export-cancel-btn').addEventListener('click', close);

  root.querySelectorAll('input[name="export-format"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      state.format = event.target.value;
    });
  });

  root.querySelector('#tree-export-confirm-btn').addEventListener('click', async () => {
    const confirmBtn = root.querySelector('#tree-export-confirm-btn');
    const cancelBtn = root.querySelector('#tree-export-cancel-btn');
    const progressEl = root.querySelector('#tree-export-progress');
    const progressLabel = root.querySelector('#tree-export-progress-label');

    confirmBtn.disabled = true;
    root.querySelectorAll('input[name="export-format"]').forEach((input) => (input.disabled = true));
    progressEl.hidden = false;

    inFlight = new AbortController();
    const baseName = slugifyFilename(treeName) || 'family-tree';
    const onProgress = (phase) => {
      progressLabel.textContent = PROGRESS_LABELS[phase] || 'Working...';
    };

    try {
      if (state.format === 'pdf') {
        await ExportService.exportAsPDF({ container, filename: `${baseName}.pdf`, onProgress, signal: inFlight.signal });
      } else {
        await ExportService.exportAsPNG({ container, filename: `${baseName}.png`, onProgress, signal: inFlight.signal });
      }
      showToast('Tree exported successfully.');
      modal.close();
    } catch (error) {
      if (error instanceof ExportService.ExportCancelledError) return;
      showToast(error.message || 'Export failed.', { type: 'error' });
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      root.querySelectorAll('input[name="export-format"]').forEach((input) => (input.disabled = false));
      progressEl.hidden = true;
    }
  });
}
