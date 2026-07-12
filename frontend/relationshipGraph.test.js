import { describe, it, expect } from 'vitest';
import { getRelationshipPath } from './relationshipGraph.js';

// Same fixture as backend/utils/findRelationship.test.js - this module
// mirrors that traversal logic client-side (see relationshipGraph.js header
// comment for why it isn't just imported across the frontend/backend split).
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

describe('getRelationshipPath', () => {
  it('returns Self for the same person', () => {
    const result = getRelationshipPath('6', '6', familyData);
    expect(result.rootToTarget.short).toBe('Self');
  });

  it('resolves direct parent/child', () => {
    const result = getRelationshipPath('6', '3', familyData);
    expect(result.rootToTarget.short).toBe('Mother');
    expect(result.targetToRoot.short).toBe('Son');
  });

  it('resolves uncle/nephew', () => {
    const result = getRelationshipPath('6', '4', familyData);
    expect(result.rootToTarget.short).toBe('Uncle');
    expect(result.targetToRoot.short).toBe('Nephew');
  });

  it('resolves 1st cousins symmetrically', () => {
    const result = getRelationshipPath('6', '8', familyData);
    expect(result.rootToTarget.short).toBe('1st cousin');
    expect(result.targetToRoot.short).toBe('1st cousin');
  });

  it('returns found: false for an unknown id', () => {
    const result = getRelationshipPath('6', '999', familyData);
    expect(result.found).toBe(false);
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

describe('getRelationshipPath - chain reduction', () => {
  it('collapses "Father\'s daughter\'s son" into "Sister\'s son / Nephew"', () => {
    const result = getRelationshipPath('12', '15', siblingFamilyData);
    expect(result.rootToTarget.short).toBe('Nephew');
    expect(result.rootToTarget.label).toBe("Sister's son / Nephew");
  });

  it('collapses "Father\'s father" into "Grandfather" alone (no raw chain shown)', () => {
    const result = getRelationshipPath('6', '1', familyData);
    expect(result.rootToTarget.short).toBe('Grandfather');
    expect(result.rootToTarget.label).toBe('Grandfather');
  });

  it('does not mislabel the root\'s own sibling relationship (direct sister, not a nested collapse)', () => {
    const result = getRelationshipPath('12', '13', siblingFamilyData);
    expect(result.rootToTarget.short).toBe('Sister');
    expect(result.rootToTarget.label).toBe('Sister');
  });
});
