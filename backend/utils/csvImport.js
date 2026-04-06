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

function splitIds(value) {
  if (!value) return [];
  return String(value)
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean);
}

function addUnique(arr, value) {
  if (!value) return;
  if (!arr.includes(value)) arr.push(value);
}

export function parseCsvImport(csvText) {
  if (!csvText || !csvText.trim()) {
    throw new Error('CSV file is empty');
  }

  const rawLines = csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length < 2) throw new Error('CSV must include header + at least one row');

  const headers = parseCsvLine(rawLines[0]).map((h) => h.toLowerCase());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const required = ['id', 'first_name'];
  const missing = required.filter((k) => idx[k] === undefined);
  if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(', ')}`);

  const rows = rawLines.slice(1).map((line, lineNoOffset) => {
    const cols = parseCsvLine(line);
    const get = (key) => (idx[key] === undefined ? '' : String(cols[idx[key]] || '').trim());
    const id = get('id');
    if (!id) throw new Error(`Row ${lineNoOffset + 2}: id is required`);
    return {
      lineNo: lineNoOffset + 2,
      id,
      first_name: get('first_name'),
      last_name: get('last_name'),
      birthday: get('birthday'),
      location: get('location'),
      notes: get('notes'),
      avatar: get('avatar'),
      gender: get('gender'),
      father_id: get('father_id'),
      mother_id: get('mother_id'),
      spouse_ids: splitIds(get('spouse_ids')),
      child_ids: splitIds(get('child_ids')),
    };
  });

  const ids = new Set();
  for (const r of rows) {
    if (!r.first_name) throw new Error(`Row ${r.lineNo}: first_name is required`);
    if (ids.has(r.id)) throw new Error(`Duplicate id found: ${r.id}`);
    ids.add(r.id);
  }

  const byId = new Map();
  rows.forEach((r) => {
    byId.set(r.id, {
      id: r.id,
      data: {
        'first name': r.first_name,
        'last name': r.last_name || '',
        birthday: r.birthday || '',
        location: r.location || '',
        notes: r.notes || '',
        avatar: r.avatar || '',
        gender: r.gender || '',
      },
      rels: { parents: [], children: [], spouses: [] },
    });
  });

  const ensureExists = (refId, sourceId, relType) => {
    if (!refId) return;
    if (!byId.has(refId)) {
      throw new Error(`Unknown ${relType} id "${refId}" referenced by "${sourceId}"`);
    }
  };

  for (const r of rows) {
    const person = byId.get(r.id);
    const parentIds = [r.father_id, r.mother_id].filter(Boolean);
    parentIds.forEach((pid) => {
      ensureExists(pid, r.id, 'parent');
      addUnique(person.rels.parents, pid);
      const parent = byId.get(pid);
      addUnique(parent.rels.children, r.id);
    });

    r.spouse_ids.forEach((sid) => {
      ensureExists(sid, r.id, 'spouse');
      addUnique(person.rels.spouses, sid);
      const spouse = byId.get(sid);
      addUnique(spouse.rels.spouses, r.id);
    });

    r.child_ids.forEach((cid) => {
      ensureExists(cid, r.id, 'child');
      addUnique(person.rels.children, cid);
      const child = byId.get(cid);
      addUnique(child.rels.parents, r.id);
    });
  }

  for (const d of byId.values()) {
    if (d.rels.parents.length > 2) {
      throw new Error(`Person "${d.id}" has more than 2 parents after import`);
    }
  }

  return Array.from(byId.values());
}
