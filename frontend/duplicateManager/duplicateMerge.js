// Pure data-layer merge for the Duplicate Manager. Mirrors relationshipMutations.js's
// convention (plain functions operating on the flat Datum[] directly, no DOM), but
// merge is lossy in a way relationship add/remove isn't - one record's identity is
// deleted entirely - so undo here is snapshot-based rather than a simple inverse.

function buildIndex(data) {
  return new Map(data.map((d) => [d.id, d]));
}

function cloneDatum(datum) {
  return JSON.parse(JSON.stringify(datum));
}

const REL_ARRAYS = ['parents', 'children', 'spouses'];

// Fields worth surfacing in the compare panel: known identity/detail fields
// plus any other simple (non-object) key either record has set, so custom
// fields added via the tree editor's own field list aren't silently dropped.
export function diffFields(a, b) {
  const keys = new Set([...Object.keys(a?.data || {}), ...Object.keys(b?.data || {})]);
  keys.delete('relMeta');
  const fields = [];
  for (const key of keys) {
    const valueA = a?.data?.[key] ?? '';
    const valueB = b?.data?.[key] ?? '';
    if (valueA === valueB) continue;
    fields.push({ field: key, valueA, valueB });
  }
  return fields;
}

// Preview only - does not mutate `data`. `fieldChoices` maps field name to
// 'a' | 'b'; fields not present default to whichever side is non-empty, and
// if both are non-empty and unspecified, 'a' (the keep side) wins.
export function buildMergePreview(data, { keepId, dropId, fieldChoices = {} }) {
  const byId = buildIndex(data);
  const keep = byId.get(keepId);
  const drop = byId.get(dropId);
  if (!keep || !drop) return null;

  const mergedData = { ...keep.data };
  for (const { field, valueA, valueB } of diffFields(keep, drop)) {
    const choice = fieldChoices[field] || (valueA ? 'a' : 'b');
    mergedData[field] = choice === 'b' ? valueB : valueA;
  }

  const inheritedRels = {};
  for (const key of REL_ARRAYS) {
    const existing = new Set(keep.rels?.[key] || []);
    const incoming = (drop.rels?.[key] || []).filter((id) => id !== keepId && !existing.has(id));
    inheritedRels[key] = incoming;
  }

  return { mergedData, inheritedRels };
}

// Mutates `data` in place: folds `dropId` into `keepId`, unions relationships,
// repoints every third party that referenced `dropId`, remaps relMeta, and
// removes the dropped datum from the array. Returns a command object holding
// full snapshots needed to reverse the merge later.
export function applyMerge(data, { keepId, dropId, fieldChoices = {} }) {
  const byId = buildIndex(data);
  const keep = byId.get(keepId);
  const drop = byId.get(dropId);
  if (!keep || !drop) return null;

  const keepSnapshot = cloneDatum(keep);
  const dropSnapshot = cloneDatum(drop);
  // Every third party referencing dropId (via rels or relMeta) gets repointed
  // below - snapshotted up front (not re-derived at undo time) so reversing
  // the merge is an exact restore rather than an inference.
  const affectedSnapshots = data
    .filter((d) => d.id !== keepId && d.id !== dropId)
    .filter(
      (d) =>
        REL_ARRAYS.some((key) => (d.rels?.[key] || []).includes(dropId)) || Boolean(d.data?.relMeta?.[dropId]),
    )
    .map(cloneDatum);

  const preview = buildMergePreview(data, { keepId, dropId, fieldChoices });
  keep.data = preview.mergedData;

  for (const key of REL_ARRAYS) {
    keep.rels[key] = [...(keep.rels[key] || []), ...preview.inheritedRels[key]];
  }

  // Repoint every other record's rels arrays and relMeta keys from dropId to
  // keepId, mirroring the bidirectional bookkeeping relationshipMutations.js
  // uses for a single link, just applied across the whole tree at once.
  for (const datum of data) {
    if (datum.id === keepId || datum.id === dropId) continue;
    let touched = false;
    for (const key of REL_ARRAYS) {
      const arr = datum.rels?.[key];
      if (!arr || !arr.includes(dropId)) continue;
      touched = true;
      const withoutDrop = arr.filter((id) => id !== dropId);
      datum.rels[key] = withoutDrop.includes(keepId) ? withoutDrop : [...withoutDrop, keepId];
    }
    if (datum.data?.relMeta && datum.data.relMeta[dropId]) {
      if (touched) {
        // Only remap metadata when this person actually still has a live
        // link to keepId after de-duplication above - otherwise keepId's own
        // relMeta (merged below) is already the source of truth.
        if (!datum.data.relMeta[keepId]) datum.data.relMeta[keepId] = datum.data.relMeta[dropId];
      }
      delete datum.data.relMeta[dropId];
    }
  }

  // Union relMeta from the dropped record onto the survivor, without
  // clobbering entries the survivor already has for the same relative.
  if (drop.data?.relMeta) {
    keep.data.relMeta = { ...(drop.data.relMeta || {}), ...(keep.data.relMeta || {}) };
    delete keep.data.relMeta[keepId];
  }
  // A relMeta entry the dropped record had *for the survivor itself* (i.e.
  // they were already linked to each other) makes no sense once merged.
  if (keep.data.relMeta) delete keep.data.relMeta[dropId];

  // Any surviving rels entries that now point at keepId from keepId itself
  // (e.g. drop and keep were spouses of each other) must be stripped - a
  // person cannot be their own relative.
  for (const key of REL_ARRAYS) {
    keep.rels[key] = keep.rels[key].filter((id) => id !== keepId);
  }

  const dropIndex = data.findIndex((d) => d.id === dropId);
  if (dropIndex !== -1) data.splice(dropIndex, 1);

  return { keepId, dropId, fieldChoices, keepSnapshot, dropSnapshot, affectedSnapshots };
}

// Reverses applyMerge: restores the survivor and every repointed third party
// to their exact pre-merge snapshots, and re-inserts the dropped record.
export function undoMerge(data, command) {
  const { keepId, dropId, keepSnapshot, dropSnapshot, affectedSnapshots } = command;
  const byId = buildIndex(data);
  const keep = byId.get(keepId);
  if (!keep) return false;

  keep.data = cloneDatum(keepSnapshot).data;
  keep.rels = cloneDatum(keepSnapshot).rels;

  for (const snapshot of affectedSnapshots || []) {
    const datum = byId.get(snapshot.id);
    if (!datum) continue;
    datum.data = cloneDatum(snapshot).data;
    datum.rels = cloneDatum(snapshot).rels;
  }

  data.push(cloneDatum(dropSnapshot));
  return true;
}
