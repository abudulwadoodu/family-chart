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

// me(20, F) -- husband(21, M)
// husband's parents: husbandMom(22, F), husbandDad(23, M)
const inLawFamilyData = [
  { id: '20', data: { gender: 'F' }, rels: { parents: [], spouses: ['21'], children: [] } },
  { id: '21', data: { gender: 'M' }, rels: { parents: ['22', '23'], spouses: ['20'], children: [] } },
  { id: '22', data: { gender: 'F' }, rels: { parents: [], spouses: ['23'], children: ['21'] } },
  { id: '23', data: { gender: 'M' }, rels: { parents: [], spouses: ['22'], children: ['21'] } },
];

describe('getRelationshipPath - in-law chain collapsing', () => {
  it('collapses "husband\'s mother" into "Mother-in-law" with no duplicate phrasing', () => {
    const result = getRelationshipPath('20', '22', inLawFamilyData);
    expect(result.rootToTarget.short).toBe('Mother-in-law');
    expect(result.rootToTarget.chain).toBe('Mother-in-law');
    expect(result.rootToTarget.label).toBe('Mother-in-law');
  });

  it('does not duplicate an in-law relationship in the compound label (aunt by marriage)', () => {
    const result = getRelationshipPath('6', '7', familyData);
    expect(result.rootToTarget.label).toBe('Aunt-in-law');
    expect(result.rootToTarget.label).not.toContain('/');
  });
});

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

describe('getRelationshipPath - visual node chain and category', () => {
  it('returns a node chain starting at root and ending at target, one edge shorter', () => {
    const result = getRelationshipPath('6', '8', familyData);
    expect(result.nodes[0].id).toBe('6');
    expect(result.nodes[result.nodes.length - 1].id).toBe('8');
    expect(result.edges.length).toBe(result.nodes.length - 1);
  });

  it('collapses the visual chain the same way as the text chain (sister/nephew case)', () => {
    const result = getRelationshipPath('12', '15', siblingFamilyData);
    expect(result.nodes.map((n) => n.id)).toEqual(['12', '13', '15']);
    expect(result.edges).toEqual(['Sister', 'Son']);
  });

  it('has a single-node, edge-less chain for Self', () => {
    const result = getRelationshipPath('6', '6', familyData);
    expect(result.nodes).toEqual([expect.objectContaining({ id: '6' })]);
    expect(result.edges).toEqual([]);
  });

  it('categorizes immediate family vs. extended relatives', () => {
    expect(getRelationshipPath('6', '3', familyData).category).toBe('Immediate Family');
    expect(getRelationshipPath('6', '8', familyData).category).toBe('Extended Relative');
    expect(getRelationshipPath('6', '4', familyData).category).toBe('Close Relative');
  });

  it('exposes a plain step chain without the " / Short" suffix', () => {
    const result = getRelationshipPath('12', '15', siblingFamilyData);
    expect(result.rootToTarget.chain).toBe("Sister's son");
    expect(result.rootToTarget.label).toBe("Sister's son / Nephew");
  });
});
