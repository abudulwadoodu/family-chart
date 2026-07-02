import { describe, it, expect } from 'vitest';
import { parseCsvText } from './parser.js';
import { buildRawRows, csvRowsToDomain, domainToCsvRows } from './mapper.js';

const HEADER =
  'id,first_name,middle_name,last_name,gender,birth_date,birth_place,death_date,death_place,is_living,photo_url,occupation,email,phone,notes,father_id,mother_id,spouse_ids';

function toDomain(csvText) {
  return csvRowsToDomain(buildRawRows(parseCsvText(csvText)));
}

describe('csvRowsToDomain', () => {
  it('maps every new column to its documented internal data key', () => {
    const csv = [
      HEADER,
      'p1,John,Middleton,Doe,M,1950-01-01,New York,,,TRUE,http://img/p1.jpg,Engineer,john@example.com,555-1234,Note here,,,p2',
    ].join('\n');
    const { people, errors } = toDomain(csv);
    expect(errors).toEqual([]);

    const john = people.find((p) => p.id === 'p1');
    expect(john.data['first name']).toBe('John');
    expect(john.data.middleName).toBe('Middleton');
    expect(john.data['last name']).toBe('Doe');
    expect(john.data.gender).toBe('M');
    expect(john.data.birthday).toBe('1950-01-01');
    expect(john.data.location).toBe('New York');
    expect(john.data.avatar).toBe('http://img/p1.jpg');
    expect(john.data.occupation).toBe('Engineer');
    expect(john.data.email).toBe('john@example.com');
    expect(john.data.phone).toBe('555-1234');
    expect(john.data.notes).toBe('Note here');
    expect(john.data.isLiving).toBeUndefined(); // isLiving is not stored directly; death presence is
    expect(john.data.death).toBeUndefined();
  });

  it('derives children automatically from father_id/mother_id', () => {
    const csv = [
      HEADER,
      'dad,John,,Doe,M,,,,,,,,,,,,,',
      'mom,Jane,,Doe,F,,,,,,,,,,,,,',
      'kid,Kid,,Doe,U,,,,,,,,,,,dad,mom,',
    ].join('\n');
    const { people } = toDomain(csv);
    const dad = people.find((p) => p.id === 'dad');
    const mom = people.find((p) => p.id === 'mom');
    const kid = people.find((p) => p.id === 'kid');
    expect(dad.rels.children).toEqual(['kid']);
    expect(mom.rels.children).toEqual(['kid']);
    expect(kid.rels.parents.sort()).toEqual(['dad', 'mom']);
    expect(kid.data.fatherId).toBe('dad');
    expect(kid.data.motherId).toBe('mom');
  });

  it('merges legacy child_ids with father/mother-derived children without duplicating', () => {
    const legacyHeader = `${HEADER},child_ids`;
    const csv = [
      legacyHeader,
      'dad,John,,Doe,M,,,,,,,,,,,,,,kid',
      'kid,Kid,,Doe,U,,,,,,,,,,,dad,,',
    ].join('\n');
    const { people } = toDomain(csv);
    const dad = people.find((p) => p.id === 'dad');
    expect(dad.rels.children).toEqual(['kid']);
  });

  it('sets death="Y" when is_living is FALSE and no death_date is given', () => {
    const csv = [HEADER, 'p1,John,,Doe,M,,,,,FALSE,,,,,,,,'].join('\n');
    const { people } = toDomain(csv);
    expect(people[0].data.death).toBe('Y');
  });

  it('leaves death unset when is_living is TRUE even if a stray death_date were present', () => {
    const csv = [HEADER, 'p1,John,,Doe,M,,,,,TRUE,,,,,,,,'].join('\n');
    const { people } = toDomain(csv);
    expect(people[0].data.death).toBeUndefined();
  });

  it('recognizes legacy header names (birthday/location/avatar/child_ids)', () => {
    const legacyCsv = [
      'id,first_name,last_name,gender,birthday,location,notes,avatar,father_id,mother_id,spouse_ids,child_ids',
      'p1,John,Doe,M,1950-01-01,New York,A note,http://img,,,,',
    ].join('\n');
    const { people, errors } = toDomain(legacyCsv);
    expect(errors).toEqual([]);
    expect(people[0].data.birthday).toBe('1950-01-01');
    expect(people[0].data.location).toBe('New York');
    expect(people[0].data.avatar).toBe('http://img');
  });
});

describe('domainToCsvRows', () => {
  it('prefers data.fatherId/motherId over the gender heuristic when present', () => {
    const people = [
      { id: 'dad', data: { 'first name': 'John', 'last name': 'Doe', gender: 'M' }, rels: { parents: [], children: ['kid'], spouses: [] } },
      { id: 'mom', data: { 'first name': 'Jane', 'last name': 'Doe', gender: 'F' }, rels: { parents: [], children: ['kid'], spouses: [] } },
      { id: 'kid', data: { 'first name': 'Kid', 'last name': 'Doe', gender: 'U', fatherId: 'dad', motherId: 'mom' }, rels: { parents: ['dad', 'mom'], children: [], spouses: [] } },
    ];
    const rows = domainToCsvRows(people);
    const kidRow = rows.find((r) => r.id === 'kid');
    expect(kidRow.father_id).toBe('dad');
    expect(kidRow.mother_id).toBe('mom');
  });

  it('falls back to the gender heuristic when fatherId/motherId are absent', () => {
    const people = [
      { id: 'dad', data: { 'first name': 'John', 'last name': 'Doe', gender: 'M' }, rels: { parents: [], children: ['kid'], spouses: [] } },
      { id: 'mom', data: { 'first name': 'Jane', 'last name': 'Doe', gender: 'F' }, rels: { parents: [], children: ['kid'], spouses: [] } },
      { id: 'kid', data: { 'first name': 'Kid', 'last name': 'Doe', gender: 'U' }, rels: { parents: ['dad', 'mom'], children: [], spouses: [] } },
    ];
    const rows = domainToCsvRows(people);
    const kidRow = rows.find((r) => r.id === 'kid');
    expect(kidRow.father_id).toBe('dad');
    expect(kidRow.mother_id).toBe('mom');
  });
});
