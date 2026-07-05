import { describe, it, expect } from 'vitest';
import { getDisconnectedMembers, sortDisconnected, relationSummary } from './disconnectedMembers.js';

function datum(id, { parents = [], children = [], spouses = [], firstName = id, lastName = '', birthday } = {}) {
  return { id, data: { gender: 'M', 'first name': firstName, 'last name': lastName, birthday }, rels: { parents, children, spouses } };
}

describe('getDisconnectedMembers', () => {
  it('returns only members with zero parents, children, and spouses', () => {
    const isolated = datum('a');
    const hasParent = datum('b', { parents: ['a'] });
    const hasSpouse = datum('c', { spouses: ['d'] });
    const alsoIsolated = datum('e');

    const result = getDisconnectedMembers([isolated, hasParent, hasSpouse, alsoIsolated]);
    expect(result.map((d) => d.id).sort()).toEqual(['a', 'e']);
  });

  it('returns an empty array when everyone is connected', () => {
    const a = datum('a', { children: ['b'] });
    const b = datum('b', { parents: ['a'] });
    expect(getDisconnectedMembers([a, b])).toEqual([]);
  });
});

describe('sortDisconnected', () => {
  it('sorts by name alphabetically', () => {
    const list = [datum('a', { firstName: 'Zoe' }), datum('b', { firstName: 'Amir' })];
    const sorted = sortDisconnected(list, 'name');
    expect(sorted.map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('sorts by birth year, undated members last', () => {
    const list = [datum('a', { birthday: '1990-01-01' }), datum('b', { birthday: '1950-01-01' }), datum('c', {})];
    const sorted = sortDisconnected(list, 'birthYear');
    expect(sorted.map((d) => d.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by recent-selection order, unselected members last', () => {
    const list = [datum('a'), datum('b'), datum('c')];
    const sorted = sortDisconnected(list, 'recent', ['c', 'a']);
    expect(sorted.map((d) => d.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not throw when a member has no first/last name set', () => {
    const nameless = { id: 'x', data: { gender: 'M' }, rels: { parents: [], children: [], spouses: [] } };
    const named = datum('a', { firstName: 'Amir' });
    expect(() => sortDisconnected([nameless, named], 'name')).not.toThrow();
  });
});

describe('relationSummary', () => {
  it('returns an empty string for a fully disconnected member', () => {
    expect(relationSummary(datum('a'))).toBe('');
  });

  it('summarizes parents, children, and spouses with correct pluralization', () => {
    const d = datum('a', { parents: ['p1'], children: ['c1', 'c2'], spouses: ['s1'] });
    expect(relationSummary(d)).toBe('1 parent, 2 children, 1 spouse');
  });

  it('pluralizes multiple parents and spouses', () => {
    const d = datum('a', { parents: ['p1', 'p2'], spouses: ['s1', 's2'] });
    expect(relationSummary(d)).toBe('2 parents, 2 spouses');
  });
});
