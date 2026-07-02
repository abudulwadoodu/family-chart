// Column order for the downloadable CSV template. child_ids/children_ids are
// deliberately excluded - they're accepted on import for backward
// compatibility (see mapper.js) but children are always derived from
// father_id/mother_id going forward, per the "don't maintain both parent and
// child relationships" requirement.
export const CSV_TEMPLATE_COLUMNS = [
  'id',
  'first_name',
  'middle_name',
  'last_name',
  'gender',
  'birth_date',
  'birth_place',
  'death_date',
  'death_place',
  'is_living',
  'photo_url',
  'occupation',
  'email',
  'phone',
  'notes',
  'father_id',
  'mother_id',
  'spouse_ids',
];

export const LEGACY_ONLY_COLUMNS = ['child_ids', 'children_ids'];

export const VALID_GENDERS = new Set(['M', 'F', 'O', 'U']);

export const GENDER_ALIASES = {
  m: 'M',
  male: 'M',
  f: 'F',
  female: 'F',
  o: 'O',
  other: 'O',
  u: 'U',
  unknown: 'U',
};

export const TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);
export const FALSE_VALUES = new Set(['false', '0', 'no', 'n']);
