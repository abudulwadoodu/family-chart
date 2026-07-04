// Orchestrates the All Nodes drag-to-connect relationship builder: wires
// allNodesGraph.js's onConnectAttempt callback through validation, the
// relationship dialog, and the data/graph mutation, then leaves
// state.selectedTreeData ready for the existing whole-tree save flow.
// Follows the createXState() convention used by frontend/admin/*/logic.js.
import { validateRelationship } from './relationshipValidator.js';
import { applyRelationship } from './relationshipMutations.js';
import { openRelationshipDialog } from './relationshipDialog.js';
import { showToast } from './ui.js';

export function createRelationshipBuilderState() {
  return {
    draggingId: null,
    hoverTargetId: null,
    pendingDraft: null,
    dialogOpen: false,
    dirty: false,
    lastAppliedAt: null,
  };
}

/**
 * @param {object} state the app's shared mutable state object (frontend/main.js)
 * @param {() => void} onDirtyChange called after dirty/save-related fields change, so main.js can refresh the Save button
 * @param {string} sourceId the node that was dragged
 * @param {string} targetId the node it was dropped onto
 */
export async function handleConnectAttempt(state, onDirtyChange, sourceId, targetId) {
  const rb = state.relationshipBuilder;
  const data = state.selectedTreeData;

  const sourceDatum = data.find((d) => d.id === sourceId);
  const targetDatum = data.find((d) => d.id === targetId);
  if (!sourceDatum || !targetDatum) {
    state.allNodesGraph?.releaseDrag?.(sourceId);
    return;
  }

  rb.dialogOpen = true;
  const validateForType = (type) => validateRelationship(data, sourceId, targetId, type);

  const draft = await openRelationshipDialog(sourceDatum, targetDatum, validateForType);
  rb.dialogOpen = false;

  if (!draft) {
    state.allNodesGraph?.releaseDrag?.(sourceId);
    return;
  }

  applyRelationship(data, draft);
  rb.dirty = true;
  rb.lastAppliedAt = Date.now();

  state.allNodesGraph?.applyNewLink({
    source: sourceId,
    target: targetId,
    type: draft.type === 'child' ? 'parent' : draft.type,
  });

  onDirtyChange?.();
  showToast('Relationship added — remember to save.');
}
