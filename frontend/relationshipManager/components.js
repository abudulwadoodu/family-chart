// Top-level shell composing the three Relationship Manager panels plus the
// undo/redo toolbar. Pure composition - no state of its own.
import { icon } from '../icons.js';
import { renderDisconnectedListPanel } from './disconnectedListPanel.js';
import { renderBuilderPanel } from './builderPanel.js';
import { renderTreeHierarchyPanel } from './treeHierarchyPanel.js';
import { canUndo, canRedo } from './undoStack.js';

export function renderRelationshipManagerMode(rm, data, { canEdit, searchIndex } = {}) {
  return `
    <div class="relationship-manager-shell" id="relationship-manager-root" tabindex="-1">
      <div class="rm-undo-redo">
        <button type="button" id="rm-undo-btn" class="icon-btn" title="Undo (Ctrl+Z)" ${canEdit && canUndo(rm.undoStack) ? '' : 'disabled'}>${icon('undo')}</button>
        <button type="button" id="rm-redo-btn" class="icon-btn" title="Redo (Ctrl+Y)" ${canEdit && canRedo(rm.undoStack) ? '' : 'disabled'}>${icon('redo')}</button>
      </div>
      <section class="rm-panel rm-panel-left" aria-label="Needs Connection">
        ${renderDisconnectedListPanel(rm, data, searchIndex)}
      </section>
      <section class="rm-panel rm-panel-middle" aria-label="Relationship Builder">
        ${canEdit ? renderBuilderPanel(rm, data) : '<p class="rm-empty-state">You have view-only access to this tree.</p>'}
      </section>
      <section class="rm-panel rm-panel-right" aria-label="Existing Family Tree">
        ${renderTreeHierarchyPanel(rm, data)}
      </section>
    </div>
  `;
}
