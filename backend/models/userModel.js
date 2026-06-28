import { getDb } from '../db/index.js';

const USER_COLUMNS = 'id, email, cognito_sub, created_at, last_login_at, is_admin';

export function findUserByCognitoSub(cognitoSub) {
  const db = getDb();
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE cognito_sub = ?`).get(cognitoSub);
}

export function findUserById(userId) {
  const db = getDb();
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(userId);
}

export function findUserByEmail(email) {
  const db = getDb();
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).get(email);
}

export function createUser(email, cognitoSub) {
  const db = getDb();
  const result = db.prepare('INSERT INTO users (email, cognito_sub) VALUES (?, ?)').run(email, cognitoSub);
  return findUserById(result.lastInsertRowid);
}

// Admin emails are configured via the ADMIN_EMAILS env var (comma-separated). There's
// no UI to grant the role yet, so every login re-checks the env var and promotes the
// user if needed - revoking just means removing the email from the env var.
function isAdminEmail(email) {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email) && adminEmails.includes(email.toLowerCase());
}

function syncAdminFlag(user) {
  if (!user.is_admin && isAdminEmail(user.email)) {
    const db = getDb();
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    return { ...user, is_admin: 1 };
  }
  return user;
}

export function findOrCreateUserByCognitoSub(cognitoSub, email) {
  const user = findUserByCognitoSub(cognitoSub) || createUser(email, cognitoSub);
  return syncAdminFlag(user);
}

export function updateLastLogin(userId) {
  const db = getDb();
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
}
