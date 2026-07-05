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
    const byId = new Map([['a', datum('a')]]);
    expect(relationSummary(datum('a'), byId)).toBe('');
  });

  it('names the actual relatives, not just counts', () => {
    const p1 = datum('p1', { firstName: 'John', lastName: 'Smith' });
    const c1 = datum('c1', { firstName: 'Ahmed', lastName: 'Khan' });
    const c2 = datum('c2', { firstName: 'Layla', lastName: 'Khan' });
    const s1 = datum('s1', { firstName: 'Fatima', lastName: 'Khan' });
    const d = datum('a', { parents: ['p1'], children: ['c1', 'c2'], spouses: ['s1'] });
    const byId = new Map([p1, c1, c2, s1, d].map((x) => [x.id, x]));

    expect(relationSummary(d, byId)).toBe('Child of John Smith; Parent of Ahmed Khan, Layla Khan; Spouse of Fatima Khan');
  });

  it('falls back gracefully when a relative id is not found in byId', () => {
    const d = datum('a', { spouses: ['missing'] });
    const byId = new Map([['a', d]]);
    expect(relationSummary(d, byId)).toBe('');
  });
});
