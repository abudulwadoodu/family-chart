import { getDb } from '../db/index.js';

export const ADMIN_ROLES = ['super_admin', 'support_admin'];

const USER_COLUMNS = 'id, email, cognito_sub, created_at, last_login_at, is_admin, admin_role, status';

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
// user if needed - revoking just means removing the email from the env var. Anyone
// promoted this way starts as super_admin since ADMIN_EMAILS is the highest-trust
// bootstrap mechanism; support_admin can only be granted via setAdminRole().
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
    db.prepare("UPDATE users SET is_admin = 1, admin_role = 'super_admin' WHERE id = ?").run(user.id);
    return { ...user, is_admin: 1, admin_role: 'super_admin' };
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

// ---------------------------------------------------------------------------
// Admin: user management
// ---------------------------------------------------------------------------

const SORTABLE_USERS = {
  created_at: 'u.created_at',
  last_login_at: 'u.last_login_at',
  email: 'u.email',
};

function resolveUserSort(sort, order) {
  const column = SORTABLE_USERS[sort] || SORTABLE_USERS.created_at;
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${direction}`;
}

function resolvePagination(page, pageSize) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  return { limit: safePageSize, offset: (safePage - 1) * safePageSize, page: safePage, pageSize: safePageSize };
}

// Maps 1:1 to the dashboard's countActiveUsersSince()/countUsersCreatedSince()
// windows, so a dashboard card's count and its drilldown list always agree -
// both read off the exact same SQLite datetime() modifier.
const ACTIVITY_FILTERS = {
  activeToday: { column: 'u.last_login_at', sinceSql: '-1 day' },
  activeLast30Days: { column: 'u.last_login_at', sinceSql: '-30 days' },
  newRegistrations: { column: 'u.created_at', sinceSql: '-7 days' },
};

export function listUsersForAdmin({ search, status, adminRole, activity, sort, order, page, pageSize }) {
  const db = getDb();
  const params = [];
  const clauses = [];

  if (search) {
    clauses.push('u.email LIKE ?');
    params.push(`%${search}%`);
  }
  if (status && ['active', 'suspended'].includes(status)) {
    clauses.push('u.status = ?');
    params.push(status);
  }
  if (adminRole === 'admins') {
    clauses.push('u.admin_role IS NOT NULL');
  } else if (adminRole && ADMIN_ROLES.includes(adminRole)) {
    clauses.push('u.admin_role = ?');
    params.push(adminRole);
  }
  if (activity && ACTIVITY_FILTERS[activity]) {
    const { column, sinceSql } = ACTIVITY_FILTERS[activity];
    clauses.push(`${column} >= datetime('now', ?)`);
    params.push(sinceSql);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...params).c;

  const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
  const users = db
    .prepare(
      `SELECT ${USER_COLUMNS},
              (SELECT COUNT(*) FROM trees WHERE trees.owner_id = u.id) AS owned_tree_count
       FROM users u ${where}
       ORDER BY ${resolveUserSort(sort, order)} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return { users, total, page: safePage, pageSize: safePageSize };
}

// Storage is approximated from data already stored locally (tree JSON size and
// support attachment sizes) - there is no per-user storage accounting table, and
// nothing on the Cognito side is included. Good enough for an admin-facing estimate.
export function getUserStorageUsage(userId) {
  const db = getDb();
  const treesBytes =
    db
      .prepare(
        `SELECT COALESCE(SUM(LENGTH(fd.json_data)), 0) AS bytes
         FROM family_data fd
         JOIN trees t ON t.id = fd.tree_id
         WHERE t.owner_id = ?`
      )
      .get(userId).bytes || 0;
  const ticketAttachmentBytes =
    db
      .prepare(
        `SELECT COALESCE(SUM(sm.attachment_size), 0) AS bytes
         FROM support_messages sm
         JOIN support_tickets st ON st.id = sm.ticket_id
         WHERE st.user_id = ?`
      )
      .get(userId).bytes || 0;
  const contactAttachmentBytes =
    db.prepare('SELECT COALESCE(SUM(attachment_size), 0) AS bytes FROM contact_submissions WHERE user_id = ?').get(userId)
      .bytes || 0;

  return treesBytes + ticketAttachmentBytes + contactAttachmentBytes;
}

export function getUserProfileForAdmin(userId) {
  const user = findUserById(userId);
  if (!user) return null;
  const db = getDb();
  const ownedTrees = db
    .prepare(
      `SELECT t.id, t.name, t.created_at, COALESCE(fd.updated_at, t.created_at) AS updated_at,
              COALESCE(json_array_length(fd.json_data), 0) AS member_count
       FROM trees t
       LEFT JOIN family_data fd ON fd.tree_id = t.id
       WHERE t.owner_id = ?
       ORDER BY t.created_at DESC`
    )
    .all(userId);

  return {
    ...user,
    owned_trees: ownedTrees,
    storage_bytes: getUserStorageUsage(userId),
  };
}

export function setUserStatus(userId, status) {
  if (!['active', 'suspended'].includes(status)) throw new Error('Invalid status');
  const db = getDb();
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
  return findUserById(userId);
}

export function setAdminRole(userId, adminRole) {
  const db = getDb();
  if (adminRole === null) {
    db.prepare('UPDATE users SET admin_role = NULL, is_admin = 0 WHERE id = ?').run(userId);
  } else {
    if (!ADMIN_ROLES.includes(adminRole)) throw new Error('Invalid admin role');
    db.prepare('UPDATE users SET admin_role = ?, is_admin = 1 WHERE id = ?').run(adminRole, userId);
  }
  return findUserById(userId);
}

export function deleteUser(userId) {
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function countActiveUsersSince(sinceSql) {
  const db = getDb();
  return db.prepare(`SELECT COUNT(*) AS c FROM users WHERE last_login_at >= datetime('now', ?)`).get(sinceSql).c;
}

export function countUsersCreatedSince(sinceSql) {
  const db = getDb();
  return db.prepare(`SELECT COUNT(*) AS c FROM users WHERE created_at >= datetime('now', ?)`).get(sinceSql).c;
}

export function countAllUsers() {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
}
