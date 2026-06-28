// Barrel for the GEDCOM module. Routes should import from here rather than
// reaching into individual files, so the internal split (parser/validator/
// mapper/writer) can be refactored without touching call sites.
export { parseGedcom } from './parser.js';
export { validateGedcom } from './validator.js';
export { gedcomToDomain, domainToGedcomRecords } from './mapper.js';
export { writeGedcom } from './writer.js';
export { GEDCOM_VERSION, SUPPORTED_VERSIONS } from './constants.js';
