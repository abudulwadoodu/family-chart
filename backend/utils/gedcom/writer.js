// GedcomWriter: serializes the app's domain model to GEDCOM 5.5.1 text.
// No npm package on the registry does GEDCOM writing, so this is hand-built;
// it only depends on the {individuals, families} shape produced by
// domainToGedcomRecords, not on the writer-side parsing library.
import { domainToGedcomRecords } from './mapper.js';
import { GEDCOM_VERSION } from './constants.js';

const MAX_LINE_VALUE_LENGTH = 200;

function escapeAt(value) {
  return String(value ?? '').replace(/@/g, '@@');
}

function chunkString(str, size) {
  if (str.length === 0) return [''];
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

// Emits a tag/value line, folding embedded newlines into CONT lines and
// over-length segments into CONC lines per the GEDCOM 5.5.1 spec.
function appendValueLines(lines, level, tag, value) {
  const text = escapeAt(value);
  if (!text) {
    lines.push(`${level} ${tag}`);
    return;
  }
  text.split('\n').forEach((segment, segmentIndex) => {
    chunkString(segment, MAX_LINE_VALUE_LENGTH).forEach((chunk, chunkIndex) => {
      if (segmentIndex === 0 && chunkIndex === 0) {
        lines.push(`${level} ${tag} ${chunk}`.trimEnd());
      } else if (chunkIndex === 0) {
        lines.push(`${level + 1} CONT ${chunk}`.trimEnd());
      } else {
        lines.push(`${level + 1} CONC ${chunk}`.trimEnd());
      }
    });
  });
}

export function writeGedcom(people, options = {}) {
  const { individuals, families } = domainToGedcomRecords(people, options);
  const lines = [];

  lines.push('0 HEAD');
  lines.push('1 SOUR FamilyChart');
  lines.push('1 GEDC');
  lines.push(`2 VERS ${GEDCOM_VERSION}`);
  lines.push('2 FORM LINEAGE-LINKED');
  lines.push('1 CHAR UTF-8');

  for (const indi of individuals) {
    const { person, xrefId, famsIds, famcId, includeNotes } = indi;
    const data = person.data || {};
    lines.push(`0 @I${xrefId}@ INDI`);

    const first = data['first name'] || '';
    const last = data['last name'] || '';
    appendValueLines(lines, 1, 'NAME', last ? `${first} /${last}/` : first);

    if (data.gender === 'M' || data.gender === 'F') {
      lines.push(`1 SEX ${data.gender}`);
    }

    if (data.birthday || data.location) {
      lines.push('1 BIRT');
      if (data.birthday) appendValueLines(lines, 2, 'DATE', data.birthday);
      if (data.location) appendValueLines(lines, 2, 'PLAC', data.location);
    }

    if (data.death) {
      lines.push('1 DEAT');
      if (data.death !== 'Y') appendValueLines(lines, 2, 'DATE', data.death);
      if (data.deathPlace) appendValueLines(lines, 2, 'PLAC', data.deathPlace);
    }

    if (includeNotes && data.notes) {
      appendValueLines(lines, 1, 'NOTE', data.notes);
    }

    for (const custom of data.gedcom_custom || []) {
      const tag = custom.tag?.startsWith('_') ? custom.tag : `_${custom.tag}`;
      appendValueLines(lines, 1, tag, custom.value);
    }

    famsIds.forEach((famId) => lines.push(`1 FAMS @F${famId}@`));
    if (famcId) lines.push(`1 FAMC @F${famcId}@`);
    lines.push(`1 _APPID ${person.id}`);
  }

  for (const fam of families) {
    lines.push(`0 @F${fam.xrefId}@ FAM`);
    if (fam.husbXref) lines.push(`1 HUSB @I${fam.husbXref}@`);
    if (fam.wifeXref) lines.push(`1 WIFE @I${fam.wifeXref}@`);
    fam.childXrefs.forEach((childXref) => lines.push(`1 CHIL @I${childXref}@`));
  }

  lines.push('0 TRLR');
  return `${lines.join('\n')}\n`;
}
