// CsvParser: pure text -> {headers, rows} syntax layer. Knows nothing about
// the app's domain model or which columns mean what - that's csv/mapper.js's
// job, mirroring the gedcom/ module's parser/mapper split.
import { resolveLegacyHeader } from '../importLegacy.js';

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

export function parseCsvText(csvText) {
  if (!csvText || !csvText.trim()) {
    throw new Error('CSV file is empty');
  }

  const rawLines = csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length < 2) throw new Error('CSV must include header + at least one row');

  const headers = parseCsvLine(rawLines[0]).map((h) => resolveLegacyHeader(h.toLowerCase()));
  const rows = rawLines.slice(1).map((line, i) => ({ lineNo: i + 2, cols: parseCsvLine(line) }));

  return { headers, rows };
}
