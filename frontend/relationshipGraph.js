// Client-side relationship graph traversal - powers the Relationship Finder
// search tool. Mirrors backend/utils/findRelationship.js exactly (same BFS +
// classification logic) since the frontend always computes against the tree
// data already fetched into state.selectedTreeData (see main.js), the same
// way memberSearch.js and the relationship/duplicate managers do, rather
// than importing across the frontend/backend boundary.
//
// Data shape (see docs/data-format.md):
//   { id, data: { gender: 'M'|'F'|..., 'first name', 'last name', ... },
//     rels: { parents: [id, id], spouses: [id], children: [id] } }

const GENDER_TERMS = {
  child: { M: 'son', F: 'daughter', default: 'child' },
  parent: { M: 'father', F: 'mother', default: 'parent' },
  sibling: { M: 'brother', F: 'sister', default: 'sibling' },
  'sibling-in-law': { M: 'brother-in-law', F: 'sister-in-law', default: 'sibling-in-law' },
  spouse: { M: 'husband', F: 'wife', default: 'spouse' },
  uncleAunt: { M: 'uncle', F: 'aunt', default: 'aunt/uncle' },
  nephewNiece: { M: 'nephew', F: 'niece', default: 'nephew/niece' },
  grandparent: { M: 'grandfather', F: 'grandmother', default: 'grandparent' },
  grandchild: { M: 'grandson', F: 'granddaughter', default: 'grandchild' },
  cousin: { M: 'cousin', F: 'cousin', default: 'cousin' },
};

function genderTerm(kind, gender) {
  const table = GENDER_TERMS[kind];
  if (!table) return kind;
  return table[gender] || table.default;
}

function byId(familyData) {
  const map = new Map();
  for (const person of familyData || []) map.set(String(person.id), person);
  return map;
}

function parentsOf(person) {
  return (person?.rels?.parents || []).map(String);
}

function childrenOf(person) {
  return (person?.rels?.children || []).map(String);
}

function spousesOf(person) {
  return (person?.rels?.spouses || []).map(String);
}

// Builds a BFS tree of "path steps" from startId to every reachable person,
// where each step is 'parent' | 'child' | 'spouse' (the edge taken to *reach*
// that person from its predecessor in the BFS tree). Traverses parents,
// children, and spouses so in-law / step connections are still found.
// Each entry also carries `nodeIds`, the actual chain of person ids from
// startId to that person, so callers can look up genders along the path
// instead of re-deriving (and potentially mis-deriving) it from steps alone.
function buildPaths(startId, peopleById) {
  const paths = new Map();
  paths.set(startId, { steps: [], nodeIds: [startId] });
  const queue = [startId];

  while (queue.length) {
    const currentId = queue.shift();
    const current = peopleById.get(currentId);
    if (!current) continue;
    const { steps: currentSteps, nodeIds: currentNodeIds } = paths.get(currentId);

    const neighbors = [
      ...parentsOf(current).map((id) => ({ id, step: 'parent' })),
      ...childrenOf(current).map((id) => ({ id, step: 'child' })),
      ...spousesOf(current).map((id) => ({ id, step: 'spouse' })),
    ];

    for (const { id, step } of neighbors) {
      if (paths.has(id)) continue;
      paths.set(id, { steps: [...currentSteps, step], nodeIds: [...currentNodeIds, id] });
      queue.push(id);
    }
  }

  return paths;
}

// Collapses a raw step sequence (e.g. ['parent','parent','child']) into a
// relationship descriptor used to pick a label.
function classifyPath(steps) {
  if (steps.length === 0) return { kind: 'self' };
  if (steps.length === 1 && steps[0] === 'spouse') return { kind: 'spouse' };

  // Strip a single leading and/or trailing spouse step (in-law relationships
  // read as "spouse's ancestor/descendant" or "ancestor/descendant's spouse"
  // depending on which direction we're describing), remember it happened.
  let inLaw = false;
  let core = steps;
  if (core[core.length - 1] === 'spouse') {
    inLaw = true;
    core = core.slice(0, -1);
  }
  if (core.length && core[0] === 'spouse') {
    inLaw = true;
    core = core.slice(1);
  }

  const upCount = core.filter((s) => s === 'parent').length;
  const downCount = core.filter((s) => s === 'child').length;
  const isPureUp = core.every((s) => s === 'parent');
  const isPureDown = core.every((s) => s === 'child');
  const isUpThenDown = !isPureUp && !isPureDown &&
    core.slice(0, upCount).every((s) => s === 'parent') &&
    core.slice(upCount).every((s) => s === 'child');

  if (isPureUp) return { kind: 'ancestor', ups: upCount, inLaw };
  if (isPureDown) return { kind: 'descendant', downs: downCount, inLaw };

  if (isUpThenDown) {
    if (upCount === 1 && downCount === 1) return { kind: 'sibling', inLaw };
    if (upCount === 2 && downCount === 1) return { kind: 'aunt-uncle', inLaw };
    if (upCount === 1 && downCount === 2) return { kind: 'nephew-niece', inLaw };
    if (upCount >= 2 && downCount >= 2) {
      // 1st cousin = 2 up, 2 down (shared grandparents); Nth cousin = N+1
      // up/down to the shared ancestor. Unequal up/down = "Nx removed".
      const cousinDegree = Math.min(upCount, downCount) - 2;
      const removed = Math.abs(upCount - downCount);
      return { kind: 'cousin', cousinDegree, removed, inLaw };
    }
    if (upCount >= 3 && downCount === 1) return { kind: 'grand-aunt-uncle', ups: upCount, inLaw };
    if (upCount === 1 && downCount >= 3) return { kind: 'grand-nephew-niece', downs: downCount, inLaw };
  }

  return { kind: 'related', steps: core, inLaw };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function greatPrefix(count) {
  if (count <= 0) return '';
  if (count === 1) return 'great-';
  return `${count}x-great-`;
}

// Produces a { short, descriptive } label pair for a classified path, using
// the described person's gender to pick M/F terms where applicable.
function describe(classification, gender) {
  const suffix = classification.inLaw ? '-in-law' : '';
  const inLawText = classification.inLaw ? ' (in-law)' : '';

  switch (classification.kind) {
    case 'self':
      return { short: 'Self', descriptive: 'This is the same person' };
    case 'spouse':
      return { short: genderTerm('spouse', gender), descriptive: 'Spouse' };
    case 'ancestor': {
      if (classification.ups === 1) {
        const term = genderTerm('parent', gender) + suffix;
        return { short: term, descriptive: term };
      }
      if (classification.ups === 2) {
        const term = genderTerm('grandparent', gender) + suffix;
        return { short: term, descriptive: term };
      }
      const greats = classification.ups - 2;
      const term = `${greatPrefix(greats)}grandparent${suffix}`;
      return { short: term, descriptive: term };
    }
    case 'descendant': {
      if (classification.downs === 1) {
        const term = genderTerm('child', gender) + suffix;
        return { short: term, descriptive: term };
      }
      if (classification.downs === 2) {
        const term = genderTerm('grandchild', gender) + suffix;
        return { short: term, descriptive: term };
      }
      const greats = classification.downs - 2;
      const term = `${greatPrefix(greats)}grandchild${suffix}`;
      return { short: term, descriptive: term };
    }
    case 'sibling': {
      const term = genderTerm('sibling', gender) + suffix;
      return { short: term, descriptive: term };
    }
    case 'aunt-uncle': {
      const term = genderTerm('uncleAunt', gender) + suffix;
      return { short: term, descriptive: term + inLawText };
    }
    case 'nephew-niece': {
      const term = genderTerm('nephewNiece', gender) + suffix;
      return { short: term, descriptive: term + inLawText };
    }
    case 'grand-aunt-uncle': {
      const greats = classification.ups - 3;
      const base = `${greatPrefix(greats) || 'grand-'}${genderTerm('uncleAunt', gender)}`;
      const term = `${base}${suffix}`;
      return { short: term, descriptive: term + inLawText };
    }
    case 'grand-nephew-niece': {
      const greats = classification.downs - 3;
      const base = `${greatPrefix(greats) || 'grand-'}${genderTerm('nephewNiece', gender)}`;
      const term = `${base}${suffix}`;
      return { short: term, descriptive: term + inLawText };
    }
    case 'cousin': {
      const degreeLabel = `${ordinal(classification.cousinDegree + 1)} cousin`;
      const removedLabel = classification.removed > 0
        ? ` ${classification.removed}x removed`
        : '';
      const term = `${degreeLabel}${removedLabel}${suffix}`;
      return { short: term, descriptive: term };
    }
    default:
      return { short: 'Extended relative', descriptive: 'Extended relative (relationship path is unusual)' };
  }
}

// Formats the compound descriptive string, e.g. "Mother's brother / Uncle".
// We don't have birth-order data to know "younger/older", so we build the
// step-by-step chain description plus the canonical short label.
function buildCompoundLabel(steps, nodes, targetGender) {
  const classification = classifyPath(steps);
  const { short } = describe(classification, targetGender);

  const chain = buildStepChain(steps, nodes);
  if (!chain || chain.toLowerCase() === short.toLowerCase()) {
    return capitalize(short);
  }
  return `${chain} / ${capitalize(short)}`;
}

// Reduces a raw step sequence into colloquial hops before it's rendered as
// text, so chains like "Father's daughter's son" (a hop back down to a
// sibling, then down again) read as "Sister's son" instead. Each hop tracks
// the step that produced it plus the gender of the person it lands on, so
// later hops can still be collapsed against earlier ones (e.g. a reduced
// "Grandfather" hop can itself take part in a further sibling collapse).
//
// Two rules, applied left-to-right and repeated until no more apply:
//   - parent, child (up to a parent, then back down to one of their other
//     children) collapses to a sibling term ("Brother"/"Sister") using the
//     gender of the person actually reached - the child, not the parent
//     hopped through. This can never fire on the root person themself: the
//     earliest a pair can start is hops[0], whose "parent" step already
//     lands one level above the root, so the root (nodes[0]) never becomes
//     a hop's person.
//   - parent, parent collapses to a grandparent term ("Grandfather"/
//     "Grandmother") using the gender of the person reached by the second
//     (final) step.
function reduceHops(steps, nodes) {
  const hops = steps.map((step, i) => ({ step, person: nodes[i + 1] }));
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i + 1 < hops.length; i++) {
      const a = hops[i];
      const b = hops[i + 1];

      if (a.step === 'parent' && b.step === 'child') {
        hops.splice(i, 2, { step: 'sibling', person: b.person });
        changed = true;
        break;
      }
      if (a.step === 'parent' && b.step === 'parent') {
        hops.splice(i, 2, { step: 'grandparent', person: b.person });
        changed = true;
        break;
      }
    }
  }

  return hops;
}

function hopTerm(hop) {
  const gender = hop.person?.data?.gender;
  if (hop.step === 'sibling') return genderTerm('sibling', gender);
  if (hop.step === 'grandparent') return genderTerm('grandparent', gender);
  if (hop.step === 'parent') return genderTerm('parent', gender);
  if (hop.step === 'child') return genderTerm('child', gender);
  return genderTerm('spouse', gender);
}

// Builds a plain-language chain like "Mother's brother" (or, after
// reduction, "Sister's son" instead of "Father's daughter's son") by walking
// the actual sequence of people resolved during BFS (nodes[0] is the start
// person, nodes[i+1] is who you reach after steps[i]).
function buildStepChain(steps, nodes) {
  if (steps.length === 0) return null;

  const hops = reduceHops(steps, nodes);
  const parts = hops.map(hopTerm);
  const chain = parts.reduce((acc, part, i) => (i === 0 ? part : `${acc}'s ${part}`), '');
  return capitalize(chain);
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function invertSteps(steps) {
  return [...steps].reverse().map((step) => {
    if (step === 'parent') return 'child';
    if (step === 'child') return 'parent';
    return 'spouse';
  });
}

/**
 * Finds and describes the relationship between two people in a family tree.
 *
 * @param {string|number} rootUserId - the "from" person (usually the signed-in member)
 * @param {string|number} targetUserId - the person being looked up
 * @param {Array} familyData - array of person records (see docs/data-format.md)
 * @returns {{
 *   found: boolean,
 *   distance: number,
 *   path: string[],
 *   rootToTarget: { label: string, short: string },
 *   targetToRoot: { label: string, short: string },
 * }}
 */
export function getRelationshipPath(rootUserId, targetUserId, familyData) {
  const rootId = String(rootUserId);
  const targetId = String(targetUserId);
  const peopleById = byId(familyData);

  if (!peopleById.has(rootId) || !peopleById.has(targetId)) {
    return {
      found: false,
      distance: -1,
      path: [],
      rootToTarget: { label: 'Unknown', short: 'Unknown' },
      targetToRoot: { label: 'Unknown', short: 'Unknown' },
    };
  }

  if (rootId === targetId) {
    return {
      found: true,
      distance: 0,
      path: [],
      rootToTarget: { label: 'Self', short: 'Self' },
      targetToRoot: { label: 'Self', short: 'Self' },
    };
  }

  const pathsFromRoot = buildPaths(rootId, peopleById);
  const forward = pathsFromRoot.get(targetId);

  if (!forward) {
    return {
      found: false,
      distance: -1,
      path: [],
      rootToTarget: { label: 'Not related (no connecting path found)', short: 'Unrelated' },
      targetToRoot: { label: 'Not related (no connecting path found)', short: 'Unrelated' },
    };
  }

  const targetPerson = peopleById.get(targetId);
  const rootPerson = peopleById.get(rootId);
  const forwardNodes = forward.nodeIds.map((id) => peopleById.get(id));
  const reverseNodes = [...forwardNodes].reverse();
  const inverseSteps = invertSteps(forward.steps);

  // "Their relation to you": how the target is related to the root.
  const rootToTargetLabel = buildCompoundLabel(forward.steps, forwardNodes, targetPerson?.data?.gender);
  const rootToTargetShort = describe(classifyPath(forward.steps), targetPerson?.data?.gender).short;

  // "Your relation to them": invert the step sequence (parent <-> child
  // swap; spouse stays spouse) and walk the same chain of people in reverse
  // order, starting from the target.
  const targetToRootLabel = buildCompoundLabel(inverseSteps, reverseNodes, rootPerson?.data?.gender);
  const targetToRootShort = describe(classifyPath(inverseSteps), rootPerson?.data?.gender).short;

  return {
    found: true,
    distance: forward.steps.length,
    path: forward.steps,
    rootToTarget: { label: rootToTargetLabel, short: capitalize(rootToTargetShort) },
    targetToRoot: { label: targetToRootLabel, short: capitalize(targetToRootShort) },
  };
}
