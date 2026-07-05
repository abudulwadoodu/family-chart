import { describe, it, expect } from 'vitest';
import { createUndoStack, pushCommand, undo, redo, canUndo, canRedo } from './undoStack.js';

function datum(id, { parents = [], children = [], spouses = [] } = {}) {
  return { id, data: { gender: 'M' }, rels: { parents, children, spouses } };
}

describe('undoStack', () => {
  it('starts empty', () => {
    const stack = createUndoStack();
    expect(canUndo(stack)).toBe(false);
    expect(canRedo(stack)).toBe(false);
  });

  it('undo reverses an applied parent relationship', () => {
    const source = datum('s');
    const target = datum('t');
    const data = [source, target];
    const stack = createUndoStack();

    const command = { sourceId: 's', targetId: 't', type: 'parent' };
    source.rels.parents.push('t');
    target.rels.children.push('s');
    pushCommand(stack, command);

    expect(undo(stack, data)).toBe(true);
    expect(source.rels.parents).not.toContain('t');
    expect(target.rels.children).not.toContain('s');
    expect(canUndo(stack)).toBe(false);
    expect(canRedo(stack)).toBe(true);
  });

  it('redo reapplies the relationship after an undo', () => {
    const source = datum('s');
    const target = datum('t');
    const data = [source, target];
    const stack = createUndoStack();

    const command = { sourceId: 's', targetId: 't', type: 'parent' };
    source.rels.parents.push('t');
    target.rels.children.push('s');
    pushCommand(stack, command);

    undo(stack, data);
    expect(redo(stack, data)).toBe(true);
    expect(source.rels.parents).toContain('t');
    expect(target.rels.children).toContain('s');
  });

  it('pushing a new command clears the redo stack', () => {
    const data = [datum('s'), datum('t'), datum('u')];
    const stack = createUndoStack();
    pushCommand(stack, { sourceId: 's', targetId: 't', type: 'spouse' });
    undo(stack, data);
    expect(canRedo(stack)).toBe(true);

    pushCommand(stack, { sourceId: 's', targetId: 'u', type: 'spouse' });
    expect(canRedo(stack)).toBe(false);
  });

  it('undo/redo on an empty stack return false without throwing', () => {
    const stack = createUndoStack();
    expect(undo(stack, [])).toBe(false);
    expect(redo(stack, [])).toBe(false);
  });
});
