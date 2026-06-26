import { describe, it, expect } from 'vitest';

import { setBaseTestEnv } from '../test/testEnv.js';

setBaseTestEnv();

const { initDb, getDb } = await import('./index.js');

describe('tree_permissions migration', () => {
  it('migrates approved tree_memberships rows into tree_permissions and drops the legacy table', () => {
    // Simulate a pre-migration database that still has the legacy tree_memberships table.
    const db = getDb();
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, cognito_sub TEXT, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE trees (id INTEGER PRIMARY KEY, name TEXT, owner_id INTEGER, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE tree_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        tree_id INTEGER,
        role TEXT,
        status TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    db.prepare("INSERT INTO users (id, email, cognito_sub) VALUES (1, 'owner@example.com', 'sub-1')").run();
    db.prepare("INSERT INTO users (id, email, cognito_sub) VALUES (2, 'pending@example.com', 'sub-2')").run();
    db.prepare("INSERT INTO users (id, email, cognito_sub) VALUES (3, 'revoked@example.com', 'sub-3')").run();
    db.prepare("INSERT INTO trees (id, name, owner_id) VALUES (1, 'Demo', 1)").run();
    db.prepare("INSERT INTO tree_memberships (user_id, tree_id, role, status) VALUES (1, 1, 'owner', 'approved')").run();
    db.prepare("INSERT INTO tree_memberships (user_id, tree_id, role, status) VALUES (2, 1, 'viewer', 'pending')").run();
    db.prepare("INSERT INTO tree_memberships (user_id, tree_id, role, status) VALUES (3, 1, 'editor', 'revoked')").run();

    initDb();

    const permissions = db.prepare('SELECT tree_id, user_id, role FROM tree_permissions ORDER BY user_id').all();
    expect(permissions).toEqual([{ tree_id: 1, user_id: 1, role: 'owner' }]);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    expect(tables).not.toContain('tree_memberships');
    expect(tables).toContain('tree_permissions');
  });
});
