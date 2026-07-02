// Shared cycle detection for parent/child links, used by both the CSV and
// JSON importers so GEDCOM's DFS approach (see gedcom/validator.js) isn't
// copy-pasted a second and third time. Warnings only - per the "continue
// importing valid records" policy, a cycle never blocks import, it's just
// flagged so the user can go fix the source data.
export function detectCircularParents(peopleById) {
  const warnings = [];
  const visiting = new Set();
  const visited = new Set();
  const flagged = new Set();

  const childrenOf = new Map();
  for (const person of peopleById.values()) {
    for (const parentId of person.rels?.parents || []) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, new Set());
      childrenOf.get(parentId).add(person.id);
    }
  }

  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      if (!flagged.has(id)) {
        flagged.add(id);
        warnings.push({ code: 'CIRCULAR_REFERENCE', message: `Circular parent/child reference detected involving "${id}"` });
      }
      return;
    }
    visiting.add(id);
    for (const childId of childrenOf.get(id) || []) visit(childId);
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of childrenOf.keys()) visit(id);

  return warnings;
}
