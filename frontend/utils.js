export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatRelativeTime(isoString) {
  if (!isoString) return 'Unknown';
  const date = new Date(`${isoString.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return 'Unknown';

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
