// JsonValidator: warn-first checks over a domain-shaped people array
// (post jsonExportToDomain). Only a missing/duplicate id is a hard error
// that excludes a person - everything else is a warning, matching the CSV
// validator's philosophy and the "continue importing valid records" policy.
import { detectCircularParents } from '../relationshipGraph.js';
import { isNonEmptyString } from '../validation.js';

export function validateJsonPeople(people) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(people) || people.length === 0) {
    errors.push({ code: 'EMPTY_IMPORT', message: 'JSON must contain at least one person' });
    return { errors, warnings, cleanedPeople: [] };
  }

  const ids = new Set();
  const usable = [];
  people.forEach((person, i) => {
    const label = `Person ${i + 1}`;
    if (!person || typeof person !== 'object' || Array.isArray(person)) {
      errors.push({ code: 'INVALID_ENTRY', message: `${label}: each entry must be an object with "id", "data", and "rels"` });
      return;
    }
    if (!isNonEmptyString(person.id)) {
      errors.push({ code: 'MISSING_ID', message: `${label}: a non-empty "id" is required` });
      return;
    }
    if (ids.has(person.id)) {
      errors.push({ code: 'DUPLICATE_ID', message: `Duplicate id found: "${person.id}" (first occurrence wins)` });
      return;
    }
    ids.add(person.id);
    usable.push(person);
  });

  const cleanedPeople = usable.map((person) => {
    const rels = person.rels || { parents: [], children: [], spouses: [] };
    const parents = (rels.parents || []).filter((pid) => {
      if (ids.has(pid)) return true;
      warnings.push({ code: 'UNKNOWN_PARENT_ID', message: `"${person.id}": parent id "${pid}" does not match any person and was dropped` });
      return false;
    });
    const spouses = (rels.spouses || []).filter((sid, i, arr) => {
      if (!ids.has(sid)) {
        warnings.push({ code: 'UNKNOWN_SPOUSE_ID', message: `"${person.id}": spouse id "${sid}" does not match any person and was dropped` });
        return false;
      }
      if (arr.indexOf(sid) !== i) {
        warnings.push({ code: 'DUPLICATE_SPOUSE_REFERENCE', message: `"${person.id}": spouse id "${sid}" was listed more than once` });
        return false;
      }
      return true;
    });
    const children = (rels.children || []).filter((cid) => {
      if (ids.has(cid)) return true;
      warnings.push({ code: 'UNKNOWN_CHILD_ID', message: `"${person.id}": child id "${cid}" does not match any person and was dropped` });
      return false;
    });

    if (parents.length > 2) {
      warnings.push({ code: 'TOO_MANY_PARENTS', message: `"${person.id}" has more than 2 parents` });
    }

    return { ...person, rels: { parents, spouses, children } };
  });

  warnings.push(...detectCircularParents(new Map(cleanedPeople.map((p) => [p.id, p]))));

  return { errors, warnings, cleanedPeople };
}
