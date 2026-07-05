// Heuristic "smart suggestions" for the Relationship Manager's target-search
// step. Deliberately a single pure function with no state and no knowledge
// of the UI - this is the swap seam called out in requirements.md so a
// future AI-backed matcher can replace the body without touching call sites
// (builderPanel.js has the only caller). Mirrors the documented no-op-seam
// style already used by relationshipValidator.js's validateGenderConstraints.

function getLabel(datum) {
  const first = datum?.data?.['first name'] || '';
  const last = datum?.data?.['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || String(datum?.id ?? '');
}

function getLastName(datum) {
  return (datum?.data?.['last name'] || '').trim().toLowerCase();
}

function getBirthYear(datum) {
  const raw = datum?.data?.birthday;
  if (!raw) return null;
  const year = new Date(raw).getFullYear();
  return Number.isNaN(year) ? null : year;
}

/**
 * @param {import('../../src/types/data').Datum} candidate the disconnected person being connected
 * @param {import('../../src/types/data').Data} data the full tree
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ id: string, label: string, score: number, reasons: string[] }>}
 */
export function suggestMatches(candidate, data, { limit = 5 } = {}) {
  if (!candidate) return [];
  const candidateLastName = getLastName(candidate);
  const candidateYear = getBirthYear(candidate);

  const scored = (Array.isArray(data) ? data : [])
    .filter((d) => d.id !== candidate.id)
    .map((d) => {
      let score = 0;
      const reasons = [];

      const lastName = getLastName(d);
      if (candidateLastName && lastName && lastName === candidateLastName) {
        score += 3;
        reasons.push('Same surname');
      }

      const year = getBirthYear(d);
      if (candidateYear !== null && year !== null) {
        const diff = Math.abs(year - candidateYear);
        if (diff <= 3) {
          score += 2;
          reasons.push('Similar birth year');
        } else if (diff >= 18 && diff <= 45) {
          score += 1;
          reasons.push('Plausible parent/child age gap');
        }
      }

      if ((d.rels?.parents || []).length === 0) {
        score += 1;
        reasons.push('Missing parents');
      }

      if ((d.rels?.spouses || []).length > 0) {
        reasons.push('Existing spouse');
      }

      return { id: d.id, label: getLabel(d), score, reasons };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return scored.slice(0, limit);
}
