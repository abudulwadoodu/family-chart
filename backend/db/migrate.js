import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, './migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

function listMigrationFiles(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

export async function runMigrations(pool, migrationsDir = MIGRATIONS_DIR) {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));

    for (const fileName of listMigrationFiles(migrationsDir)) {
      if (applied.has(fileName)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [fileName]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${fileName} failed: ${error.message}`, { cause: error });
      }
    }
  } finally {
    client.release();
  }
}
