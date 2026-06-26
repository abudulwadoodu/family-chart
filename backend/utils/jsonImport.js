import { isNonEmptyString } from './validation.js';

export function parseJsonImport(jsonText) {
  if (!jsonText || !jsonText.trim()) {
    throw new Error('JSON file is empty');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (_error) {
    throw new Error('File is not valid JSON');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('JSON must be a non-empty array of family members');
  }

  const ids = new Set();
  for (const person of parsed) {
    if (!person || typeof person !== 'object' || Array.isArray(person)) {
      throw new Error('Each entry must be an object with "id", "data", and "rels"');
    }
    if (!isNonEmptyString(person.id)) {
      throw new Error('Each entry must have a non-empty "id"');
    }
    if (ids.has(person.id)) {
      throw new Error(`Duplicate id found: ${person.id}`);
    }
    ids.add(person.id);
  }

  const ensureExists = (refId, sourceId, relType) => {
    if (refId && !ids.has(refId)) {
      throw new Error(`Unknown ${relType} id "${refId}" referenced by "${sourceId}"`);
    }
  };

  for (const person of parsed) {
    const rels = person.rels || {};
    (rels.parents || []).forEach((pid) => ensureExists(pid, person.id, 'parent'));
    (rels.children || []).forEach((cid) => ensureExists(cid, person.id, 'child'));
    (rels.spouses || []).forEach((sid) => ensureExists(sid, person.id, 'spouse'));
    if ((rels.parents || []).length > 2) {
      throw new Error(`Person "${person.id}" has more than 2 parents`);
    }
  }

  return parsed;
}
