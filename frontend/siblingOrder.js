// Sibling ordering: wired in as the chart's setSortChildrenFunction in
// main.js. A parent's children sort by an explicit manual rank
// (`data.sibling_order`, set via the "Sort children" dialog -
// sortChildrenDialog.js) when one has been assigned, falling back to
// birthday, then array order. Manual rank deliberately outranks birthday:
// birthdays are often unknown or only approximately known, and forcing
// known-birthday siblings to always sort first (regardless of a manually
// recorded age order) was the previous, less useful behavior.

export function parseBirthdayForSort(birthday) {
  if (!birthday || typeof birthday !== 'string') return null;
  const trimmed = birthday.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  const time = new Date(trimmed).getTime();
  return Number.isNaN(time) ? null : time;
}

function siblingOrderValue(datum) {
  const order = datum.data?.sibling_order;
  return typeof order === 'number' && Number.isFinite(order) ? order : null;
}

// Receives raw Datum records (see src/layout/calculate-tree.ts's
// `children.sort(sortChildrenFunction)`), not TreeDatum tree nodes - so
// birthday/sibling_order live at a.data.*, one level shallower than
// card-rendering code that walks TreeDatum.data.data.
export function sortChildren(a, b) {
  const aOrder = siblingOrderValue(a);
  const bOrder = siblingOrderValue(b);
  if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
  if (aOrder !== null) return -1; // an explicit manual rank always wins
  if (bOrder !== null) return 1;

  const aTime = parseBirthdayForSort(a.data?.birthday);
  const bTime = parseBirthdayForSort(b.data?.birthday);
  if (aTime !== null && bTime !== null) return aTime - bTime;
  if (aTime !== null) return -1;
  if (bTime !== null) return 1;
  return 0;
}

/**
 * `parentId`'s children, in current display order (per sortChildren above).
 * Used to seed the "Sort children" dialog's reorderable list.
 *
 * @param {import('../src/types/data').Data} data
 * @param {string} parentId
 * @returns {import('../src/types/data').Datum[]}
 */
export function getChildrenForSort(data, parentId) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const parent = byId.get(parentId);
  if (!parent) return [];
  return [...(parent.rels.children || [])]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort(sortChildren);
}

/**
 * Persists a manual order for `parentId`'s children: every id in
 * `orderedChildIds` that's actually one of `parentId`'s children gets
 * data.sibling_order set to its position (0, 1, 2, ...), so future sorts
 * reproduce this order regardless of birthday. Ids that aren't recognized as
 * children of `parentId` are ignored (defensive against stale dialog state).
 *
 * @param {import('../src/types/data').Data} data
 * @param {string} parentId
 * @param {string[]} orderedChildIds
 * @returns {boolean} whether an order was actually persisted
 */
export function applyChildrenOrder(data, parentId, orderedChildIds) {
  const byId = new Map(data.map((d) => [d.id, d]));
  const parent = byId.get(parentId);
  if (!parent) return false;

  const validIds = new Set(parent.rels.children || []);
  const orderedValidIds = orderedChildIds.filter((id) => validIds.has(id));
  if (orderedValidIds.length < 2) return false;

  orderedValidIds.forEach((id, index) => {
    const child = byId.get(id);
    if (child) child.data.sibling_order = index;
  });
  return true;
}
