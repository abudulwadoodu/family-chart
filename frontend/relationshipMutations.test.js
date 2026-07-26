import { describe, it, expect } from 'vitest';
import { applyRelationship, removeRelationship, removeAllRelations, deleteNode, inverseType, createPerson } from './relationshipMutations.js';

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

describe('removeAllRelations', () => {
  it('detaches a person from every parent, spouse, and child, leaving relatives intact otherwise', () => {
    const parent = datum('parent');
    const spouse = datum('spouse');
    const child = datum('child');
    const person = datum('person');

    applyRelationship([parent, person], { sourceId: 'person', targetId: 'parent', type: 'parent' });
    applyRelationship([spouse, person], { sourceId: 'person', targetId: 'spouse', type: 'spouse' });
    applyRelationship([child, person], { sourceId: 'person', targetId: 'child', type: 'child' });

    removeAllRelations([parent, spouse, child, person], 'person');

    expect(person.rels.parents).toEqual([]);
    expect(person.rels.spouses).toEqual([]);
    expect(person.rels.children).toEqual([]);
    expect(parent.rels.children).toEqual([]);
    expect(spouse.rels.spouses).toEqual([]);
    expect(child.rels.parents).toEqual([]);
  });

  it('is a no-op for a person with no relations', () => {
    const person = datum('person');
    expect(() => removeAllRelations([person], 'person')).not.toThrow();
  });
});

describe('createPerson', () => {
  it('pushes a new person with a unique id and empty rels into the data array', () => {
    const a = datum('a');
    const data = [a];
    const created = createPerson(data, { firstName: 'Imran', lastName: 'Khan', gender: 'M' });

    expect(data).toContain(created);
    expect(created.id).toBeTruthy();
    expect(created.id).not.toBe('a');
    expect(created.data).toEqual({ gender: 'M', 'first name': 'Imran', 'last name': 'Khan' });
    expect(created.rels).toEqual({ parents: [], children: [], spouses: [] });
  });

  it('can then be linked as a parent via applyRelationship', () => {
    const child = datum('child');
    const data = [child];
    const parent = createPerson(data, { firstName: 'New', gender: 'F' });
    applyRelationship(data, { sourceId: 'child', targetId: parent.id, type: 'parent' });

    expect(child.rels.parents).toEqual([parent.id]);
    expect(parent.rels.children).toEqual(['child']);
  });
});

describe('deleteNode', () => {
  it('removes the person from the data array and strips them from relatives', () => {
    const parent = datum('parent');
    const child = datum('child');
    applyRelationship([parent, child], { sourceId: 'child', targetId: 'parent', type: 'parent' });

    const data = [parent, child];
    deleteNode(data, 'child');

    expect(data).toEqual([parent]);
    expect(parent.rels.children).toEqual([]);
  });
});
