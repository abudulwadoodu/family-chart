import { buildCsvText } from './csvTemplate.js';

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatRelativeTime(isoString) {
  if (!isoString) return 'Last updated: Unknown';
  const date = new Date(`${isoString.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return 'Last updated: Unknown';

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 30) return 'Updated just now';
  if (diffSec < 60) return `Updated ${diffSec}s ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin} min${diffMin === 1 ? '' : 's'} ago`;

  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `Updated ${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;

  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `Updated ${diffDay} day${diffDay === 1 ? '' : 's'} ago`;

  const diffWeek = Math.round(diffDay / 7);
  if (diffDay < 30) return `Updated ${diffWeek} week${diffWeek === 1 ? '' : 's'} ago`;

  return `Updated on ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
}

export function slugifyFilename(name) {
  return (
    String(name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'family-tree'
  );
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

// Inverse of the CSV import format (see frontend/csvTemplate.js's CSV_HEADER).
// Prefers data.fatherId/motherId (set on import so relationships round-trip
// exactly) and only falls back to a gender-based heuristic split of
// rels.parents when those hints are absent - e.g. people imported via
// GEDCOM, which never sets fatherId/motherId.
export function treeDataToCsv(people) {
  const byId = new Map(people.map((person) => [person.id, person]));

  const rows = people.map((person) => {
    const data = person.data || {};
    const rels = person.rels || {};
    const parents = rels.parents || [];

    let fatherId = data.fatherId || '';
    let motherId = data.motherId || '';
    if (!fatherId && !motherId && parents.length > 0) {
      fatherId = parents.find((id) => byId.get(id)?.data?.gender === 'M') || '';
      motherId = parents.find((id) => id !== fatherId && byId.get(id)?.data?.gender === 'F') || parents.find((id) => id !== fatherId) || '';
    }

    const isLiving = typeof data.isLiving === 'boolean' ? data.isLiving : !data.death;

    return [
      person.id,
      data['first name'] || '',
      data.middleName || '',
      data['last name'] || '',
      data.gender || '',
      data.birthday || '',
      data.location || '',
      data.death && data.death !== 'Y' ? data.death : '',
      data.deathPlace || '',
      isLiving ? 'TRUE' : 'FALSE',
      data.avatar || '',
      data.occupation || '',
      data.email || '',
      data.phone || '',
      data.notes || '',
      fatherId,
      motherId,
      (rels.spouses || []).join(';'),
    ];
  });

  return buildCsvText(rows);
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
