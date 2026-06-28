import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { parseGedcom } from './parser.js';
import { gedcomToDomain, domainToGedcomRecords } from './mapper.js';

const fixturesDir = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'gedcom');
const loadFixture = (name) => readFileSync(join(fixturesDir, name), 'utf8');

describe('gedcomToDomain', () => {
  it('maps individuals and family relationships into {id, data, rels}', () => {
    const { records } = parseGedcom(loadFixture('simple-family.ged'));
    const { people, summary, warnings } = gedcomToDomain(records, {});

    expect(summary).toEqual({ individuals: 3, families: 1 });
    expect(warnings).toEqual([]);

    const father = people.find((p) => p.data['first name'] === 'John');
    const mother = people.find((p) => p.data['first name'] === 'Jane');
    const child = people.find((p) => p.data['first name'] === 'Chris');

    expect(father.data['last name']).toBe('Doe');
    expect(father.data.gender).toBe('M');
    expect(father.data.birthday).toBe('1 JAN 1950');
    expect(father.data.location).toBe('New York, USA');

    expect(child.rels.parents.sort()).toEqual([father.id, mother.id].sort());
    expect(father.rels.children).toEqual([child.id]);
    expect(mother.rels.children).toEqual([child.id]);
  });

  it('handles multiple marriages without merging the spouses together', () => {
    const { records } = parseGedcom(loadFixture('multiple-marriages.ged'));
    const { people } = gedcomToDomain(records, {});

    const sam = people.find((p) => p.data['first name'] === 'Sam');
    expect(sam.rels.spouses).toHaveLength(2);

    const childOfFirst = people.find((p) => p.data['first name'] === 'Child' && p.data['last name'] === 'OfFirst');
    const childOfSecond = people.find((p) => p.data['first name'] === 'Child' && p.data['last name'] === 'OfSecond');
    expect(childOfFirst.rels.parents).not.toEqual(expect.arrayContaining(childOfSecond.rels.parents));
  });

  it('falls back to gender U and empty dates when missing', () => {
    const { records } = parseGedcom(loadFixture('missing-dates-unknown-gender.ged'));
    const { people } = gedcomToDomain(records, {});

    const noDates = people.find((p) => p.data['first name'] === 'No');
    expect(noDates.data.birthday).toBe('');
    expect(noDates.data.gender).toBe('U');

    const unknownGender = people.find((p) => p.data['first name'] === 'Unknown');
    expect(unknownGender.data.gender).toBe('U');
  });

  it('preserves unsupported tags as custom data and reports a warning', () => {
    const { records } = parseGedcom(loadFixture('unknown-tags.ged'));
    const { people, warnings } = gedcomToDomain(records, {});

    const bob = people[0];
    expect(bob.data.gedcom_custom).toEqual(
      expect.arrayContaining([
        { tag: 'OCCU', value: 'Carpenter' },
        { tag: '_FAVORITE_COLOR', value: 'Blue' },
      ])
    );
    expect(warnings.some((w) => w.code === 'UNSUPPORTED_TAG')).toBe(true);
  });

  it('optionally folds unsupported tags into notes instead of only custom data', () => {
    const { records } = parseGedcom(loadFixture('unknown-tags.ged'));
    const { people } = gedcomToDomain(records, { importUnsupportedAsNotes: true });
    expect(people[0].data.notes).toContain('OCCU: Carpenter');
  });

  it('renames a duplicate xref instead of overwriting the first record', () => {
    const text = ['0 HEAD', '0 @I1@ INDI', '1 NAME A /A/', '0 @I1@ INDI', '1 NAME B /B/', '0 TRLR', ''].join('\n');
    const { records } = parseGedcom(text);
    const { people, warnings } = gedcomToDomain(records, {});

    expect(people).toHaveLength(2);
    expect(people.map((p) => p.data['first name']).sort()).toEqual(['A', 'B']);
    expect(warnings.some((w) => w.code === 'DUPLICATE_XREF_RENAMED')).toBe(true);
  });

  it('does not crash on a circular parent/child reference', () => {
    const { records } = parseGedcom(loadFixture('circular-reference.ged'));
    expect(() => gedcomToDomain(records, {})).not.toThrow();
  });
});

describe('domainToGedcomRecords (export direction)', () => {
  const people = [
    { id: 'p1', data: { 'first name': 'A', 'last name': 'X', gender: 'M' }, rels: { parents: [], children: ['c1'], spouses: ['p2'] } },
    { id: 'p2', data: { 'first name': 'B', 'last name': 'X', gender: 'F', death: '2000' }, rels: { parents: [], children: ['c1'], spouses: ['p1'] } },
    { id: 'c1', data: { 'first name': 'C', 'last name': 'X', gender: 'U' }, rels: { parents: ['p1', 'p2'], children: [], spouses: [] } },
  ];

  it('creates exactly one FAM for a couple that is both spouses and co-parents', () => {
    const { families } = domainToGedcomRecords(people, {});
    expect(families).toHaveLength(1);
    expect(families[0].childXrefs).toHaveLength(1);
  });

  it('filters out deceased individuals when includeDeceased is false', () => {
    const { individuals } = domainToGedcomRecords(people, { includeDeceased: false });
    expect(individuals.map((i) => i.person.id)).not.toContain('p2');
  });

  it('filters out private individuals when includePrivate is false', () => {
    const withPrivate = [...people, { id: 'p3', data: { 'first name': 'Secret', private: true }, rels: { parents: [], children: [], spouses: [] } }];
    const { individuals } = domainToGedcomRecords(withPrivate, { includePrivate: false });
    expect(individuals.map((i) => i.person.id)).not.toContain('p3');
  });
});
