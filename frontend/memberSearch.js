// Search helpers for the "Search Member" feature. Kept isolated from
// main.js and from the family-chart library so the matching/ranking logic
// can be tested and tuned independently of the UI wiring.

function getLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum?.id ?? '');
}

// Build once per search session (e.g. on input focus) and reuse across
// keystrokes, rather than recomputing labels/lowercasing on every keystroke.
export function buildMemberSearchIndex(data) {
  return (Array.isArray(data) ? data : []).map((d) => {
    const label = getLabel(d);
    return { id: d.id, label, normalized: label.toLowerCase() };
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
