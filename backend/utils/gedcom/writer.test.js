import { describe, it, expect } from 'vitest';

import { writeGedcom } from './writer.js';
import { parseGedcom } from './parser.js';
import { findChild } from './parser.js';

describe('writeGedcom', () => {
  const people = [
    { id: 'p1', data: { 'first name': 'John', 'last name': 'Doe', gender: 'M', birthday: '1950' }, rels: { parents: [], children: [], spouses: [] } },
  ];

  it('produces a valid HEAD/TRLR envelope and @I1@-style identifiers', () => {
    const text = writeGedcom(people, {});
    expect(text).toMatch(/^0 HEAD\n/);
    expect(text.trimEnd()).toMatch(/\n0 TRLR$/);
    expect(text).toContain('0 @I1@ INDI');
  });

  it('round-trips through its own parser without errors', () => {
    const text = writeGedcom(people, {});
    const { records } = parseGedcom(text);
    expect(records.find((r) => r.tag === 'HEAD')).toBeDefined();
    expect(records.find((r) => r.tag === 'TRLR')).toBeDefined();
  });

  it('folds embedded newlines into CONT lines for long notes', () => {
    const withNote = [{ ...people[0], data: { ...people[0].data, notes: 'line one\nline two' } }];
    const text = writeGedcom(withNote, {});
    expect(text).toContain('1 NOTE line one');
    expect(text).toContain('2 CONT line two');
  });

  it('folds an over-length single line into CONC continuation lines', () => {
    const longValue = 'x'.repeat(250);
    const withNote = [{ ...people[0], data: { ...people[0].data, notes: longValue } }];
    const text = writeGedcom(withNote, {});
    expect(text).toContain('2 CONC');
  });

  it('emits HUSB/WIFE/CHIL on the synthesized FAM record', () => {
    const family = [
      { id: 'p1', data: { 'first name': 'A', 'last name': 'X', gender: 'M' }, rels: { parents: [], children: ['c1'], spouses: ['p2'] } },
      { id: 'p2', data: { 'first name': 'B', 'last name': 'X', gender: 'F' }, rels: { parents: [], children: ['c1'], spouses: ['p1'] } },
      { id: 'c1', data: { 'first name': 'C', 'last name': 'X', gender: 'U' }, rels: { parents: ['p1', 'p2'], children: [], spouses: [] } },
    ];
    const text = writeGedcom(family, {});
    const { records } = parseGedcom(text);
    const fam = records.find((r) => r.tag === 'FAM');
    expect(findChild(fam, 'HUSB')).toBeDefined();
    expect(findChild(fam, 'WIFE')).toBeDefined();
    expect(findChild(fam, 'CHIL')).toBeDefined();
  });
});
