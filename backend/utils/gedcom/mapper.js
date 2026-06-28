// GedcomMapper: translates between parsed GEDCOM records and this app's
// domain model ({id, data, rels}). This is the only file that knows about
// both worlds - GedcomParser/GedcomValidator know nothing about the app,
// and GedcomWriter knows nothing about GEDCOM record trees, only about the
// {individuals, families} shape produced by domainToGedcomRecords below.
import { findChild, findChildren, childValue } from './parser.js';
import { MAPPED_INDI_CHILD_TAGS } from './constants.js';

function addUnique(arr, value) {
  if (!arr || !value) return;
  if (!arr.includes(value)) arr.push(value);
}

function splitName(nameValue) {
  if (!nameValue) return { first: '', last: '' };
  const match = nameValue.match(/^([^/]*)\/([^/]*)\/?\s*(.*)$/);
  if (match) {
    const first = match[1].trim() || match[3].trim();
    const last = match[2].trim();
    return { first, last };
  }
  return { first: nameValue.trim(), last: '' };
}

function mapGender(sexValue) {
  const value = (sexValue || '').trim().toUpperCase();
  if (value === 'M') return 'M';
  if (value === 'F') return 'F';
  return 'U';
}

function eventFields(indi, tag) {
  const event = findChild(indi, tag);
  if (!event) return null;
  return {
    date: childValue(event, 'DATE') || '',
    place: childValue(event, 'PLAC') || '',
  };
}

/**
 * Converts parsed GEDCOM records into the app's {id, data, rels} array.
 * Unknown INDI tags are preserved in data.gedcom_custom instead of being
 * dropped; everything recoverable is reported as a warning, never an error.
 */
export function gedcomToDomain(records, options = {}) {
  const { importNotes = true, importUnsupportedAsNotes = false } = options;
  const warnings = [];

  const indis = records.filter((r) => r.tag === 'INDI');
  const fams = records.filter((r) => r.tag === 'FAM');

  // idMap resolves a gedcom xrefId to the app id used for FAM pointer
  // resolution - only the first INDI record seen for a given xrefId claims
  // that slot. A later INDI record reusing the same xrefId (a malformed,
  // duplicate-identifier file) still gets its own renamed app id and is
  // fully preserved as a separate person; it's just not reachable via
  // pointers to that xrefId (there's no way to know which one a reference
  // "meant").
  const idMap = new Map();
  const usedIds = new Set();
  const peopleById = new Map();

  const registerAppId = (xrefId, baseId) => {
    let appId = baseId;
    let n = 1;
    while (usedIds.has(appId)) {
      appId = `${baseId}_${n++}`;
    }
    usedIds.add(appId);
    if (idMap.has(xrefId)) {
      warnings.push({
        code: 'DUPLICATE_XREF_RENAMED',
        message: `Duplicate identifier "@${xrefId}@" was renamed to "${appId}"; relationship references to "@${xrefId}@" resolve to the first occurrence`,
      });
    } else {
      idMap.set(xrefId, appId);
    }
    return appId;
  };

  for (const indi of indis) {
    if (!indi.xrefId) {
      warnings.push({ code: 'SKIPPED_RECORD', message: 'An INDI record without an identifier was skipped' });
      continue;
    }

    const appIdTag = indi.children.find((c) => c.tag === '_APPID');
    const baseId = appIdTag?.value?.trim() || `gedcom_${indi.xrefId}`;
    const appId = registerAppId(indi.xrefId, baseId);

    const { first, last } = splitName(childValue(indi, 'NAME'));
    const birth = eventFields(indi, 'BIRT');
    const death = eventFields(indi, 'DEAT');

    const data = {
      'first name': first,
      'last name': last,
      gender: mapGender(childValue(indi, 'SEX')),
      birthday: birth?.date || '',
      location: birth?.place || '',
    };
    if (death) {
      data.death = death.date || 'Y';
      if (death.place) data.deathPlace = death.place;
    }

    if (importNotes) {
      const notes = findChildren(indi, 'NOTE')
        .map((n) => n.value)
        .filter(Boolean);
      if (notes.length) data.notes = notes.join('\n\n');
    }

    const unsupported = indi.children.filter((child) => !MAPPED_INDI_CHILD_TAGS.has(child.tag));
    if (unsupported.length) {
      data.gedcom_custom = unsupported.map((c) => ({ tag: c.tag, value: c.value || '' }));
      warnings.push({
        code: 'UNSUPPORTED_TAG',
        message: `Unsupported tag(s) on INDI "@${indi.xrefId}@" were preserved but not imported as structured fields: ${unsupported.map((c) => c.tag).join(', ')}`,
      });
      if (importUnsupportedAsNotes) {
        const extra = unsupported.map((c) => `${c.tag}: ${c.value || ''}`).join('\n');
        data.notes = data.notes ? `${data.notes}\n\n${extra}` : extra;
      }
    }

    peopleById.set(appId, { id: appId, data, rels: { parents: [], children: [], spouses: [] } });
  }

  for (const fam of fams) {
    const husbPtr = findChild(fam, 'HUSB')?.pointer;
    const wifePtr = findChild(fam, 'WIFE')?.pointer;
    const childPtrs = findChildren(fam, 'CHIL')
      .map((c) => c.pointer)
      .filter(Boolean);

    const husbId = husbPtr ? idMap.get(husbPtr) : null;
    const wifeId = wifePtr ? idMap.get(wifePtr) : null;
    if (husbPtr && !husbId) warnings.push({ code: 'BROKEN_REFERENCE', message: `FAM "@${fam.xrefId}@" HUSB "@${husbPtr}@" was not found among individuals` });
    if (wifePtr && !wifeId) warnings.push({ code: 'BROKEN_REFERENCE', message: `FAM "@${fam.xrefId}@" WIFE "@${wifePtr}@" was not found among individuals` });

    if (husbId && wifeId) {
      addUnique(peopleById.get(husbId)?.rels.spouses, wifeId);
      addUnique(peopleById.get(wifeId)?.rels.spouses, husbId);
    }

    for (const childPtr of childPtrs) {
      const childId = idMap.get(childPtr);
      if (!childId) {
        warnings.push({ code: 'BROKEN_REFERENCE', message: `FAM "@${fam.xrefId}@" CHIL "@${childPtr}@" was not found among individuals` });
        continue;
      }
      const childPerson = peopleById.get(childId);
      if (!childPerson) continue;
      [husbId, wifeId].filter(Boolean).forEach((parentId) => {
        addUnique(childPerson.rels.parents, parentId);
        addUnique(peopleById.get(parentId)?.rels.children, childId);
      });
    }
  }

  const people = Array.from(peopleById.values());
  for (const person of people) {
    if (person.rels.parents.length > 2) {
      warnings.push({
        code: 'TOO_MANY_PARENTS',
        message: `Individual "${person.id}" has more than 2 parents; all links were kept but the tree view expects at most 2`,
      });
    }
  }

  return {
    people,
    summary: { individuals: indis.length, families: fams.length },
    warnings,
  };
}

/**
 * Reverse mapping for export: turns the app's people array into the
 * {individuals, families} shape GedcomWriter consumes. Family groupings
 * don't exist in the app's domain model (only per-person parents/spouses/
 * children), so they're synthesized here - one FAM per distinct spouse pair
 * (supports multiple marriages) and one FAM per distinct parent-pair
 * (supports siblings sharing exactly the same two parents).
 */
export function domainToGedcomRecords(people, options = {}) {
  const { includeNotes = true, includePrivate = true, includeDeceased = true, includeLiving = true } = options;

  const byId = new Map(people.map((p) => [p.id, p]));
  const filtered = people.filter((p) => {
    const data = p.data || {};
    if (!includePrivate && data.private) return false;
    const deceased = Boolean(data.death);
    if (deceased && !includeDeceased) return false;
    if (!deceased && !includeLiving) return false;
    return true;
  });
  const includedIds = new Set(filtered.map((p) => p.id));

  const indiXref = new Map();
  filtered.forEach((p, i) => indiXref.set(p.id, i + 1));

  // A couple is keyed by its sorted member id(s) regardless of whether it
  // was discovered via a spouse link or via a shared parent-pair, so the
  // same two partners always collapse into exactly one FAM record even if
  // they have children together.
  const famByKey = new Map();
  const coupleKey = (ids) => `couple::${[...new Set(ids)].filter(Boolean).sort().join('+')}`;
  const getOrCreateFam = (key, husbId, wifeId) => {
    if (!famByKey.has(key)) {
      famByKey.set(key, { husbId: husbId || null, wifeId: wifeId || null, childIds: [] });
    }
    return famByKey.get(key);
  };
  const pickHusbWife = (idA, idB) => {
    const a = byId.get(idA);
    const b = idB ? byId.get(idB) : null;
    if (a?.data?.gender === 'M') return { husbId: idA, wifeId: idB || null };
    if (b?.data?.gender === 'M') return { husbId: idB, wifeId: idA };
    return { husbId: idA, wifeId: idB || null };
  };

  for (const person of filtered) {
    const spouses = (person.rels?.spouses || []).filter((id) => includedIds.has(id));
    for (const spouseId of spouses) {
      const key = coupleKey([person.id, spouseId]);
      if (famByKey.has(key)) continue;
      const { husbId, wifeId } = pickHusbWife(person.id, spouseId);
      getOrCreateFam(key, husbId, wifeId);
    }
  }

  for (const person of filtered) {
    const parents = (person.rels?.parents || []).filter((id) => includedIds.has(id));
    if (parents.length === 0) continue;
    const sortedParents = [...parents].sort();
    const key = coupleKey(sortedParents);
    let fam = famByKey.get(key);
    if (!fam) {
      const { husbId, wifeId } = pickHusbWife(sortedParents[0], sortedParents[1]);
      fam = getOrCreateFam(key, husbId, wifeId);
    }
    fam.childIds.push(person.id);
  }

  const famList = Array.from(famByKey.values());
  const famXref = new Map();
  famList.forEach((fam, i) => famXref.set(fam, i + 1));

  const individuals = filtered.map((person) => {
    const famsIds = famList.filter((f) => f.husbId === person.id || f.wifeId === person.id).map((f) => famXref.get(f));
    const famc = famList.find((f) => f.childIds.includes(person.id));
    return {
      xrefId: indiXref.get(person.id),
      person,
      famsIds,
      famcId: famc ? famXref.get(famc) : null,
      includeNotes,
    };
  });

  const families = famList.map((fam) => ({
    xrefId: famXref.get(fam),
    husbXref: fam.husbId ? indiXref.get(fam.husbId) : null,
    wifeXref: fam.wifeId ? indiXref.get(fam.wifeId) : null,
    childXrefs: fam.childIds.map((id) => indiXref.get(id)).filter(Boolean),
  }));

  return { individuals, families };
}
