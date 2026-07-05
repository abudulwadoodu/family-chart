// Session-only undo/redo for merges performed via the Duplicate Manager.
// A separate stack from relationshipManager/undoStack.js (not a shared one)
// because a merge command carries full record snapshots rather than a
// simple {sourceId, targetId, type} draft - the two command shapes aren't
// interchangeable, and requirements.md defers a single unified undo history
// to later.
import { applyMerge, undoMerge } from './duplicateMerge.js';

export function createUndoStack() {
  return { past: [], future: [] };
}

export function pushCommand(stack, command) {
  stack.past.push(command);
  stack.future = [];
}

export function canUndo(stack) {
  return stack.past.length > 0;
}

export function canRedo(stack) {
  return stack.future.length > 0;
}

export function undo(stack, data) {
  if (!canUndo(stack)) return false;
  const command = stack.past.pop();
  undoMerge(data, command);
  stack.future.push(command);
  return true;
}

// Redo re-runs the merge with the same field choices rather than replaying
// the stored command object directly, since applyMerge needs to recompute
// affectedSnapshots against the data array's current (post-undo) state.
export function redo(stack, data) {
  if (!canRedo(stack)) return false;
  const command = stack.future.pop();
  const redone = applyMerge(data, {
    keepId: command.keepId,
    dropId: command.dropId,
    fieldChoices: command.fieldChoices,
  });
  stack.past.push(redone);
  return true;
}
