import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../data/app.db');
let dbInstance;

function ensureDbDirectory() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getDb() {
  if (!dbInstance) {
    ensureDbDirectory();
    dbInstance = new Database(dbPath);
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

export function initDb() {
  const db = getDb();
  const schemaPath = path.resolve(__dirname, './schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
  runMigrations(db);
}

function runMigrations(db) {
  const columns = db.prepare('PRAGMA table_info(family_data)').all();
  if (!columns.some((column) => column.name === 'updated_at')) {
    db.exec("ALTER TABLE family_data ADD COLUMN updated_at TEXT");
    db.exec(
      `UPDATE family_data SET updated_at = (
         SELECT created_at FROM trees WHERE trees.id = family_data.tree_id
       ) WHERE updated_at IS NULL`
    );
  }
}
