// GedcomValidator: structural and referential checks over a parsed GEDCOM
// document. Only truly unrecoverable problems ("nothing to import") become
// errors - everything else (missing HEAD/TRLR, dangling references, unknown
// tag versions, circular parent/child links) is reported as a warning so
// import can proceed, per "show warnings instead of failing whenever possible".
import { findChild, findChildren } from './parser.js';

export function validateGedcom(records) {
  const errors = [];
  const warnings = [];

  const head = records.find((r) => r.tag === 'HEAD');
  const trlr = records.find((r) => r.tag === 'TRLR');
  if (!head) warnings.push({ code: 'MISSING_HEAD', message: 'File has no HEAD record' });
  if (!trlr) warnings.push({ code: 'MISSING_TRLR', message: 'File has no TRLR record' });

  if (head) {
    const vers = findChild(findChild(head, 'GEDC'), 'VERS')?.value?.trim();
    if (vers && vers !== '5.5.1') {
      warnings.push({
        code: 'UNSUPPORTED_VERSION',
        message: `GEDCOM version "${vers}" is not 5.5.1; parsing will proceed on a best-effort basis`,
      });
    }
  }

  const indis = records.filter((r) => r.tag === 'INDI');
  const fams = records.filter((r) => r.tag === 'FAM');

  if (indis.length === 0 && fams.length === 0) {
    errors.push({ code: 'NO_RECORDS', message: 'File contains no INDI or FAM records' });
    return { errors, warnings };
  }

  const seenXrefs = new Set();
  for (const record of [...indis, ...fams]) {
    if (!record.xrefId) {
      warnings.push({ code: 'MISSING_XREF', message: `${record.tag} record has no identifier and will be skipped` });
      continue;
    }
    if (seenXrefs.has(record.xrefId)) {
      warnings.push({ code: 'DUPLICATE_XREF', message: `Duplicate identifier "@${record.xrefId}@" found; later record will be renamed on import` });
    }
    seenXrefs.add(record.xrefId);
  }

  const indiIds = new Set(indis.map((r) => r.xrefId).filter(Boolean));
  const famIds = new Set(fams.map((r) => r.xrefId).filter(Boolean));

  for (const fam of fams) {
    for (const tag of ['HUSB', 'WIFE', 'CHIL']) {
      for (const child of findChildren(fam, tag)) {
        if (child.pointer && !indiIds.has(child.pointer)) {
          warnings.push({
            code: 'BROKEN_REFERENCE',
            message: `FAM "@${fam.xrefId}@" references missing individual "@${child.pointer}@" via ${tag}`,
          });
        }
      }
    }
  }

  for (const indi of indis) {
    for (const tag of ['FAMC', 'FAMS']) {
      for (const child of findChildren(indi, tag)) {
        if (child.pointer && !famIds.has(child.pointer)) {
          warnings.push({
            code: 'BROKEN_REFERENCE',
            message: `INDI "@${indi.xrefId}@" references missing family "@${child.pointer}@" via ${tag}`,
          });
        }
      }
    }
  }

  detectCircularReferences(fams, warnings);

  return { errors, warnings };
}

function detectCircularReferences(fams, warnings) {
  const childrenOf = new Map();
  for (const fam of fams) {
    const parents = ['HUSB', 'WIFE']
      .flatMap((tag) => findChildren(fam, tag).map((c) => c.pointer))
      .filter(Boolean);
    const kids = findChildren(fam, 'CHIL')
      .map((c) => c.pointer)
      .filter(Boolean);
    for (const parentId of parents) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, new Set());
      kids.forEach((childId) => childrenOf.get(parentId).add(childId));
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const flagged = new Set();

  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      if (!flagged.has(id)) {
        flagged.add(id);
        warnings.push({ code: 'CIRCULAR_REFERENCE', message: `Circular parent/child reference detected involving "@${id}@"` });
      }
      return;
    }
    visiting.add(id);
    for (const childId of childrenOf.get(id) || []) visit(childId);
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of childrenOf.keys()) visit(id);
}
