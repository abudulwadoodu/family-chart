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
  migrateUsersTable(db);
}

// CREATE TABLE IF NOT EXISTS won't retrofit existing databases, so older local
// databases created before OTP login still have a NOT NULL password_hash and
// are missing last_login_at — rebuild the table in place to pick those up.
function migrateUsersTable(db) {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  const passwordHashColumn = columns.find((column) => column.name === 'password_hash');
  const hasLastLoginAt = columns.some((column) => column.name === 'last_login_at');

  if (passwordHashColumn && !passwordHashColumn.notnull && hasLastLoginAt) return;

  db.pragma('foreign_keys = OFF');
  db.exec('BEGIN TRANSACTION');
  try {
    db.exec(`
      CREATE TABLE users_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT
      );
    `);
    db.exec(`
      INSERT INTO users_migration (id, email, password_hash, created_at${hasLastLoginAt ? ', last_login_at' : ''})
      SELECT id, email, password_hash, created_at${hasLastLoginAt ? ', last_login_at' : ''} FROM users;
    `);
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_migration RENAME TO users');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
