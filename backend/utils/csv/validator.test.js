import { describe, it, expect } from 'vitest';
import { parseCsvText } from './parser.js';
import { buildRawRows } from './mapper.js';
import { validateCsvRows } from './validator.js';

function rowsFor(csvText) {
  return buildRawRows(parseCsvText(csvText));
}

const HEADER = 'id,first_name,last_name,gender,birth_date,death_date,is_living,email,father_id,mother_id,spouse_ids,child_ids';

describe('validateCsvRows', () => {
  it('accepts a fully valid file with no errors or warnings', () => {
    const csv = [
      HEADER,
      'p1,John,Doe,M,1950-01-01,,TRUE,john@example.com,,,p2,',
      'p2,Jane,Doe,F,1952-01-01,,TRUE,,,,p1,',
    ].join('\n');
    const { errors, warnings } = validateCsvRows(rowsFor(csv));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('errors on missing id', () => {
    const csv = [HEADER, ',John,Doe,M,,,,,,,,'].join('\n');
    const { errors } = validateCsvRows(rowsFor(csv));
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('MISSING_ID');
    expect(errors[0].row).toBe(2);
  });

  it('errors on missing first_name', () => {
    const csv = [HEADER, 'p1,,Doe,M,,,,,,,,'].join('\n');
    const { errors } = validateCsvRows(rowsFor(csv));
    expect(errors[0].code).toBe('MISSING_FIRST_NAME');
  });

  it('errors on duplicate id, keeping the first occurrence', () => {
    const csv = [HEADER, 'p1,John,Doe,M,,,,,,,,', 'p1,Johnny,Doe,M,,,,,,,,'].join('\n');
    const { errors } = validateCsvRows(rowsFor(csv));
    expect(errors.some((e) => e.code === 'DUPLICATE_ID' && e.row === 3)).toBe(true);
  });

  it('warns and drops unknown father_id/mother_id but keeps the row', () => {
    const csv = [HEADER, 'p1,John,Doe,M,,,,,ghost,ghost2,,'].join('\n');
    const { errors, warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.code === 'UNKNOWN_FATHER_ID')).toBe(true);
    expect(warnings.some((w) => w.code === 'UNKNOWN_MOTHER_ID')).toBe(true);
    expect(cleanedRows[0].father_id).toBe('');
    expect(cleanedRows[0].mother_id).toBe('');
  });

  it('warns and drops unknown spouse ids while keeping known ones', () => {
    const csv = [HEADER, 'p1,John,Doe,M,,,,,,,p2;ghost,', 'p2,Jane,Doe,F,,,,,,,,'].join('\n');
    const { warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(warnings.some((w) => w.code === 'UNKNOWN_SPOUSE_ID')).toBe(true);
    expect(cleanedRows[0].spouse_ids).toEqual(['p2']);
  });

  it('warns on duplicate spouse references and de-duplicates', () => {
    const csv = [HEADER, 'p1,John,Doe,M,,,,,,,p2;p2,', 'p2,Jane,Doe,F,,,,,,,,'].join('\n');
    const { warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(warnings.some((w) => w.code === 'DUPLICATE_SPOUSE_REFERENCE')).toBe(true);
    expect(cleanedRows[0].spouse_ids).toEqual(['p2']);
  });

  it('warns on circular parent relationships but keeps all links', () => {
    const csv = [HEADER, 'p1,John,Doe,M,,,,,p2,,,', 'p2,Jane,Doe,F,,,,,p1,,,'].join('\n');
    const { warnings } = validateCsvRows(rowsFor(csv));
    expect(warnings.some((w) => w.code === 'CIRCULAR_REFERENCE')).toBe(true);
  });

  it('accepts ISO dates as-is', () => {
    const csv = [HEADER, 'p1,John,Doe,M,1950-01-01,,,,,,,'].join('\n');
    const { warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(warnings).toEqual([]);
    expect(cleanedRows[0].birth_date).toBe('1950-01-01');
  });

  it('converts an unambiguous non-ISO date and warns', () => {
    const csv = [HEADER, 'p1,John,Doe,M,01/15/1950,,,,,,,'].join('\n');
    const { warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(warnings.some((w) => w.code === 'AMBIGUOUS_DATE_CONVERTED')).toBe(true);
    expect(cleanedRows[0].birth_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('warns and blanks a fully invalid date', () => {
    const csv = [HEADER, 'p1,John,Doe,M,not-a-date,,,,,,,'].join('\n');
    const { warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(warnings.some((w) => w.code === 'INVALID_DATE')).toBe(true);
    expect(cleanedRows[0].birth_date).toBe('');
  });

  it('warns and defaults an invalid gender to Unknown', () => {
    const csv = [HEADER, 'p1,John,Doe,Alien,,,,,,,,'].join('\n');
    const { warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(warnings.some((w) => w.code === 'INVALID_GENDER')).toBe(true);
    expect(cleanedRows[0].gender).toBe('U');
  });

  it('accepts gender aliases like Male/Female', () => {
    const csv = [HEADER, 'p1,John,Doe,Male,,,,,,,,'].join('\n');
    const { warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(warnings).toEqual([]);
    expect(cleanedRows[0].gender).toBe('M');
  });

  it('warns and blanks an invalid email', () => {
    const csv = [HEADER, 'p1,John,Doe,M,,,,not-an-email,,,,'].join('\n');
    const { warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(warnings.some((w) => w.code === 'INVALID_EMAIL')).toBe(true);
    expect(cleanedRows[0].email).toBe('');
  });

  it('warns and ignores an invalid is_living value', () => {
    const csv = [HEADER, 'p1,John,Doe,M,,,maybe,,,,,'].join('\n');
    const { warnings, cleanedRows } = validateCsvRows(rowsFor(csv));
    expect(warnings.some((w) => w.code === 'INVALID_IS_LIVING')).toBe(true);
    expect(cleanedRows[0].isLiving).toBeUndefined();
  });

  it('warns when a person ends up with more than 2 parents via legacy child_ids', () => {
    const csv = [
      HEADER,
      'p1,John,Doe,M,,,,,,,,c1',
      'p2,Jim,Doe,M,,,,,,,,c1',
      'p3,Jill,Doe,F,,,,,,,,c1',
      'c1,Kid,Doe,U,,,,,p1,p2,,',
    ].join('\n');
    const { warnings } = validateCsvRows(rowsFor(csv));
    expect(warnings.some((w) => w.code === 'TOO_MANY_PARENTS')).toBe(true);
  });
});
