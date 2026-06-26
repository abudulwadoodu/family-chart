import { getDb } from '../db/index.js';

export function findUserByCognitoSub(cognitoSub) {
  const db = getDb();
  return db
    .prepare('SELECT id, email, cognito_sub, created_at, last_login_at FROM users WHERE cognito_sub = ?')
    .get(cognitoSub);
}

export function findUserById(userId) {
  const db = getDb();
  return db
    .prepare('SELECT id, email, cognito_sub, created_at, last_login_at FROM users WHERE id = ?')
    .get(userId);
}

export function findUserByEmail(email) {
  const db = getDb();
  return db
    .prepare('SELECT id, email, cognito_sub, created_at, last_login_at FROM users WHERE email = ?')
    .get(email);
}

export function createUser(email, cognitoSub) {
  const db = getDb();
  const result = db.prepare('INSERT INTO users (email, cognito_sub) VALUES (?, ?)').run(email, cognitoSub);
  return findUserById(result.lastInsertRowid);
}

export function findOrCreateUserByCognitoSub(cognitoSub, email) {
  return findUserByCognitoSub(cognitoSub) || createUser(email, cognitoSub);
}

export function updateLastLogin(userId) {
  const db = getDb();
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
}
