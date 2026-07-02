// Client-side mirror of backend/utils/json/mapper.js's domainToJsonExport,
// used only when exporting in-memory editor data that may include unsaved
// edits the backend doesn't have yet (see handleExportCurrentTree in
// main.js). Whenever the export source is already persisted, prefer calling
// GET /:id/export-json instead so this schema logic isn't duplicated twice
// for no reason.
const JSON_EXPORT_VERSION = '2.0';
const APPLICATION_NAME = 'FamilyChart';

function personToExport(person) {
  const data = person.data || {};
  const rels = person.rels || {};
  const isLiving = typeof data.isLiving === 'boolean' ? data.isLiving : !data.death;

  return {
    id: person.id,
    name: { first: data['first name'] || '', middle: data.middleName || '', last: data['last name'] || '' },
    gender: data.gender || 'U',
    birth: { date: data.birthday || null, place: data.location || null },
    death: {
      date: data.death && data.death !== 'Y' ? data.death : null,
      place: data.deathPlace || null,
      isLiving,
    },
    contact: { email: data.email || '', phone: data.phone || '' },
    occupation: data.occupation || '',
    photoUrl: data.avatar || '',
    notes: data.notes || '',
    relationships: {
      fatherId: data.fatherId || null,
      motherId: data.motherId || null,
      spouseIds: rels.spouses || [],
      parentIds: rels.parents || [],
      childIds: rels.children || [],
    },
    extensions: person.extensions || {},
  };
}

export function buildJsonExportEnvelope(people, { treeName } = {}) {
  return {
    version: JSON_EXPORT_VERSION,
    application: APPLICATION_NAME,
    exportedAt: new Date().toISOString(),
    tree: { name: treeName || '', people: people.map(personToExport) },
  };
}
