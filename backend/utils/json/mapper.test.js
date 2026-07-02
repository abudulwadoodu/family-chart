import { describe, it, expect } from 'vitest';
import { domainToJsonExport, jsonExportToDomain } from './mapper.js';

describe('domainToJsonExport / jsonExportToDomain round-trip', () => {
  it('round-trips a person through the versioned envelope preserving key fields', () => {
    const people = [
      {
        id: 'p1',
        data: {
          'first name': 'John',
          'last name': 'Doe',
          middleName: 'Q',
          gender: 'M',
          birthday: '1950-01-01',
          location: 'New York',
          death: '2020-05-01',
          deathPlace: 'Boston',
          avatar: 'http://img',
          occupation: 'Engineer',
          email: 'john@example.com',
          phone: '555-1234',
          notes: 'note',
          fatherId: 'gp1',
          motherId: 'gp2',
        },
        rels: { parents: ['gp1', 'gp2'], spouses: ['p2'], children: ['c1'] },
      },
    ];

    const envelope = domainToJsonExport(people, { treeName: 'Doe Family' });
    expect(envelope.version).toBe('2.0');
    expect(envelope.application).toBe('FamilyChart');
    expect(typeof envelope.exportedAt).toBe('string');
    expect(envelope.tree.name).toBe('Doe Family');

    const exported = envelope.tree.people[0];
    expect(exported.name).toEqual({ first: 'John', middle: 'Q', last: 'Doe' });
    expect(exported.birth).toEqual({ date: '1950-01-01', place: 'New York' });
    expect(exported.death.date).toBe('2020-05-01');
    expect(exported.death.place).toBe('Boston');
    expect(exported.death.isLiving).toBe(false);
    expect(exported.relationships.fatherId).toBe('gp1');
    expect(exported.relationships.motherId).toBe('gp2');
    expect(exported.relationships.spouseIds).toEqual(['p2']);
    expect(exported.relationships.childIds).toEqual(['c1']);
    expect(exported.extensions).toEqual({});

    const { people: roundTripped } = jsonExportToDomain(envelope);
    expect(roundTripped[0].data['first name']).toBe('John');
    expect(roundTripped[0].data.birthday).toBe('1950-01-01');
    expect(roundTripped[0].data.death).toBe('2020-05-01');
    expect(roundTripped[0].data.deathPlace).toBe('Boston');
    expect(roundTripped[0].data.avatar).toBe('http://img');
    expect(roundTripped[0].rels.parents.sort()).toEqual(['gp1', 'gp2']);
    expect(roundTripped[0].rels.spouses).toEqual(['p2']);
    expect(roundTripped[0].rels.children).toEqual(['c1']);
  });

  it('passes legacy bare-array format straight through unchanged', () => {
    const legacy = [
      { id: 'p1', data: { 'first name': 'John', 'last name': 'Doe', birthday: '1950', location: 'NYC', avatar: '' }, rels: { parents: [], children: [], spouses: [] } },
    ];
    const { people } = jsonExportToDomain(legacy);
    expect(people).toEqual(legacy);
  });

  it('accepts a versioned envelope with a top-level people array (no tree wrapper)', () => {
    const envelope = { version: '2.0', people: [{ id: 'p1', name: { first: 'John', last: 'Doe' }, relationships: {} }] };
    const { people } = jsonExportToDomain(envelope);
    expect(people[0].id).toBe('p1');
    expect(people[0].data['first name']).toBe('John');
  });

  it('handles missing optional nested objects gracefully', () => {
    const envelope = { version: '2.0', tree: { people: [{ id: 'p1' }] } };
    const { people } = jsonExportToDomain(envelope);
    expect(people[0].data['first name']).toBe('');
    expect(people[0].rels.parents).toEqual([]);
  });

  it('throws for input that is neither an array nor a versioned envelope', () => {
    expect(() => jsonExportToDomain({ foo: 'bar' })).toThrow(/not a recognized JSON export/);
  });
});
