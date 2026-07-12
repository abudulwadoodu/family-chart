// Pure data-layer mutations for relationships created via the All Nodes
// drag-to-connect builder. Mirrors the bidirectional rels-array bookkeeping
// pattern used by the family-chart library's own handleLinkRel
// (src/store/add-existing-rel.ts), but targets the flat Datum[] directly
// instead of the library's internal Store.
//
// Relationship "detail" (subtype, marriage/divorce dates, current/former
// status) has no home in the existing rels.parents/spouses/children arrays
// (plain string ids, consumed as such across the library and backend), so
// it's recorded separately in data.relMeta, keyed by the other person's id.
// This is additive and non-breaking: every existing consumer that only reads
// rels.* as string[] keeps working unchanged.

export function inverseType(type) {
  if (type === 'parent') return 'child';
  if (type === 'child') return 'parent';
  return type; // spouse and sibling are their own inverse
}

function writeRelMeta(datum, otherId, meta) {
  if (!datum.data.relMeta) datum.data.relMeta = {};
  datum.data.relMeta[otherId] = meta;
}

function clearRelMeta(datum, otherId) {
  if (datum.data.relMeta) delete datum.data.relMeta[otherId];
}

function buildIndex(data) {
  return new Map(data.map((d) => [d.id, d]));
}

/**
 * Mutates `data` in place, keeping both sides of rels in sync, and records
 * descriptive metadata for the relationship on both people.
 *
 * @param {import('../src/types/data').Data} data
 * @param {{
 *   sourceId: string, targetId: string,
 *   type: 'parent'|'child'|'spouse'|'sibling',
 *   subtype?: string, marriageDate?: string, divorceDate?: string, status?: string,
 * }} draft
 */
export function applyRelationship(data, draft) {
  const { sourceId, targetId, type, subtype, marriageDate, divorceDate, status } = draft;
  const byId = buildIndex(data);
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) return;

  if (type === 'parent') {
    // target becomes source's parent
    if (!source.rels.parents.includes(targetId)) source.rels.parents.push(targetId);
    if (!target.rels.children.includes(sourceId)) target.rels.children.push(sourceId);
  } else if (type === 'child') {
    // target becomes source's child
    if (!source.rels.children.includes(targetId)) source.rels.children.push(targetId);
    if (!target.rels.parents.includes(sourceId)) target.rels.parents.push(sourceId);
  } else if (type === 'spouse') {
    if (!source.rels.spouses.includes(targetId)) source.rels.spouses.push(targetId);
    if (!target.rels.spouses.includes(sourceId)) target.rels.spouses.push(sourceId);
  }
  // sibling: no rels mutation - the data model has no direct sibling edge,
  // recorded as relMeta annotation only (see module comment above).

  const sharedFields = { marriageDate, divorceDate, status };
  if (type === 'sibling') {
    writeRelMeta(source, targetId, { type: 'sibling', subtype });
    writeRelMeta(target, sourceId, { type: 'sibling', subtype });
  } else {
    writeRelMeta(source, targetId, { type, subtype, ...sharedFields });
    writeRelMeta(target, sourceId, { type: inverseType(type), subtype, ...sharedFields });
  }
}

/**
 * Inverse of applyRelationship - strips the ids back out of both sides'
 * rels arrays and removes both relMeta entries. Not wired into any UI yet;
 * exists as the future UndoManager's hook and to support the standalone
 * "Delete relationship" requirement later.
 *
 * @param {import('../src/types/data').Data} data
 * @param {{ sourceId: string, targetId: string, type: 'parent'|'child'|'spouse'|'sibling' }} draft
 */
export function removeRelationship(data, draft) {
  const { sourceId, targetId, type } = draft;
  const byId = buildIndex(data);
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) return;

  if (type === 'parent') {
    source.rels.parents = source.rels.parents.filter((id) => id !== targetId);
    target.rels.children = target.rels.children.filter((id) => id !== sourceId);
  } else if (type === 'child') {
    source.rels.children = source.rels.children.filter((id) => id !== targetId);
    target.rels.parents = target.rels.parents.filter((id) => id !== sourceId);
  } else if (type === 'spouse') {
    source.rels.spouses = (source.rels.spouses || []).filter((id) => id !== targetId);
    target.rels.spouses = (target.rels.spouses || []).filter((id) => id !== sourceId);
  }

  clearRelMeta(source, targetId);
  clearRelMeta(target, sourceId);
}

/**
 * Detaches a person from every parent, spouse, and child they currently
 * have, leaving them an isolated node. Used by the All Nodes view's node
 * click menu ("Remove relation") as a bulk counterpart to removeRelationship
 * (which only ever handles one source/target pair at a time).
 *
 * @param {import('../src/types/data').Data} data
 * @param {string} personId
 */
export function removeAllRelations(data, personId) {
  const byId = buildIndex(data);
  const person = byId.get(personId);
  if (!person) return;

  const parentIds = [...(person.rels.parents || [])];
  const spouseIds = [...(person.rels.spouses || [])];
  const childIds = [...(person.rels.children || [])];

  parentIds.forEach((id) => removeRelationship(data, { sourceId: personId, targetId: id, type: 'parent' }));
  spouseIds.forEach((id) => removeRelationship(data, { sourceId: personId, targetId: id, type: 'spouse' }));
  childIds.forEach((id) => removeRelationship(data, { sourceId: personId, targetId: id, type: 'child' }));
}

/**
 * Removes a person from the tree entirely: strips them out of every other
 * person's rels arrays and relMeta, then deletes their own record. Simpler
 * than the family-chart library's own deletePerson (src/store/edit.ts),
 * which special-cases keeping the *main* tree connected to a single root -
 * that notion doesn't apply to the All Nodes view, which shows every
 * disconnected family island at once, so a plain unconditional removal is
 * the correct (and only sensible) semantics here.
 *
 * @param {import('../src/types/data').Data} data
 * @param {string} personId
 */
export function deleteNode(data, personId) {
  removeAllRelations(data, personId);
  const index = data.findIndex((d) => d.id === personId);
  if (index !== -1) data.splice(index, 1);
}
