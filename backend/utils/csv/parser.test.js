import { describe, it, expect } from 'vitest';
import { parseCsvText } from './parser.js';

describe('parseCsvText', () => {
  it('parses headers and rows, trimming whitespace', () => {
    const { headers, rows } = parseCsvText('id,first_name,last_name\np1, John , Doe \n');
    expect(headers).toEqual(['id', 'first_name', 'last_name']);
    expect(rows).toEqual([{ lineNo: 2, cols: ['p1', 'John', 'Doe'] }]);
  });

  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const { rows } = parseCsvText('id,notes\np1,"Loves ""jazz"", travel, and hiking"');
    expect(rows[0].cols).toEqual(['p1', 'Loves "jazz", travel, and hiking']);
  });

  it('normalizes CRLF line endings', () => {
    const { rows } = parseCsvText('id,first_name\r\np1,John\r\np2,Jane\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[1].lineNo).toBe(3);
  });

  it('lowercases and aliases legacy header names', () => {
    const { headers } = parseCsvText('ID,Birthday,Location,Avatar\np1,1990-01-01,NYC,url');
    expect(headers).toEqual(['id', 'birth_date', 'birth_place', 'photo_url']);
  });

  it('throws on an empty file', () => {
    expect(() => parseCsvText('')).toThrow('CSV file is empty');
    expect(() => parseCsvText('   ')).toThrow('CSV file is empty');
  });

  it('throws when there is no data row', () => {
    expect(() => parseCsvText('id,first_name')).toThrow('CSV must include header + at least one row');
  });
});
