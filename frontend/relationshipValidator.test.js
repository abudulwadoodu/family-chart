import { describe, it, expect } from 'vitest';
import { validateRelationship } from './relationshipValidator.js';

function datum(id, { parents = [], children = [], spouses = [] } = {}) {
  return { id, data: { gender: 'M' }, rels: { parents, children, spouses } };
}

// Small fixture: a -> b -> c -> d (a is grandparent of c, great-grandparent of d)
function fixture() {
  const a = datum('a', { children: ['b'] });
  const b = datum('b', { parents: ['a'], children: ['c'] });
  const c = datum('c', { parents: ['b'], children: ['d'] });
  const d = datum('d', { parents: ['c'] });
  return [a, b, c, d];
}

describe('validateRelationship', () => {
  it('rejects a self-relationship', () => {
    const data = fixture();
    const result = validateRelationship(data, 'a', 'a', 'parent');
    expect(result.valid).toBe(false);
  });

  it('rejects a duplicate spouse relationship', () => {
    const spouseA = datum('x', { spouses: ['y'] });
    const spouseB = datum('y', { spouses: ['x'] });
    const result = validateRelationship([spouseA, spouseB], 'x', 'y', 'spouse');
    expect(result.valid).toBe(false);
  });

  it('rejects making a descendant into a parent (ancestry cycle)', () => {
    const data = fixture();
    // d is a's great-grandchild; making d a's parent would create a cycle.
    const result = validateRelationship(data, 'a', 'd', 'parent');
    expect(result.valid).toBe(false);
  });

  it('rejects making an ancestor into a child (ancestry cycle)', () => {
    const data = fixture();
    // a is d's great-grandparent; making a d's child would create a cycle.
    const result = validateRelationship(data, 'd', 'a', 'child');
    expect(result.valid).toBe(false);
  });

  it('allows a valid new parent link between unrelated people', () => {
    const e = datum('e');
    const f = datum('f');
    const result = validateRelationship([e, f], 'e', 'f', 'parent');
    expect(result.valid).toBe(true);
  });

  it('allows a valid new spouse link between unrelated people', () => {
    const e = datum('e');
    const f = datum('f');
    const result = validateRelationship([e, f], 'e', 'f', 'spouse');
    expect(result.valid).toBe(true);
  });
});
