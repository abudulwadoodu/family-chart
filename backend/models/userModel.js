import { getDb } from '../db/index.js';

export function findUserByEmail(email) {
  const db = getDb();
  return db.prepare('SELECT id, email, created_at, last_login_at FROM users WHERE email = ?').get(email);
}

export function findUserById(userId) {
  const db = getDb();
  return db.prepare('SELECT id, email, created_at, last_login_at FROM users WHERE id = ?').get(userId);
}

export function createUser(email) {
  const db = getDb();
  const result = db.prepare('INSERT INTO users (email) VALUES (?)').run(email);
  return findUserById(result.lastInsertRowid);
}

export function findOrCreateUserByEmail(email) {
  return findUserByEmail(email) || createUser(email);
}

export function updateLastLogin(userId) {
  const db = getDb();
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
}
