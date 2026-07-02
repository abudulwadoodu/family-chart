// Maps legacy CSV header names to their canonical replacement so parsing
// only ever has to deal with current column names. `child_ids`/`children_ids`
// are intentionally left out of this table - they aren't renamed, they're a
// legacy-only relationship source that gets merged into derived children
// (see csv/mapper.js) rather than replaced by a new column.
export const LEGACY_FIELD_ALIASES = {
  birthday: 'birth_date',
  location: 'birth_place',
  avatar: 'photo_url',
};

export function resolveLegacyHeader(header) {
  return LEGACY_FIELD_ALIASES[header] || header;
}
