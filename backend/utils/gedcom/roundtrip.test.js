import { describe, it, expect } from 'vitest';

import { writeGedcom } from './writer.js';
import { parseGedcom } from './parser.js';
import { gedcomToDomain } from './mapper.js';

// Exercises the full export -> import cycle through this app's own writer
// and parser, verifying no significant data loss for the scenarios called
// out in the spec (deep generations, multiple marriages, missing dates,
// unknown genders). Relies on the writer's `_APPID` tag so the round-tripped
// people can be matched back to the originals by id.
function roundTrip(people, options = {}) {
  const gedcomText = writeGedcom(people, options);
  const { records } = parseGedcom(gedcomText);
  return gedcomToDomain(records, options).people;
}

describe('export -> import round trip', () => {
  it('preserves names, gender, dates, places, notes, and relationships', () => {
    const people = [
      {
        id: 'p1',
        data: { 'first name': 'John', 'last name': 'Doe', gender: 'M', birthday: '1 JAN 1950', location: 'NYC', notes: 'a note' },
        rels: { parents: [], children: ['c1'], spouses: ['p2'] },
      },
      {
        id: 'p2',
        data: { 'first name': 'Jane', 'last name': 'Doe', gender: 'F', birthday: '5 MAR 1952', death: '1 JAN 2020', deathPlace: 'Boston' },
        rels: { parents: [], children: ['c1'], spouses: ['p1'] },
      },
      {
        id: 'c1',
        data: { 'first name': 'Chris', 'last name': 'Doe', gender: 'U' },
        rels: { parents: ['p1', 'p2'], children: [], spouses: [] },
      },
    ];

    const back = roundTrip(people);
    const byId = new Map(back.map((p) => [p.id, p]));

    const john = byId.get('p1');
    expect(john.data['first name']).toBe('John');
    expect(john.data['last name']).toBe('Doe');
    expect(john.data.gender).toBe('M');
    expect(john.data.birthday).toBe('1 JAN 1950');
    expect(john.data.location).toBe('NYC');
    expect(john.data.notes).toBe('a note');
    expect(john.rels.spouses).toEqual(['p2']);
    expect(john.rels.children).toEqual(['c1']);

    const jane = byId.get('p2');
    expect(jane.data.death).toBe('1 JAN 2020');
    expect(jane.data.deathPlace).toBe('Boston');

    const chris = byId.get('c1');
    expect(chris.rels.parents.sort()).toEqual(['p1', 'p2']);
  });

  it('preserves a deep generational chain', () => {
    const people = Array.from({ length: 6 }, (_, i) => ({
      id: `g${i}`,
      data: { 'first name': `Gen${i}`, 'last name': 'Chain', gender: i % 2 === 0 ? 'M' : 'F' },
      rels: {
        parents: i > 0 ? [`g${i - 1}`] : [],
        children: i < 5 ? [`g${i + 1}`] : [],
        spouses: [],
      },
    }));

    const back = roundTrip(people);
    const byId = new Map(back.map((p) => [p.id, p]));
    for (let i = 1; i < 6; i += 1) {
      expect(byId.get(`g${i}`).rels.parents).toEqual([`g${i - 1}`]);
    }
  });

  it('preserves multiple marriages as distinct spouse relationships', () => {
    const people = [
      { id: 'a', data: { 'first name': 'Sam', 'last name': 'X', gender: 'M' }, rels: { parents: [], children: [], spouses: ['b', 'c'] } },
      { id: 'b', data: { 'first name': 'First', 'last name': 'Wife', gender: 'F' }, rels: { parents: [], children: [], spouses: ['a'] } },
      { id: 'c', data: { 'first name': 'Second', 'last name': 'Wife', gender: 'F' }, rels: { parents: [], children: [], spouses: ['a'] } },
    ];

    const back = roundTrip(people);
    const sam = back.find((p) => p.id === 'a');
    expect(sam.rels.spouses.sort()).toEqual(['b', 'c']);
  });

  it('preserves an unknown gender and missing dates without inventing data', () => {
    const people = [{ id: 'u1', data: { 'first name': 'Mx', 'last name': 'Unknown', gender: 'U' }, rels: { parents: [], children: [], spouses: [] } }];
    const back = roundTrip(people);
    expect(back[0].data.gender).toBe('U');
    expect(back[0].data.birthday).toBe('');
  });
});
