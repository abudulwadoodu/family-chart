import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

dotenv.config();

// Dynamic import so dotenv.config() above runs before db/index.js reads
// process.env.DATABASE_URL at module-load time.
const { getPool, closeDb } = await import('./index.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = process.env.SQLITE_SOURCE_PATH || path.resolve(__dirname, '../../data/app.db');

// Listed in FK-dependency order (referenced tables before their referencers)
// so inserts never violate a foreign key. Columns are listed explicitly
// (rather than SELECT *) because a few need type conversion on the way in:
// - INTEGER 0/1 flag columns -> BOOLEAN
// - TEXT json_data -> JSONB (must be parsed, not passed as a raw string)
const TABLES = [
  {
    name: 'users',
    columns: ['id', 'email', 'cognito_sub', 'created_at', 'last_login_at', 'is_admin', 'admin_role', 'status'],
    transformRow: (row) => ({ ...row, is_admin: Boolean(row.is_admin) }),
  },
  {
    name: 'trees',
    columns: ['id', 'name', 'owner_id', 'created_at'],
  },
  {
    name: 'tree_permissions',
    columns: ['id', 'tree_id', 'user_id', 'role', 'created_at', 'updated_at'],
  },
  {
    name: 'family_data',
    // json_data is left as the raw JSON text from SQLite (not JSON.parse'd) -
    // pg sends string parameters through as-is for a JSONB column and lets
    // Postgres parse/validate server-side; passing a parsed JS array/object
    // instead would hit pg's own array-to-Postgres-array serialization for
    // top-level arrays, which is not the same thing as a JSON array literal.
    columns: ['id', 'tree_id', 'json_data', 'updated_at'],
  },
  {
    name: 'settings',
    columns: ['key', 'value', 'updated_at', 'updated_by'],
    hasSerialId: false,
  },
  {
    name: 'contact_submissions',
    columns: [
      'id', 'user_id', 'name', 'email', 'subject', 'message',
      'attachment_filename', 'attachment_mimetype', 'attachment_size', 'attachment_data',
      'status', 'error', 'created_at',
    ],
  },
  {
    name: 'support_tickets',
    columns: [
      'id', 'ticket_number', 'user_id', 'subject', 'category', 'priority', 'status',
      'assigned_to', 'created_at', 'updated_at', 'closed_at',
    ],
  },
  {
    name: 'support_messages',
    columns: [
      'id', 'ticket_id', 'sender_type', 'sender_id', 'message', 'is_internal',
      'attachment_filename', 'attachment_mimetype', 'attachment_size', 'attachment_data', 'created_at',
    ],
    transformRow: (row) => ({ ...row, is_internal: Boolean(row.is_internal) }),
  },
  {
    name: 'audit_logs',
    columns: ['id', 'admin_id', 'action', 'target_type', 'target_id', 'details', 'created_at'],
  },
  {
    name: 'media',
    columns: [
      'id', 'tree_id', 'kind', 'storage_key', 'mime_type', 'file_size', 'width', 'height',
      'duration_seconds', 'page_count', 'title', 'description', 'taken_at', 'uploaded_by',
      'created_at', 'updated_at',
    ],
  },
  {
    name: 'media_tags',
    columns: [
      'id', 'media_id', 'tree_id', 'member_id', 'source', 'confidence', 'confirmed_at',
      'confirmed_by', 'box_x', 'box_y', 'box_w', 'box_h', 'created_at',
    ],
  },
  {
    name: 'albums',
    columns: ['id', 'tree_id', 'name', 'description', 'cover_media_id', 'created_by', 'created_at', 'updated_at'],
  },
  {
    name: 'album_media',
    columns: ['album_id', 'media_id', 'sort_order', 'added_at'],
    hasSerialId: false,
  },
  {
    name: 'events',
    columns: [
      'id', 'tree_id', 'title', 'event_type', 'description', 'event_date', 'date_precision',
      'location', 'created_by', 'created_at', 'updated_at',
    ],
  },
  {
    name: 'event_participants',
    columns: ['event_id', 'tree_id', 'member_id', 'role'],
    hasSerialId: false,
  },
  {
    name: 'event_media',
    columns: ['event_id', 'media_id'],
    hasSerialId: false,
  },
];

async function tableIsEmpty(pool, tableName) {
  const { rows } = await pool.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
  return rows.length === 0;
}

async function copyTable(pool, sqliteDb, table) {
  const rows = sqliteDb.prepare(`SELECT ${table.columns.join(', ')} FROM ${table.name}`).all();
  const transform = table.transformRow || ((row) => row);

  let inserted = 0;
  for (const rawRow of rows) {
    const row = transform(rawRow);
    const values = table.columns.map((col) => row[col]);
    const placeholders = table.columns.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(`INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders})`, values);
    inserted += 1;
  }

  // Bring the SERIAL sequence up to date so the next application INSERT
  // doesn't collide with an explicitly-inserted id from this migration.
  if (table.hasSerialId !== false && table.columns.includes('id')) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence('${table.name}', 'id'), COALESCE((SELECT MAX(id) FROM ${table.name}), 1), true)`
    );
  }

  return { table: table.name, sourceCount: rows.length, insertedCount: inserted };
}

async function main() {
  const pool = getPool();
  const sqliteDb = new Database(sqlitePath, { readonly: true });

  try {
    for (const table of TABLES) {
      const empty = await tableIsEmpty(pool, table.name);
      if (!empty) {
        throw new Error(
          `Refusing to run: PostgreSQL table "${table.name}" already has rows. ` +
            'This script is one-time-use against an empty database; re-running against ' +
            'already-migrated data would create duplicates.'
        );
      }
    }

    const results = [];
    for (const table of TABLES) {
      results.push(await copyTable(pool, sqliteDb, table));
    }

    console.log('Migration complete. Row counts (source SQLite -> inserted into Postgres):');
    for (const { table, sourceCount, insertedCount } of results) {
      const mismatch = sourceCount !== insertedCount ? '  <-- MISMATCH' : '';
      console.log(`  ${table}: ${sourceCount} -> ${insertedCount}${mismatch}`);
    }
  } finally {
    sqliteDb.close();
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
