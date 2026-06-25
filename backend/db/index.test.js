import { describe, it, expect } from 'vitest';

import { setBaseTestEnv } from '../test/testEnv.js';

setBaseTestEnv();

const { initDb, getDb } = await import('./index.js');

describe('initDb migration', () => {
  it('migrates a legacy users table (NOT NULL password_hash, no last_login_at) in place', () => {
    const db = getDb();
    db.exec('DROP TABLE IF EXISTS users');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('legacy@example.com', 'hash');

    initDb();

    const columns = db.prepare('PRAGMA table_info(users)').all();
    const passwordHashColumn = columns.find((column) => column.name === 'password_hash');
    expect(passwordHashColumn.notnull).toBe(0);
    expect(columns.some((column) => column.name === 'last_login_at')).toBe(true);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get('legacy@example.com');
    expect(user.password_hash).toBe('hash');
  });
});
