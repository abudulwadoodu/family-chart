// Pure filtering/sorting for the Relationship Manager's left panel.
// "Disconnected" is defined as zero relationships of any kind (no parents,
// children, or spouses) - a stricter bar than allNodesGraph.js's connected-
// component analysis (which would also flag small linked islands). This
// module intentionally does not reuse getConnectedComponents for that reason.

function toLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum?.id ?? '');
}

function birthYear(datum) {
  const raw = datum?.data?.birthday;
  if (!raw) return null;
  const year = new Date(raw).getFullYear();
  return Number.isNaN(year) ? null : year;
}

export function getDisconnectedMembers(data) {
  return (Array.isArray(data) ? data : []).filter((d) => {
    const rels = d.rels || {};
    return (rels.parents || []).length === 0 && (rels.children || []).length === 0 && (rels.spouses || []).length === 0;
  });
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
