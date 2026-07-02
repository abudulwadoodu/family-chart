import { describe, it, expect } from 'vitest';
import { validateJsonPeople } from './validator.js';

function person(id, overrides = {}) {
  return { id, data: { 'first name': id }, rels: { parents: [], children: [], spouses: [] }, ...overrides };
}

describe('validateJsonPeople', () => {
  it('accepts a valid list with no errors or warnings', () => {
    const people = [person('p1', { rels: { parents: [], children: [], spouses: ['p2'] } }), person('p2', { rels: { parents: [], children: [], spouses: ['p1'] } })];
    const { errors, warnings } = validateJsonPeople(people);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('errors on an empty array', () => {
    const { errors } = validateJsonPeople([]);
    expect(errors[0].code).toBe('EMPTY_IMPORT');
  });

  it('errors on a missing id, excluding that entry only', () => {
    const people = [{ data: {}, rels: {} }, person('p1')];
    const { errors, cleanedPeople } = validateJsonPeople(people);
    expect(errors.some((e) => e.code === 'MISSING_ID')).toBe(true);
    expect(cleanedPeople).toHaveLength(1);
  });

  it('errors on a duplicate id, first occurrence wins', () => {
    const people = [person('p1'), person('p1')];
    const { errors, cleanedPeople } = validateJsonPeople(people);
    expect(errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true);
    expect(cleanedPeople).toHaveLength(1);
  });

  it('warns and drops unknown parent/spouse/child references', () => {
    const people = [person('p1', { rels: { parents: ['ghost'], children: ['ghost2'], spouses: ['ghost3'] } })];
    const { errors, warnings, cleanedPeople } = validateJsonPeople(people);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.code === 'UNKNOWN_PARENT_ID')).toBe(true);
    expect(warnings.some((w) => w.code === 'UNKNOWN_CHILD_ID')).toBe(true);
    expect(warnings.some((w) => w.code === 'UNKNOWN_SPOUSE_ID')).toBe(true);
    expect(cleanedPeople[0].rels).toEqual({ parents: [], children: [], spouses: [] });
  });

  it('warns on duplicate spouse references', () => {
    const people = [person('p1', { rels: { parents: [], children: [], spouses: ['p2', 'p2'] } }), person('p2')];
    const { warnings, cleanedPeople } = validateJsonPeople(people);
    expect(warnings.some((w) => w.code === 'DUPLICATE_SPOUSE_REFERENCE')).toBe(true);
    expect(cleanedPeople[0].rels.spouses).toEqual(['p2']);
  });

  it('warns on more than 2 parents', () => {
    const people = [person('p1', { rels: { parents: ['a', 'b', 'c'], children: [], spouses: [] } }), person('a'), person('b'), person('c')];
    const { warnings } = validateJsonPeople(people);
    expect(warnings.some((w) => w.code === 'TOO_MANY_PARENTS')).toBe(true);
  });

  it('warns on circular parent relationships', () => {
    const people = [person('p1', { rels: { parents: ['p2'], children: [], spouses: [] } }), person('p2', { rels: { parents: ['p1'], children: [], spouses: [] } })];
    const { warnings } = validateJsonPeople(people);
    expect(warnings.some((w) => w.code === 'CIRCULAR_REFERENCE')).toBe(true);
  });
});
