import { describe, it, expect } from 'vitest';
import { computeBulkPreview, findInLawWarnings, getCoParentContext, computeCoParentPreview } from './builderPanel.js';

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

describe('getCoParentContext', () => {
  it('surfaces the target parent\'s real spouse when linking children to a parent', () => {
    const dad = datum('dad', { spouses: ['mom'], firstName: 'Abc' });
    const mom = datum('mom', { spouses: ['dad'], firstName: 'Def', lastName: 'Def' });
    const child = datum('sss');
    const data = [dad, mom, child];

    const ctx = getCoParentContext(data, ['sss'], 'dad', 'parent');
    expect(ctx.parentId).toBe('dad');
    expect(ctx.childIds).toEqual(['sss']);
    expect(ctx.spouses.map((s) => s.id)).toEqual(['mom']);
  });

  it('surfaces the single source parent\'s real spouse when linking a parent to a child', () => {
    const dad = datum('dad', { spouses: ['mom'] });
    const mom = datum('mom', { spouses: ['dad'] });
    const child = datum('sss');
    const data = [dad, mom, child];

    const ctx = getCoParentContext(data, ['dad'], 'sss', 'child');
    expect(ctx.parentId).toBe('dad');
    expect(ctx.childIds).toEqual(['sss']);
    expect(ctx.spouses.map((s) => s.id)).toEqual(['mom']);
  });

  it('returns null when the parent has no real spouse', () => {
    const dad = datum('dad');
    const child = datum('sss');
    const ctx = getCoParentContext([dad, child], ['sss'], 'dad', 'parent');
    expect(ctx).toBeNull();
  });

  it('excludes to_add ghost spouses - only a real existing spouse is suggested', () => {
    const dad = datum('dad', { spouses: ['ghost'] });
    const ghost = { ...datum('ghost'), to_add: true };
    const child = datum('sss');
    const ctx = getCoParentContext([dad, ghost, child], ['sss'], 'dad', 'parent');
    expect(ctx).toBeNull();
  });

  it('does not offer a suggestion for bulk child-type links (multiple sources becoming parents)', () => {
    const dad = datum('dad', { spouses: ['mom'] });
    const mom = datum('mom', { spouses: ['dad'] });
    const child = datum('sss');
    const ctx = getCoParentContext([dad, mom, child], ['dad', 'mom'], 'sss', 'child');
    expect(ctx).toBeNull();
  });
});

describe('computeCoParentPreview', () => {
  it('validates each child against the chosen co-parent as a parent link', () => {
    const mom = datum('mom');
    const child = datum('sss');
    const results = computeCoParentPreview([mom, child], ['sss'], 'mom');
    expect(results).toEqual([{ sourceId: 'sss', label: 'sss', valid: true, reason: undefined }]);
  });

  it('returns an empty list when no co-parent was chosen', () => {
    expect(computeCoParentPreview([datum('sss')], ['sss'], null)).toEqual([]);
  });
});
