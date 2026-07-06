// Session-only undo/redo for relationships created via the Relationship
// Manager. Wraps the existing applyRelationship/removeRelationship pair from
// relationshipMutations.js - a command IS the draft object those functions
// already accept, so no separate representation is needed. This is NOT the
// "complete undo history" requirements.md defers to later: it only covers
// relationships applied through this panel, is cleared on tree switch/reload,
// and never touches unrelated edits (e.g. name/date changes made via the f3
// chart editor).
import { applyRelationship, removeRelationship } from '../relationshipMutations.js';

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
  removeRelationship(data, command);
  stack.future.push(command);
  return true;
}

export function redo(stack, data) {
  if (!canRedo(stack)) return false;
  const command = stack.future.pop();
  applyRelationship(data, command);
  stack.past.push(command);
  return true;
}
