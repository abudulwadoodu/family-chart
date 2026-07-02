// CsvValidator: row-level checks over the raw {lineNo, id, first_name, ...}
// rows built by csv/mapper.js's buildRawRows. Only missing id, missing
// first_name, and duplicate id are hard errors that exclude a row - anything
// else (bad relationship references, dates, gender, email, is_living) is a
// warning: the row still imports, the offending value/link is dropped
// instead. This mirrors gedcom/validator.js's "only truly unrecoverable
// problems are errors" philosophy, applied per-row instead of per-file.
import { isValidEmail } from '../validation.js';
import { detectCircularParents } from '../relationshipGraph.js';
import { VALID_GENDERS, GENDER_ALIASES, TRUE_VALUES, FALSE_VALUES } from './constants.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value, field, row, warnings) {
  if (!value) return '';
  if (ISO_DATE.test(value)) return value;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const converted = parsed.toISOString().slice(0, 10);
    warnings.push({
      code: 'AMBIGUOUS_DATE_CONVERTED',
      row,
      message: `Row ${row}: ${field} "${value}" is not in YYYY-MM-DD format; interpreted as ${converted}`,
    });
    return converted;
  }

  warnings.push({ code: 'INVALID_DATE', row, message: `Row ${row}: ${field} "${value}" could not be parsed as a date and was left blank` });
  return '';
}

function parseGender(value, row, warnings) {
  if (!value) return '';
  const normalized = value.trim();
  if (VALID_GENDERS.has(normalized.toUpperCase())) return normalized.toUpperCase();
  const aliased = GENDER_ALIASES[normalized.toLowerCase()];
  if (aliased) return aliased;
  warnings.push({ code: 'INVALID_GENDER', row, message: `Row ${row}: gender "${value}" is not recognized; defaulted to Unknown` });
  return 'U';
}

function parseEmail(value, row, warnings) {
  if (!value) return '';
  if (isValidEmail(value)) return value;
  warnings.push({ code: 'INVALID_EMAIL', row, message: `Row ${row}: email "${value}" is not a valid email address and was left blank` });
  return '';
}

function parseIsLiving(value, row, warnings) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  warnings.push({ code: 'INVALID_IS_LIVING', row, message: `Row ${row}: is_living value "${value}" is not a recognized boolean and was ignored` });
  return undefined;
}

export function validateCsvRows(rawRows) {
  const errors = [];
  const warnings = [];

  const ids = new Set();
  const withIds = [];
  for (const r of rawRows) {
    if (!r.id) {
      errors.push({ code: 'MISSING_ID', row: r.lineNo, message: `Row ${r.lineNo}: id is required` });
      continue;
    }
    if (!r.first_name) {
      errors.push({ code: 'MISSING_FIRST_NAME', row: r.lineNo, message: `Row ${r.lineNo}: first_name is required` });
      continue;
    }
    if (ids.has(r.id)) {
      errors.push({ code: 'DUPLICATE_ID', row: r.lineNo, message: `Row ${r.lineNo}: duplicate id "${r.id}" (first occurrence wins)` });
      continue;
    }
    ids.add(r.id);
    withIds.push(r);
  }

  const cleanedRows = withIds.map((r) => {
    const cleaned = { ...r };
    cleaned.birth_date = parseDate(r.birth_date, 'birth_date', r.lineNo, warnings);
    cleaned.death_date = parseDate(r.death_date, 'death_date', r.lineNo, warnings);
    cleaned.gender = parseGender(r.gender, r.lineNo, warnings);
    cleaned.email = parseEmail(r.email, r.lineNo, warnings);
    cleaned.isLiving = parseIsLiving(r.is_living, r.lineNo, warnings);

    if (r.father_id && !ids.has(r.father_id)) {
      warnings.push({ code: 'UNKNOWN_FATHER_ID', row: r.lineNo, message: `Row ${r.lineNo}: father_id "${r.father_id}" does not match any row and was dropped` });
      cleaned.father_id = '';
    }
    if (r.mother_id && !ids.has(r.mother_id)) {
      warnings.push({ code: 'UNKNOWN_MOTHER_ID', row: r.lineNo, message: `Row ${r.lineNo}: mother_id "${r.mother_id}" does not match any row and was dropped` });
      cleaned.mother_id = '';
    }

    const seenSpouses = new Set();
    const spouseIds = [];
    for (const sid of r.spouse_ids) {
      if (!ids.has(sid)) {
        warnings.push({ code: 'UNKNOWN_SPOUSE_ID', row: r.lineNo, message: `Row ${r.lineNo}: spouse id "${sid}" does not match any row and was dropped` });
        continue;
      }
      if (seenSpouses.has(sid)) {
        warnings.push({ code: 'DUPLICATE_SPOUSE_REFERENCE', row: r.lineNo, message: `Row ${r.lineNo}: spouse id "${sid}" was listed more than once` });
        continue;
      }
      seenSpouses.add(sid);
      spouseIds.push(sid);
    }
    cleaned.spouse_ids = spouseIds;

    cleaned.child_ids = r.child_ids.filter((cid) => {
      if (ids.has(cid)) return true;
      warnings.push({ code: 'UNKNOWN_CHILD_ID', row: r.lineNo, message: `Row ${r.lineNo}: child id "${cid}" does not match any row and was dropped` });
      return false;
    });

    return cleaned;
  });

  const peopleById = new Map(cleanedRows.map((r) => [r.id, { id: r.id, rels: { parents: [r.father_id, r.mother_id].filter(Boolean) } }]));
  // Legacy child_ids also create parent links (child -> this row), which the
  // cycle check needs to see alongside father_id/mother_id.
  for (const r of cleanedRows) {
    for (const cid of r.child_ids) {
      const child = peopleById.get(cid);
      if (child && !child.rels.parents.includes(r.id)) child.rels.parents.push(r.id);
    }
  }
  warnings.push(...detectCircularParents(peopleById));

  for (const r of cleanedRows) {
    const parentCount = new Set([...(peopleById.get(r.id)?.rels.parents || [])]).size;
    if (parentCount > 2) {
      warnings.push({ code: 'TOO_MANY_PARENTS', row: r.lineNo, message: `Row ${r.lineNo}: "${r.id}" has more than 2 parents after merging father_id/mother_id/child_ids` });
    }
  }

  return { errors, warnings, cleanedRows };
}
