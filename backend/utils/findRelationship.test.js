import { describe, it, expect } from 'vitest';
import { findRelationship } from './findRelationship.js';

// grandpa(1) -- grandma(2)
//   -> mom(3, F), uncle(4, M)
// dad(5) -- mom(3)
//   -> me(6, M)
// uncle(4) -- auntSpouse(7, F)
//   -> cousin(8, F)
const familyData = [
  { id: '1', data: { gender: 'M' }, rels: { parents: [], spouses: ['2'], children: ['3', '4'] } },
  { id: '2', data: { gender: 'F' }, rels: { parents: [], spouses: ['1'], children: ['3', '4'] } },
  { id: '3', data: { gender: 'F' }, rels: { parents: ['1', '2'], spouses: ['5'], children: ['6'] } },
  { id: '4', data: { gender: 'M' }, rels: { parents: ['1', '2'], spouses: ['7'], children: ['8'] } },
  { id: '5', data: { gender: 'M' }, rels: { parents: [], spouses: ['3'], children: ['6'] } },
  { id: '6', data: { gender: 'M' }, rels: { parents: ['3', '5'], spouses: [], children: [] } },
  { id: '7', data: { gender: 'F' }, rels: { parents: [], spouses: ['4'], children: ['8'] } },
  { id: '8', data: { gender: 'F' }, rels: { parents: ['4', '7'], spouses: [], children: [] } },
];

describe('findRelationship', () => {
  it('returns Self for the same person', () => {
    const result = findRelationship('6', '6', familyData);
    expect(result.found).toBe(true);
    expect(result.distance).toBe(0);
    expect(result.rootToTarget.short).toBe('Self');
  });

  it('resolves direct parent/child', () => {
    const result = findRelationship('6', '3', familyData);
    expect(result.rootToTarget.short).toBe('Mother');
    expect(result.targetToRoot.short).toBe('Son');
    expect(result.distance).toBe(1);
  });

  it('resolves grandparent/grandchild', () => {
    const result = findRelationship('6', '2', familyData);
    expect(result.rootToTarget.short).toBe('Grandmother');
    expect(result.targetToRoot.short).toBe('Grandson');
    expect(result.distance).toBe(2);
  });

  it('resolves uncle/nephew', () => {
    const result = findRelationship('6', '4', familyData);
    expect(result.rootToTarget.short).toBe('Uncle');
    expect(result.targetToRoot.short).toBe('Nephew');
  });

  it('resolves 1st cousins symmetrically', () => {
    const result = findRelationship('6', '8', familyData);
    expect(result.rootToTarget.short).toBe('1st cousin');
    expect(result.targetToRoot.short).toBe('1st cousin');
  });

  it('resolves an in-law relationship (aunt by marriage)', () => {
    const result = findRelationship('6', '7', familyData);
    expect(result.rootToTarget.short).toBe('Aunt-in-law');
    expect(result.targetToRoot.short).toBe('Nephew-in-law');
  });

  it('returns found: false for an unknown id', () => {
    const result = findRelationship('6', '999', familyData);
    expect(result.found).toBe(false);
    expect(result.distance).toBe(-1);
  });

  it('returns found: false when no path connects two people', () => {
    const isolated = [...familyData, { id: '99', data: { gender: 'F' }, rels: { parents: [], spouses: [], children: [] } }];
    const result = findRelationship('6', '99', isolated);
    expect(result.found).toBe(false);
  });

  it('builds a plain-language chain alongside the short label', () => {
    const result = findRelationship('6', '4', familyData);
    expect(result.rootToTarget.label).toMatch(/Uncle/);
    expect(result.rootToTarget.label).toContain('/');
  });
});

// dad(10, M) -- mom(11, F)
//   -> me(12, M), sister(13, F)
// sister(13) -- brotherInLaw(14, M)
//   -> nephew(15, M)
const siblingFamilyData = [
  { id: '10', data: { gender: 'M' }, rels: { parents: [], spouses: ['11'], children: ['12', '13'] } },
  { id: '11', data: { gender: 'F' }, rels: { parents: [], spouses: ['10'], children: ['12', '13'] } },
  { id: '12', data: { gender: 'M' }, rels: { parents: ['10', '11'], spouses: [], children: [] } },
  { id: '13', data: { gender: 'F' }, rels: { parents: ['10', '11'], spouses: ['14'], children: ['15'] } },
  { id: '14', data: { gender: 'M' }, rels: { parents: [], spouses: ['13'], children: ['15'] } },
  { id: '15', data: { gender: 'M' }, rels: { parents: ['13', '14'], spouses: [], children: [] } },
];

describe('findRelationship - chain reduction', () => {
  it('collapses "Father\'s daughter\'s son" into "Sister\'s son / Nephew"', () => {
    const result = findRelationship('12', '15', siblingFamilyData);
    expect(result.rootToTarget.short).toBe('Nephew');
    expect(result.rootToTarget.label).toBe("Sister's son / Nephew");
  });

  it('collapses "Father\'s father" into "Grandfather" alone (no raw chain shown)', () => {
    // Reuse the original fixture: 6 -> 3 (mom) -> 1 (grandpa)
    const result = findRelationship('6', '1', familyData);
    expect(result.rootToTarget.short).toBe('Grandfather');
    expect(result.rootToTarget.label).toBe('Grandfather');
  });

  it('does not mislabel the root\'s own sibling relationship (direct sister, not a nested collapse)', () => {
    const result = findRelationship('12', '13', siblingFamilyData);
    expect(result.rootToTarget.short).toBe('Sister');
    expect(result.rootToTarget.label).toBe('Sister');
  });
});
