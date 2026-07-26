// Search helpers for the "Search Member" feature. Kept isolated from
// main.js and from the family-chart library so the matching/ranking logic
// can be tested and tuned independently of the UI wiring.

export function getLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum?.id ?? '');
}

// Short "Parent of Ahmed Khan; Spouse of Fatima Khan" style summary for a
// member, naming their actual close relatives rather than just counting
// them. `byId` is a Map<id, Datum> over the full tree, needed to resolve
// relative names; falls back to omitting a relative id that can't be
// resolved (defensive - shouldn't happen with well-formed data).
export function getRelativesSummary(datum, byId) {
  const rels = datum?.rels || {};
  const parents = (rels.parents || []).map((id) => byId?.get(id)).filter(Boolean);
  const children = (rels.children || []).map((id) => byId?.get(id)).filter(Boolean);
  const spouses = (rels.spouses || []).map((id) => byId?.get(id)).filter(Boolean);

  const parts = [];
  if (parents.length) parts.push(`Child of ${parents.map(getLabel).join(', ')}`);
  if (children.length) parts.push(`Parent of ${children.map(getLabel).join(', ')}`);
  if (spouses.length) parts.push(`Spouse of ${spouses.map(getLabel).join(', ')}`);
  return parts.join('; ');
}

// Build once per search session (e.g. on input focus) and reuse across
// keystrokes, rather than recomputing labels/lowercasing on every keystroke.
// `normalized` folds in notes text alongside the name so a nickname that's
// only ever been written in someone's notes is still findable by search.
export function buildMemberSearchIndex(data) {
  return (Array.isArray(data) ? data : []).map((d) => {
    const label = getLabel(d);
    const notes = d?.data?.notes || '';
    const normalized = `${label} ${notes}`.toLowerCase();
    return { id: d.id, label, normalized };
  });
}

// Simple substring search ranked by match position (startsWith first), then
// alphabetically. O(n) over the pre-normalized index - fast enough for
// thousands of members since it's a single indexOf per entry.
export function searchMembers(index, query, limit = 30) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const startsWith = [];
  const includes = [];
  for (const entry of index) {
    const at = entry.normalized.indexOf(q);
    if (at === -1) continue;
    (at === 0 ? startsWith : includes).push(entry);
  }

  const byLabel = (a, b) => a.label.localeCompare(b.label);
  startsWith.sort(byLabel);
  includes.sort(byLabel);

  return [...startsWith, ...includes].slice(0, limit);
}
