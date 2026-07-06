// Pure, DOM-free validation for relationships created via the All Nodes
// drag-to-connect builder. Mirrors the ancestry/progeny cycle-check pattern
// used by the family-chart library's own linking logic in
// src/store/add-existing-rel.ts (getAncestry/getProgeny), ported to plain JS
// so it can run without pulling in the library's internal Store.

function buildIndex(data) {
  return new Map(data.map((d) => [d.id, d]));
}

function getAncestryIds(datum, byId) {
  const ids = new Set();
  const walk = (d) => {
    (d.rels?.parents || []).forEach((pid) => {
      if (!pid || ids.has(pid)) return;
      ids.add(pid);
      const parent = byId.get(pid);
      if (parent) walk(parent);
    });
  };
  walk(datum);
  return ids;
}

function getProgenyIds(datum, byId) {
  const ids = new Set();
  const walk = (d) => {
    (d.rels?.children || []).forEach((cid) => {
      if (!cid || ids.has(cid)) return;
      ids.add(cid);
      const child = byId.get(cid);
      if (child) walk(child);
    });
  };
  walk(datum);
  return ids;
}

// Inert for now - no per-tree gender-constraint configuration exists yet.
// Kept as a named seam so a future settings UI can wire real config through
// without changing validateRelationship's call sites.
function validateGenderConstraints(_source, _target, _type, _config) {
  return { valid: true };
}

/**
 * @param {import('../src/types/data').Data} data
 * @param {string} sourceId
 * @param {string} targetId
 * @param {'parent'|'child'|'spouse'|'sibling'} type
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
export function validateRelationship(data, sourceId, targetId, type) {
  if (sourceId === targetId) {
    return { valid: false, reason: 'A person cannot be related to themselves.' };
  }

  const byId = buildIndex(data);
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) {
    return { valid: false, reason: 'One or both people could not be found.' };
  }

  if (type === 'spouse') {
    if ((source.rels.spouses || []).includes(targetId)) {
      return { valid: false, reason: 'These two people are already married.' };
    }
  }

  if (type === 'parent') {
    if ((source.rels.parents || []).includes(targetId)) {
      return { valid: false, reason: 'This parent/child relationship already exists.' };
    }
    // target would become source's parent - reject if target is already
    // source's descendant (would create a cycle).
    if (getProgenyIds(source, byId).has(targetId)) {
      return { valid: false, reason: 'This would create a circular ancestry (the chosen parent is a descendant of this person).' };
    }
  }

  if (type === 'child') {
    if ((source.rels.children || []).includes(targetId)) {
      return { valid: false, reason: 'This parent/child relationship already exists.' };
    }
    // target would become source's child - reject if target is already
    // source's ancestor.
    if (getAncestryIds(source, byId).has(targetId)) {
      return { valid: false, reason: 'This would create a circular ancestry (the chosen child is an ancestor of this person).' };
    }
  }

  if (type === 'sibling') {
    // Only checks source->target relMeta. applyRelationship always writes
    // both sides symmetrically, so this doesn't miss anything created
    // through this app's own tooling - only a future external import that
    // sets relMeta asymmetrically could slip past this. Fast-follow, not
    // blocking: fall back to checking target's relMeta too if that happens.
    const sourceMeta = source.data?.relMeta?.[targetId];
    if (sourceMeta?.type === 'sibling') {
      return { valid: false, reason: 'These two people are already recorded as siblings.' };
    }
  }

  const genderCheck = validateGenderConstraints(source, target, type, null);
  if (!genderCheck.valid) return genderCheck;

  return { valid: true };
}
