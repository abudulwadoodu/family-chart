import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { parseGedcom } from './parser.js';
import { validateGedcom } from './validator.js';

const fixturesDir = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'gedcom');
const loadFixture = (name) => readFileSync(join(fixturesDir, name), 'utf8');
const codesOf = (list) => list.map((item) => item.code);

describe('validateGedcom', () => {
  it('passes a well-formed file with no warnings or errors', () => {
    const { records } = parseGedcom(loadFixture('simple-family.ged'));
    const result = validateGedcom(records);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('errors only when there is nothing importable at all', () => {
    const { records } = parseGedcom('0 HEAD\n0 TRLR\n');
    const result = validateGedcom(records);
    expect(codesOf(result.errors)).toContain('NO_RECORDS');
  });

  it('warns, but does not error, on a dangling FAM reference', () => {
    const text = ['0 HEAD', '0 @I1@ INDI', '1 NAME A /A/', '0 @F1@ FAM', '1 HUSB @I1@', '1 CHIL @I99@', '0 TRLR', ''].join('\n');
    const { records } = parseGedcom(text);
    const result = validateGedcom(records);
    expect(result.errors).toEqual([]);
    expect(codesOf(result.warnings)).toContain('BROKEN_REFERENCE');
  });

  it('warns on duplicate identifiers instead of failing', () => {
    const text = ['0 HEAD', '0 @I1@ INDI', '1 NAME A /A/', '0 @I1@ INDI', '1 NAME B /B/', '0 TRLR', ''].join('\n');
    const { records } = parseGedcom(text);
    const result = validateGedcom(records);
    expect(result.errors).toEqual([]);
    expect(codesOf(result.warnings)).toContain('DUPLICATE_XREF');
  });

  it('detects a circular parent/child reference as a warning, not an error', () => {
    const { records } = parseGedcom(loadFixture('circular-reference.ged'));
    const result = validateGedcom(records);
    expect(result.errors).toEqual([]);
    expect(codesOf(result.warnings)).toContain('CIRCULAR_REFERENCE');
  });

  it('flags a GEDCOM version other than 5.5.1 as a warning', () => {
    const text = ['0 HEAD', '1 GEDC', '2 VERS 7.0', '0 @I1@ INDI', '1 NAME A /A/', '0 TRLR', ''].join('\n');
    const { records } = parseGedcom(text);
    const result = validateGedcom(records);
    expect(codesOf(result.warnings)).toContain('UNSUPPORTED_VERSION');
  });

  it('warns when HEAD or TRLR is missing', () => {
    const text = ['0 @I1@ INDI', '1 NAME A /A/', ''].join('\n');
    const { records } = parseGedcom(text);
    const result = validateGedcom(records);
    expect(codesOf(result.warnings)).toEqual(expect.arrayContaining(['MISSING_HEAD', 'MISSING_TRLR']));
  });
});
