// Top-level shell composing the Duplicate Manager's two panels plus the
// undo/redo toolbar. Pure composition - no state of its own. Mirrors
// relationshipManager/components.js's shell pattern.
import { icon } from '../icons.js';
import { renderDuplicateListPanel, getVisibleCandidates } from './duplicateListPanel.js';
import { renderComparePanel } from './comparePanel.js';
import { canUndo, canRedo } from './undoStack.js';

export function renderDuplicateManagerMode(dm, data, { canEdit } = {}) {
  const candidates = getVisibleCandidates(dm, data);
  const selected = candidates.find((c) => c.key === dm.selectedPairKey) || null;

  return `
    <div class="duplicate-manager-shell" id="duplicate-manager-root" tabindex="-1">
      <div class="dm-undo-redo">
        <button type="button" id="dm-undo-btn" class="icon-btn" title="Undo last merge" ${canEdit && canUndo(dm.undoStack) ? '' : 'disabled'}>${icon('undo')}</button>
        <button type="button" id="dm-redo-btn" class="icon-btn" title="Redo merge" ${canEdit && canRedo(dm.undoStack) ? '' : 'disabled'}>${icon('redo')}</button>
      </div>
      <section class="dm-panel dm-panel-left" aria-label="Possible Duplicates">
        ${renderDuplicateListPanel(dm, data, { canEdit })}
      </section>
      <section class="dm-panel dm-panel-right" aria-label="Compare and Merge">
        ${canEdit ? renderComparePanel(dm, data, selected) : '<p class="dm-empty-state">You have view-only access to this tree.</p>'}
      </section>
    </div>
  `;
}
