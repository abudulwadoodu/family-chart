import { getDb } from '../db/index.js';

// Single source of truth for what settings exist, their type, and default value.
// The admin Settings page renders one form field per entry here - adding a new
// setting means adding one line here, no schema change required.
export const SETTINGS_SCHEMA = {
  registrationEnabled: { type: 'boolean', label: 'Registration enabled', default: true },
  maintenanceMode: { type: 'boolean', label: 'Maintenance mode', default: false },
  maxUploadSizeMb: { type: 'number', label: 'Maximum upload size (MB)', default: 10 },
  allowedImageFormats: { type: 'text', label: 'Allowed image formats (comma-separated)', default: 'jpg,jpeg,png,gif,webp' },
  sessionTimeoutMinutes: { type: 'number', label: 'Session timeout (minutes)', default: 60 },
  passwordMinLength: { type: 'number', label: 'Minimum password length', default: 8 },
  defaultTreePrivacy: {
    type: 'select',
    label: 'Default privacy for new trees',
    options: ['private', 'invite-only'],
    default: 'private',
  },
  featureFlagCsvImport: { type: 'boolean', label: 'Feature flag: CSV import', default: true },
  featureFlagGedcomImport: { type: 'boolean', label: 'Feature flag: GEDCOM import', default: true },
  aiFeaturesEnabled: { type: 'boolean', label: 'AI features enabled', default: false },
};

function coerce(key, rawValue) {
  const def = SETTINGS_SCHEMA[key];
  if (!def) return rawValue;
  if (def.type === 'boolean') return rawValue === 'true' || rawValue === true;
  if (def.type === 'number') return Number(rawValue);
  return rawValue;
}

export function getAllSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return Object.fromEntries(
    Object.entries(SETTINGS_SCHEMA).map(([key, def]) => [
      key,
      key in stored ? coerce(key, stored[key]) : def.default,
    ])
  );
}

export function updateSettings(updates, adminId) {
  const db = getDb();
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (!(key in SETTINGS_SCHEMA)) continue;
      db.prepare(
        `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      ).run(key, String(value), adminId);
    }
  });
  tx();
  return getAllSettings();
}
