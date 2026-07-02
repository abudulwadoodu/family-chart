// Column order for the CSV template/export, mirrored from
// backend/utils/csv/constants.js's CSV_TEMPLATE_COLUMNS. Duplicated here
// (rather than imported) because the frontend has no build-time path into
// backend/utils/ - this is the single place the frontend keeps the list, so
// template generation and export share one source instead of two.
export const CSV_HEADER = [
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

export const REQUIRED_COLUMNS = ['id', 'first_name', 'last_name'];
export const OPTIONAL_COLUMNS = CSV_HEADER.filter((c) => !REQUIRED_COLUMNS.includes(c));

// Three generations: grandparents, parents (with one spouse each), and
// children - demonstrates father_id/mother_id-driven child derivation, a
// living person, a deceased person, notes, and multiple spouses.
export const SAMPLE_ROWS = [
  ['gp1', 'Robert', '', 'Doe', 'M', '1930-04-02', 'Boston', '1998-11-20', 'Boston', 'FALSE', '', 'Carpenter', '', '', 'Grandfather', '', '', 'gp2'],
  ['gp2', 'Mary', '', 'Doe', 'F', '1932-07-19', 'Boston', '', '', 'TRUE', '', 'Homemaker', '', '', 'Grandmother', '', '', 'gp1'],
  ['p1', 'John', 'Michael', 'Doe', 'M', '1955-01-01', 'Boston', '', '', 'TRUE', '', 'Engineer', 'john@example.com', '555-0100', 'Eldest child of Robert and Mary', 'gp1', 'gp2', 'p4'],
  ['p4', 'Jane', '', 'Smith', 'F', '1957-03-15', 'New York', '', '', 'TRUE', '', 'Teacher', 'jane@example.com', '555-0101', 'Married into the family', '', '', 'p1'],
  ['c1', 'Chris', '', 'Doe', 'M', '1985-06-10', 'New York', '', '', 'TRUE', '', 'Designer', 'chris@example.com', '555-0102', 'Child of John and Jane', 'p1', 'p4', ''],
  ['c2', 'Emma', '', 'Doe', 'F', '1987-09-23', 'New York', '', '', 'TRUE', '', 'Doctor', 'emma@example.com', '555-0103', 'Child of John and Jane', 'p1', 'p4', ''],
];

function escapeCsvField(value) {
  const str = String(value ?? '');
  return /["\n,]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function buildCsvText(rows) {
  return [CSV_HEADER.join(','), ...rows.map((row) => row.map(escapeCsvField).join(','))].join('\n');
}
