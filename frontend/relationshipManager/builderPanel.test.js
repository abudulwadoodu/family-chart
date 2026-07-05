import { describe, it, expect } from 'vitest';
import { computeBulkPreview, findInLawWarnings } from './builderPanel.js';

function datum(id, { parents = [], children = [], spouses = [], firstName = id, lastName = '' } = {}) {
  return { id, data: { gender: 'M', 'first name': firstName, 'last name': lastName }, rels: { parents, children, spouses } };
}

describe('computeBulkPreview', () => {
  it('marks each source valid/invalid independently against the same target', () => {
    const target = datum('target');
    const alreadyChild = datum('dup', { parents: ['target'] });
    target.rels.children.push('dup');
    const clean1 = datum('clean1');
    const clean2 = datum('clean2');

    const data = [target, alreadyChild, clean1, clean2];
    const results = computeBulkPreview(data, ['dup', 'clean1', 'clean2'], 'target', 'parent');

    expect(results.find((r) => r.sourceId === 'dup').valid).toBe(false);
    expect(results.find((r) => r.sourceId === 'clean1').valid).toBe(true);
    expect(results.find((r) => r.sourceId === 'clean2').valid).toBe(true);
  });

  it('includes a human-readable label per source', () => {
    const target = datum('target');
    const source = datum('s1', { firstName: 'Ahmed', lastName: 'Khan' });
    const results = computeBulkPreview([target, source], ['s1'], 'target', 'parent');
    expect(results[0].label).toBe('Ahmed Khan');
  });

  it('surfaces the validator reason string for invalid rows', () => {
    const a = datum('a');
    const results = computeBulkPreview([a], ['a'], 'a', 'parent');
    expect(results[0].valid).toBe(false);
    expect(results[0].reason).toMatch(/themselves/);
  });
});

describe('findInLawWarnings', () => {
  it('flags a married couple both selected as sources for a parent/child link', () => {
    const husband = datum('h', { spouses: ['w'] });
    const wife = datum('w', { spouses: ['h'] });
    const data = [husband, wife];
    const warnings = findInLawWarnings(data, ['h', 'w'], 'child');
    expect(warnings).toEqual([{ aId: 'h', bId: 'w' }]);
  });

  it('does not flag a single selected source with a spouse outside the selection', () => {
    const husband = datum('h', { spouses: ['w'] });
    const wife = datum('w', { spouses: ['h'] });
    const data = [husband, wife];
    const warnings = findInLawWarnings(data, ['h'], 'child');
    expect(warnings).toEqual([]);
  });

  it('does not flag unmarried selected sources', () => {
    const a = datum('a');
    const b = datum('b');
    const warnings = findInLawWarnings([a, b], ['a', 'b'], 'child');
    expect(warnings).toEqual([]);
  });

  it('only applies to parent/child types, not spouse or sibling', () => {
    const husband = datum('h', { spouses: ['w'] });
    const wife = datum('w', { spouses: ['h'] });
    const data = [husband, wife];
    expect(findInLawWarnings(data, ['h', 'w'], 'spouse')).toEqual([]);
    expect(findInLawWarnings(data, ['h', 'w'], 'sibling')).toEqual([]);
  });
});
