// GedcomParser: wraps the `gedcom` npm package and normalizes its AST into a
// small, library-agnostic record shape ({tag, value, xrefId, pointer,
// customTag, children}). This is the only file that knows about the
// underlying parsing library - validator/mapper/writer only ever see the
// normalized shape, so the library (or a future GEDCOM 7.x parser) can be
// swapped here without touching anything downstream.
import { parse } from 'gedcom';

function stripDelimiters(value) {
  if (!value) return undefined;
  return value.replace(/^@/, '').replace(/@$/, '');
}

function toRecord(node) {
  return {
    tag: node.type,
    value: node.data?.value,
    xrefId: stripDelimiters(node.data?.xref_id),
    pointer: stripDelimiters(node.data?.pointer),
    customTag: Boolean(node.data?.custom_tag),
    children: (node.children || []).map(toRecord),
  };
}

export function parseGedcom(text) {
  if (!text || !text.trim()) {
    throw new Error('GEDCOM file is empty');
  }

  let ast;
  try {
    ast = parse(text);
  } catch (error) {
    throw new Error(`File is not valid GEDCOM: ${error.message}`);
  }

  const records = (ast.children || []).map(toRecord);
  if (records.length === 0) {
    throw new Error('No GEDCOM records found in file');
  }

  return { records };
}

export function findChild(record, tag) {
  return record?.children.find((c) => c.tag === tag);
}

export function findChildren(record, tag) {
  return record?.children.filter((c) => c.tag === tag) || [];
}

export function childValue(record, tag) {
  return findChild(record, tag)?.value;
}
