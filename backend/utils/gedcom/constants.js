// Shared tag tables for GEDCOM support. Centralizing the version and the
// "which tags does our mapper actually consume" lists here is the seam for
// adding a GEDCOM 7.x branch later without touching parser/validator/mapper/writer.

export const GEDCOM_VERSION = '5.5.1';
export const SUPPORTED_VERSIONS = ['5.5.1'];

// Tags consumed directly by GedcomMapper when reading an INDI record.
// Anything else found under an INDI is preserved (data.gedcom_custom) and
// reported as an "unsupported tag" warning instead of being dropped.
export const MAPPED_INDI_CHILD_TAGS = new Set(['NAME', 'SEX', 'BIRT', 'DEAT', 'NOTE', 'FAMC', 'FAMS', '_APPID']);

// Tags consumed directly by GedcomMapper when reading a FAM record.
export const MAPPED_FAM_CHILD_TAGS = new Set(['HUSB', 'WIFE', 'CHIL']);
