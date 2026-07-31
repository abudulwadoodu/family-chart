// "Sort children" dialog: opened from a person's card "more" menu
// (main.js), lets the tree owner/editor drag that person's children into
// whatever order they belong in - including overriding birthday order, since
// birthdays are often unknown or only approximately known (see
// siblingOrder.js's sortChildren for how the saved order gets applied).
import { showModal, showToast } from './ui.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';
import { getChildrenForSort, applyChildrenOrder } from './siblingOrder.js';

function personLabel(datum) {
  const first = datum.data?.['first name'] || '';
  const last = datum.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || 'Unnamed';
}

function renderRow(datum) {
  const birthday = datum.data?.birthday;
  return `
    <li class="sort-children-row" draggable="true" data-id="${escapeHtml(datum.id)}">
      <span class="sort-children-handle" aria-hidden="true">${icon('gripVertical')}</span>
      <div class="sort-children-info">
        <p class="sort-children-name">${escapeHtml(personLabel(datum))}</p>
        ${birthday ? `<p class="sort-children-meta">${escapeHtml(birthday)}</p>` : ''}
      </div>
    </li>
  `;
}

function renderBody(parentName, children) {
  return `
    <button type="button" class="icon-btn modal-close" id="sort-children-close-btn" aria-label="Close">${icon('close')}</button>
    <h3 id="modal-title">Sort ${escapeHtml(parentName)}'s children</h3>
    <p class="modal-message">Drag to set the order these children appear in on the tree.</p>
    <ul class="sort-children-list" id="sort-children-list">
      ${children.map(renderRow).join('')}
    </ul>
    <div class="modal-actions row">
      <button type="button" class="btn-secondary" id="sort-children-cancel-btn">Cancel</button>
      <button type="button" class="btn btn-primary" id="sort-children-save-btn">Save order</button>
    </div>
  `;
}

// Native HTML5 drag-and-drop (no external library): each row is draggable,
// and dragging it over another row immediately swaps their DOM position
// based on pointer height, giving a live-reorder preview. There's no
// separate `drop` handler because the reorder already happened by the time
// any drop would fire - `dragend` just clears the "dragging" style.
function wireDragAndDrop(list) {
  let draggingRow = null;

  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.sort-children-row');
    if (!row) return;
    draggingRow = row;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    // Firefox won't start a drag without dataTransfer data being set.
    e.dataTransfer.setData('text/plain', row.dataset.id);
  });

  list.addEventListener('dragend', () => {
    draggingRow?.classList.remove('dragging');
    draggingRow = null;
  });

  list.addEventListener('dragover', (e) => {
    if (!draggingRow) return;
    e.preventDefault();
    const row = e.target.closest('.sort-children-row');
    if (!row || row === draggingRow) return;
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    list.insertBefore(draggingRow, before ? row : row.nextSibling);
  });
}

/**
 * @param {{
 *   data: import('../src/types/data').Data,
 *   parentId: string,
 *   onSave?: () => void,
 * }} options
 */
export function openSortChildrenDialog({ data, parentId, onSave }) {
  const parent = data.find((d) => d.id === parentId);
  if (!parent) return;

  const children = getChildrenForSort(data, parentId);
  if (children.length < 2) return;

  const modal = showModal({ bodyHtml: renderBody(personLabel(parent), children), className: 'modal-sort-children' });
  const root = modal.root;

  root.querySelector('#sort-children-close-btn').addEventListener('click', modal.close);
  root.querySelector('#sort-children-cancel-btn').addEventListener('click', modal.close);

  const list = root.querySelector('#sort-children-list');
  wireDragAndDrop(list);

  root.querySelector('#sort-children-save-btn').addEventListener('click', () => {
    const orderedIds = [...list.querySelectorAll('.sort-children-row')].map((row) => row.dataset.id);
    applyChildrenOrder(data, parentId, orderedIds);
    modal.close();
    showToast('Sort order saved — remember to save the tree.');
    onSave?.();
  });
}
