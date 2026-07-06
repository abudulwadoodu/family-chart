import { describe, it, expect } from 'vitest';
import { applyRelationship, removeRelationship, inverseType } from './relationshipMutations.js';

function datum(id) {
  return { id, data: { gender: 'M' }, rels: { parents: [], children: [], spouses: [] } };
}

describe('inverseType', () => {
  it('inverts parent/child and leaves spouse/sibling as-is', () => {
    expect(inverseType('parent')).toBe('child');
    expect(inverseType('child')).toBe('parent');
    expect(inverseType('spouse')).toBe('spouse');
    expect(inverseType('sibling')).toBe('sibling');
  });
});

describe('applyRelationship', () => {
  it('adds bidirectional parent/child rels and relMeta', () => {
    const a = datum('a');
    const b = datum('b');
    applyRelationship([a, b], { sourceId: 'a', targetId: 'b', type: 'parent', subtype: 'biological' });

    expect(a.rels.parents).toEqual(['b']);
    expect(b.rels.children).toEqual(['a']);
    expect(a.data.relMeta.b).toEqual({ type: 'parent', subtype: 'biological', marriageDate: undefined, divorceDate: undefined, status: undefined });
    expect(b.data.relMeta.a).toEqual({ type: 'child', subtype: 'biological', marriageDate: undefined, divorceDate: undefined, status: undefined });
  });

  it('adds bidirectional spouse rels symmetrically', () => {
    const a = datum('a');
    const b = datum('b');
    applyRelationship([a, b], { sourceId: 'a', targetId: 'b', type: 'spouse', status: 'current', marriageDate: '2020-01-01' });

    expect(a.rels.spouses).toEqual(['b']);
    expect(b.rels.spouses).toEqual(['a']);
    expect(a.data.relMeta.b.type).toBe('spouse');
    expect(b.data.relMeta.a.type).toBe('spouse');
  });

  it('records sibling relationships as relMeta only, with no rels mutation', () => {
    const a = datum('a');
    const b = datum('b');
    applyRelationship([a, b], { sourceId: 'a', targetId: 'b', type: 'sibling', subtype: 'full' });

    expect(a.rels.parents).toEqual([]);
    expect(a.rels.children).toEqual([]);
    expect(a.rels.spouses).toEqual([]);
    expect(a.data.relMeta.b).toEqual({ type: 'sibling', subtype: 'full' });
    expect(b.data.relMeta.a).toEqual({ type: 'sibling', subtype: 'full' });
  });

  it('is idempotent when applied twice', () => {
    const a = datum('a');
    const b = datum('b');
    applyRelationship([a, b], { sourceId: 'a', targetId: 'b', type: 'parent' });
    applyRelationship([a, b], { sourceId: 'a', targetId: 'b', type: 'parent' });

    expect(a.rels.parents).toEqual(['b']);
    expect(b.rels.children).toEqual(['a']);
  });
});

describe('removeRelationship', () => {
  it('strips both sides of a parent/child link and clears relMeta', () => {
    const a = datum('a');
    const b = datum('b');
    applyRelationship([a, b], { sourceId: 'a', targetId: 'b', type: 'parent' });
    removeRelationship([a, b], { sourceId: 'a', targetId: 'b', type: 'parent' });

    expect(a.rels.parents).toEqual([]);
    expect(b.rels.children).toEqual([]);
    expect(a.data.relMeta.b).toBeUndefined();
    expect(b.data.relMeta.a).toBeUndefined();
  });
});
