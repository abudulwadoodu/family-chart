// CsvMapper: translates between parsed CSV rows and the app's domain model
// ({id, data, rels}). Targets the same internal `data` keys the GEDCOM
// mapper already uses (birthday, location, death, deathPlace, avatar,
// 'first name', 'last name') so GEDCOM export keeps working for anyone who
// imported via CSV - see backend/utils/gedcom/mapper.js.
import { CSV_TEMPLATE_COLUMNS, LEGACY_ONLY_COLUMNS } from './constants.js';
import { validateCsvRows } from './validator.js';

function splitIds(value) {
  if (!value) return [];
  return String(value)
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean);
}

function addUnique(arr, value) {
  if (!value) return;
  if (!arr.includes(value)) arr.push(value);
}

// Builds the raw {lineNo, id, first_name, ...} row objects the validator and
// the rest of the mapper work with, from the {headers, rows} parser output.
export function buildRawRows({ headers, rows }) {
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const allColumns = [...CSV_TEMPLATE_COLUMNS, ...LEGACY_ONLY_COLUMNS];

  return rows.map(({ lineNo, cols }) => {
    const get = (key) => (idx[key] === undefined ? '' : String(cols[idx[key]] || '').trim());
    const raw = { lineNo };
    for (const col of allColumns) raw[col] = get(col);
    raw.spouse_ids = splitIds(get('spouse_ids'));
    raw.child_ids = [...splitIds(get('child_ids')), ...splitIds(get('children_ids'))];
    return raw;
  });
}

// Consumes validator output (cleaned rows with bad values already blanked)
// and produces the {people, warnings} the import routes persist.
export function csvRowsToDomain(rawRows) {
  const { errors, warnings, cleanedRows } = validateCsvRows(rawRows);
  if (errors.length > 0) {
    return { people: [], errors, warnings, summary: { rowCount: rawRows.length } };
  }

  const byId = new Map();
  cleanedRows.forEach((r) => {
    const data = {
      'first name': r.first_name,
      'last name': r.last_name || '',
      gender: r.gender || 'U',
      birthday: r.birth_date || '',
      location: r.birth_place || '',
      notes: r.notes || '',
      avatar: r.photo_url || '',
      occupation: r.occupation || '',
      email: r.email || '',
      phone: r.phone || '',
    };
    if (r.middle_name) data.middleName = r.middle_name;
    if (r.death_place) data.deathPlace = r.death_place;
    if (r.isLiving === false) {
      data.death = r.death_date || 'Y';
    } else if (r.death_date) {
      data.death = r.death_date;
    }
    if (r.father_id) data.fatherId = r.father_id;
    if (r.mother_id) data.motherId = r.mother_id;

    byId.set(r.id, {
      id: r.id,
      data,
      rels: { parents: [], children: [], spouses: [] },
    });
  });

  for (const r of cleanedRows) {
    const person = byId.get(r.id);
    [r.father_id, r.mother_id].filter(Boolean).forEach((pid) => {
      addUnique(person.rels.parents, pid);
      const parent = byId.get(pid);
      addUnique(parent.rels.children, r.id);
    });

    r.spouse_ids.forEach((sid) => {
      addUnique(person.rels.spouses, sid);
      const spouse = byId.get(sid);
      addUnique(spouse.rels.spouses, r.id);
    });

    r.child_ids.forEach((cid) => {
      const child = byId.get(cid);
      if (!child) return;
      addUnique(person.rels.children, cid);
      addUnique(child.rels.parents, r.id);
    });
  }

  const people = Array.from(byId.values());
  return {
    people,
    errors,
    warnings,
    summary: { rowCount: rawRows.length, importedCount: people.length, warningCount: warnings.length },
  };
}

// Inverse mapping for export: turns the app's people array into CSV rows
// using the same column order as CSV_TEMPLATE_COLUMNS. Prefers the
// data.fatherId/motherId round-trip hint when present, falling back to a
// gender-based heuristic split of rels.parents only when absent (e.g. people
// imported via GEDCOM, which never sets fatherId/motherId).
export function domainToCsvRows(people) {
  const byId = new Map(people.map((p) => [p.id, p]));

  return people.map((person) => {
    const data = person.data || {};
    const rels = person.rels || {};
    const parents = rels.parents || [];

    let fatherId = data.fatherId || '';
    let motherId = data.motherId || '';
    if (!fatherId && !motherId && parents.length > 0) {
      fatherId = parents.find((id) => byId.get(id)?.data?.gender === 'M') || '';
      motherId = parents.find((id) => id !== fatherId && byId.get(id)?.data?.gender === 'F') || parents.find((id) => id !== fatherId) || '';
    }

    const isLiving = typeof data.isLiving === 'boolean' ? data.isLiving : !data.death;

    return {
      id: person.id,
      first_name: data['first name'] || '',
      middle_name: data.middleName || '',
      last_name: data['last name'] || '',
      gender: data.gender || '',
      birth_date: data.birthday || '',
      birth_place: data.location || '',
      death_date: data.death && data.death !== 'Y' ? data.death : '',
      death_place: data.deathPlace || '',
      is_living: isLiving ? 'TRUE' : 'FALSE',
      photo_url: data.avatar || '',
      occupation: data.occupation || '',
      email: data.email || '',
      phone: data.phone || '',
      notes: data.notes || '',
      father_id: fatherId,
      mother_id: motherId,
      spouse_ids: (rels.spouses || []).join(';'),
    };
  });
}
