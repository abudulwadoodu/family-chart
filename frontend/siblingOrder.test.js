import { describe, it, expect } from 'vitest';
import { sortChildren, getChildrenForSort, applyChildrenOrder } from './siblingOrder.js';

function datum(id, { birthday, sibling_order, parents = [], children = [] } = {}) {
  return { id, data: { gender: 'M', birthday, sibling_order }, rels: { parents, children, spouses: [] } };
}

describe('sortChildren', () => {
  it('sorts known birthdays chronologically when no manual order is set', () => {
    const a = datum('a', { birthday: '1990-01-01' });
    const b = datum('b', { birthday: '1985-01-01' });
    expect([a, b].sort(sortChildren)).toEqual([b, a]);
  });

  it('sorts unknown/unparseable birthdays after known ones when no manual order is set', () => {
    const known = datum('known', { birthday: '1990-01-01' });
    const unknown = datum('unknown', {});
    const unparseable = datum('unparseable', { birthday: 'not a date' });
    expect([unknown, known].sort(sortChildren)).toEqual([known, unknown]);
    expect([unparseable, known].sort(sortChildren)).toEqual([known, unparseable]);
  });

  it('an explicit manual order always wins, even over a known birthday', () => {
    const older = datum('older', { birthday: '1980-01-01', sibling_order: 1 });
    const younger = datum('younger', { birthday: '1995-01-01', sibling_order: 0 });
    // younger has the earlier manual rank, so it sorts first despite being
    // born later - this is the whole point of manual order overriding
    // birthday.
    expect([older, younger].sort(sortChildren)).toEqual([younger, older]);
  });

  it('ranked siblings sort before unranked ones, which keep array order', () => {
    const ranked = datum('ranked', { sibling_order: 0 });
    const unrankedFirst = datum('unrankedFirst', {});
    const unrankedSecond = datum('unrankedSecond', {});
    expect([unrankedFirst, unrankedSecond, ranked].sort(sortChildren)).toEqual([ranked, unrankedFirst, unrankedSecond]);
  });
});

describe('getChildrenForSort / applyChildrenOrder', () => {
  it('lists a parent’s children in current display order', () => {
    const a = datum('a', { birthday: '1990-01-01' });
    const b = datum('b', { birthday: '1985-01-01' });
    const parent = datum('p', { children: ['a', 'b'] });
    const data = [parent, a, b];
    expect(getChildrenForSort(data, 'p').map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('applies a new manual order that overrides birthday going forward', () => {
    const a = datum('a', { birthday: '1990-01-01' });
    const b = datum('b', { birthday: '1985-01-01' });
    const c = datum('c', {});
    const parent = datum('p', { children: ['a', 'b', 'c'] });
    const data = [parent, a, b, c];

    expect(applyChildrenOrder(data, 'p', ['c', 'a', 'b'])).toBe(true);
    expect(a.data.sibling_order).toBe(1);
    expect(b.data.sibling_order).toBe(2);
    expect(c.data.sibling_order).toBe(0);
    expect(getChildrenForSort(data, 'p').map((d) => d.id)).toEqual(['c', 'a', 'b']);
  });

  it('ignores ids that are not actually children of the given parent', () => {
    const a = datum('a', {});
    const b = datum('b', {});
    const stranger = datum('stranger', {});
    const parent = datum('p', { children: ['a', 'b'] });
    const data = [parent, a, b, stranger];

    applyChildrenOrder(data, 'p', ['stranger', 'b', 'a']);
    expect(stranger.data.sibling_order).toBeUndefined();
    expect(b.data.sibling_order).toBe(0);
    expect(a.data.sibling_order).toBe(1);
  });

  it('is a no-op for fewer than two children', () => {
    const a = datum('a', {});
    const parent = datum('p', { children: ['a'] });
    const data = [parent, a];
    expect(applyChildrenOrder(data, 'p', ['a'])).toBe(false);
    expect(a.data.sibling_order).toBeUndefined();
  });

  it('returns false for an unknown parent id', () => {
    expect(applyChildrenOrder([datum('a', {})], 'missing', ['a'])).toBe(false);
  });
});
