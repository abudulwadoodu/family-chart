// Builds and recognizes the versioned JSON export envelope. Kept separate
// from mapper.js so the "what does the envelope look like" concern is
// isolated from the "how do person fields translate" concern.
import { JSON_EXPORT_VERSION, APPLICATION_NAME } from './constants.js';

export function buildExportEnvelope(people, { treeName } = {}) {
  return {
    version: JSON_EXPORT_VERSION,
    application: APPLICATION_NAME,
    exportedAt: new Date().toISOString(),
    tree: {
      name: treeName || '',
      people,
    },
  };
}

// A versioned envelope is a non-array object with a string `version` at the
// root. Legacy exports are a bare array of {id, data, rels} - anything else
// is neither and should be rejected by the caller.
export function isVersionedFormat(parsed) {
  return Boolean(parsed) && !Array.isArray(parsed) && typeof parsed === 'object' && typeof parsed.version === 'string';
}
