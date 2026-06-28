import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { parseGedcom, findChild, findChildren, childValue } from './parser.js';

const fixturesDir = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'gedcom');
const loadFixture = (name) => readFileSync(join(fixturesDir, name), 'utf8');

describe('parseGedcom', () => {
  it('throws on an empty file', () => {
    expect(() => parseGedcom('')).toThrow('GEDCOM file is empty');
    expect(() => parseGedcom('   ')).toThrow('GEDCOM file is empty');
  });

  it('throws on malformed input with no level numbers', () => {
    expect(() => parseGedcom(loadFixture('invalid.ged'))).toThrow(/not valid GEDCOM/);
  });

  it('parses a simple family into normalized records', () => {
    const { records } = parseGedcom(loadFixture('simple-family.ged'));

    expect(records.map((r) => r.tag)).toEqual(['HEAD', 'INDI', 'INDI', 'INDI', 'FAM', 'TRLR']);

    const husband = records.find((r) => r.tag === 'INDI' && r.xrefId === 'I1');
    expect(childValue(husband, 'NAME')).toBe('John /Doe/');
    expect(childValue(husband, 'SEX')).toBe('M');

    const fam = records.find((r) => r.tag === 'FAM');
    expect(fam.xrefId).toBe('F1');
    expect(findChild(fam, 'HUSB').pointer).toBe('I1');
    expect(findChild(fam, 'WIFE').pointer).toBe('I2');
    expect(findChildren(fam, 'CHIL').map((c) => c.pointer)).toEqual(['I3']);
  });

  it('marks nonstandard tags as custom and leaves standard-but-unmapped tags alone', () => {
    const { records } = parseGedcom(loadFixture('unknown-tags.ged'));
    const indi = records.find((r) => r.tag === 'INDI');

    const custom = findChild(indi, '_FAVORITE_COLOR');
    expect(custom.customTag).toBe(true);
    expect(custom.value).toBe('Blue');

    const occu = findChild(indi, 'OCCU');
    expect(occu.customTag).toBe(false);
    expect(occu.value).toBe('Carpenter');
  });

  it('strips @...@ delimiters from xref ids and pointers', () => {
    const { records } = parseGedcom(loadFixture('simple-family.ged'));
    const fam = records.find((r) => r.tag === 'FAM');
    expect(fam.xrefId).not.toMatch(/@/);
    expect(findChild(fam, 'HUSB').pointer).not.toMatch(/@/);
  });
});
