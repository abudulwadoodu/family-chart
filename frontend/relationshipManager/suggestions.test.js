import { describe, it, expect } from 'vitest';
import { suggestMatches } from './suggestions.js';

function datum(id, { parents = [], children = [], spouses = [], firstName = id, lastName = '', birthday } = {}) {
  return { id, data: { gender: 'M', 'first name': firstName, 'last name': lastName, birthday }, rels: { parents, children, spouses } };
}

describe('suggestMatches', () => {
  it('boosts same-surname candidates', () => {
    const candidate = datum('a', { lastName: 'Khan' });
    const sameSurname = datum('b', { lastName: 'Khan' });
    const different = datum('c', { lastName: 'Smith' });

    const results = suggestMatches(candidate, [candidate, sameSurname, different]);
    const bResult = results.find((r) => r.id === 'b');
    expect(bResult.reasons).toContain('Same surname');
  });

  it('boosts similar birth years', () => {
    const candidate = datum('a', { birthday: '1990-01-01' });
    const close = datum('b', { birthday: '1991-01-01' });
    const far = datum('c', { birthday: '1930-01-01' });

    const results = suggestMatches(candidate, [candidate, close, far]);
    expect(results.find((r) => r.id === 'b')?.reasons).toContain('Similar birth year');
  });

  it('flags candidates missing parents as plausible parent targets', () => {
    const candidate = datum('a');
    const noParents = datum('b');
    const results = suggestMatches(candidate, [candidate, noParents]);
    expect(results.find((r) => r.id === 'b')?.reasons).toContain('Missing parents');
  });

  it('notes existing spouses as a caution reason without excluding the candidate', () => {
    const candidate = datum('a', { lastName: 'Khan' });
    const married = datum('b', { lastName: 'Khan', spouses: ['x'] });
    const results = suggestMatches(candidate, [candidate, married]);
    const entry = results.find((r) => r.id === 'b');
    expect(entry.reasons).toContain('Existing spouse');
  });

  it('excludes the candidate itself and ranks by score descending', () => {
    const candidate = datum('a', { lastName: 'Khan', birthday: '1990-01-01' });
    const strong = datum('b', { lastName: 'Khan', birthday: '1991-01-01' });
    const weak = datum('c', { lastName: 'Khan' });
    const results = suggestMatches(candidate, [candidate, strong, weak]);
    expect(results.map((r) => r.id)).not.toContain('a');
    expect(results[0].id).toBe('b');
  });

  it('respects the limit option', () => {
    const candidate = datum('a', { lastName: 'Khan' });
    const many = Array.from({ length: 10 }, (_, i) => datum(`m${i}`, { lastName: 'Khan' }));
    const results = suggestMatches(candidate, [candidate, ...many], { limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('falls back to the raw id as the label when a member has no first/last name set', () => {
    const candidate = datum('a', { birthday: '1990-01-01' });
    const nameless = { id: 'x', data: { gender: 'M', birthday: '1991-01-01' }, rels: { parents: [], children: [], spouses: [] } };
    const results = suggestMatches(candidate, [candidate, nameless]);
    expect(results.find((r) => r.id === 'x')?.label).toBe('x');
  });
});
