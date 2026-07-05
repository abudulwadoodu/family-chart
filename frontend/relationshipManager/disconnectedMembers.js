// Pure filtering/sorting for the Relationship Manager's left panel.
// "Disconnected" is defined as zero relationships of any kind (no parents,
// children, or spouses) - a stricter bar than allNodesGraph.js's connected-
// component analysis (which would also flag small linked islands). This
// module intentionally does not reuse getConnectedComponents for that reason.
import { toLabel } from '../relationshipDialog.js';

function birthYear(datum) {
  const raw = datum?.data?.birthday;
  if (!raw) return null;
  const year = new Date(raw).getFullYear();
  return Number.isNaN(year) ? null : year;
}

export function isDisconnected(datum) {
  const rels = datum?.rels || {};
  return (rels.parents || []).length === 0 && (rels.children || []).length === 0 && (rels.spouses || []).length === 0;
}

export function getDisconnectedMembers(data) {
  return (Array.isArray(data) ? data : []).filter(isDisconnected);
}

// Short "Parent of Ahmed Khan; Spouse of Fatima Khan" style summary for an
// already-connected member's row, naming the actual relatives (same
// toLabel() convention as the right panel's spouse badge in
// treeHierarchyPanel.js) rather than just counting them - this is what makes
// an unnamed-but-connected member identifiable in "show all members" mode.
// `byId` is a Map<id, Datum> over the full tree, needed to resolve relative
// names; falls back to a bare count if a relative id can't be resolved
// (defensive - shouldn't happen with well-formed data).
export function relationSummary(datum, byId) {
  const rels = datum?.rels || {};
  const parents = (rels.parents || []).map((id) => byId?.get(id)).filter(Boolean);
  const children = (rels.children || []).map((id) => byId?.get(id)).filter(Boolean);
  const spouses = (rels.spouses || []).map((id) => byId?.get(id)).filter(Boolean);

  const parts = [];
  if (parents.length) parts.push(`Child of ${parents.map(toLabel).join(', ')}`);
  if (children.length) parts.push(`Parent of ${children.map(toLabel).join(', ')}`);
  if (spouses.length) parts.push(`Spouse of ${spouses.map(toLabel).join(', ')}`);
  return parts.join('; ');
}

export function sortDisconnected(list, mode, recentIds = []) {
  const items = [...list];
  if (mode === 'recent') {
    const recentIndex = new Map(recentIds.map((id, i) => [id, i]));
    return items.sort((a, b) => {
      const ai = recentIndex.has(a.id) ? recentIndex.get(a.id) : Infinity;
      const bi = recentIndex.has(b.id) ? recentIndex.get(b.id) : Infinity;
      if (ai !== bi) return ai - bi;
      return toLabel(a).localeCompare(toLabel(b));
    });
  }
  if (mode === 'birthYear') {
    return items.sort((a, b) => {
      const ay = birthYear(a);
      const by = birthYear(b);
      if (ay === by) return toLabel(a).localeCompare(toLabel(b));
      if (ay === null) return 1;
      if (by === null) return -1;
      return ay - by;
    });
  }
  return items.sort((a, b) => toLabel(a).localeCompare(toLabel(b)));
}
