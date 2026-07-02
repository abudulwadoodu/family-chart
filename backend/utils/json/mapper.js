// JsonMapper: translates between the app's domain model ({id, data, rels})
// and the versioned export envelope's nested per-person shape. Reads/writes
// the same internal `data` keys as csv/mapper.js and gedcom/mapper.js
// (birthday, location, death, deathPlace, avatar, 'first name', 'last name')
// so all three import sources stay interchangeable.
import { isVersionedFormat, buildExportEnvelope } from './schema.js';

function personToExport(person) {
  const data = person.data || {};
  const rels = person.rels || {};
  const parents = rels.parents || [];
  const fatherId = data.fatherId || '';
  const motherId = data.motherId || '';
  const isLiving = typeof data.isLiving === 'boolean' ? data.isLiving : !data.death;

  return {
    id: person.id,
    name: {
      first: data['first name'] || '',
      middle: data.middleName || '',
      last: data['last name'] || '',
    },
    gender: data.gender || 'U',
    birth: {
      date: data.birthday || null,
      place: data.location || null,
    },
    death: {
      date: data.death && data.death !== 'Y' ? data.death : null,
      place: data.deathPlace || null,
      isLiving,
    },
    contact: {
      email: data.email || '',
      phone: data.phone || '',
    },
    occupation: data.occupation || '',
    photoUrl: data.avatar || '',
    notes: data.notes || '',
    relationships: {
      fatherId: fatherId || null,
      motherId: motherId || null,
      spouseIds: rels.spouses || [],
      parentIds: parents,
      childIds: rels.children || [],
    },
    extensions: person.extensions || {},
  };
}

function exportToPerson(entry) {
  const name = entry.name || {};
  const birth = entry.birth || {};
  const death = entry.death || {};
  const contact = entry.contact || {};
  const relationships = entry.relationships || {};

  const data = {
    'first name': name.first || '',
    'last name': name.last || '',
    gender: entry.gender || 'U',
    birthday: birth.date || '',
    location: birth.place || '',
    notes: entry.notes || '',
    avatar: entry.photoUrl || '',
    occupation: entry.occupation || '',
    email: contact.email || '',
    phone: contact.phone || '',
  };
  if (name.middle) data.middleName = name.middle;
  if (death.place) data.deathPlace = death.place;
  if (death.isLiving === false) {
    data.death = death.date || 'Y';
  } else if (death.date) {
    data.death = death.date;
  }
  if (typeof death.isLiving === 'boolean') data.isLiving = death.isLiving;
  if (relationships.fatherId) data.fatherId = relationships.fatherId;
  if (relationships.motherId) data.motherId = relationships.motherId;

  const parents = Array.isArray(relationships.parentIds) && relationships.parentIds.length
    ? relationships.parentIds
    : [relationships.fatherId, relationships.motherId].filter(Boolean);

  return {
    id: entry.id,
    data,
    rels: {
      parents,
      spouses: relationships.spouseIds || [],
      children: relationships.childIds || [],
    },
    ...(entry.extensions && Object.keys(entry.extensions).length ? { extensions: entry.extensions } : {}),
  };
}

export function domainToJsonExport(people, options = {}) {
  return buildExportEnvelope(people.map(personToExport), options);
}

// Detects legacy bare-array vs versioned envelope and returns a flat
// {people, warnings} either way. Legacy entries already use internal keys
// natively (data.birthday, data.location, data.avatar), so they pass through
// unchanged - no aliasing needed, unlike CSV's external column names.
export function jsonExportToDomain(parsed) {
  const warnings = [];

  if (Array.isArray(parsed)) {
    return { people: parsed, warnings };
  }

  if (isVersionedFormat(parsed)) {
    const people = parsed.tree?.people || parsed.people || [];
    return { people: people.map(exportToPerson), warnings };
  }

  throw new Error('File is not a recognized JSON export (expected an array of people or a versioned export envelope)');
}
