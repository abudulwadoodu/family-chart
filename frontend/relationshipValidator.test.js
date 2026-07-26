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

  it('allows a sibling link to be recorded even when relMeta annotation exists but no shared parent does', () => {
    // Mirrors what an earlier attempt through the old (pre-fix) sibling flow
    // would leave behind: descriptive metadata with no structural link. A
    // user must be able to revisit this pair and complete the shared-parent
    // edge - see builderPanel.js's getSiblingParentContext.
    const e = { ...datum('e'), data: { gender: 'M', relMeta: { f: { type: 'sibling', subtype: 'full' } } } };
    const f = { ...datum('f'), data: { gender: 'M', relMeta: { e: { type: 'sibling', subtype: 'full' } } } };
    const result = validateRelationship([e, f], 'e', 'f', 'sibling');
    expect(result.valid).toBe(true);
  });

  it('rejects a sibling link once the two already share a parent (already visible siblings)', () => {
    const dad = datum('dad', { children: ['e', 'f'] });
    const e = datum('e', { parents: ['dad'] });
    const f = datum('f', { parents: ['dad'] });
    const result = validateRelationship([dad, e, f], 'e', 'f', 'sibling');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/already share a parent/);
  });

  it('allows a sibling link between two people with no parents recorded at all', () => {
    const e = datum('e');
    const f = datum('f');
    const result = validateRelationship([e, f], 'e', 'f', 'sibling');
    expect(result.valid).toBe(true);
  });
});
