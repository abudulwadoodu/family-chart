import { query } from '../db/index.js';

export const ADMIN_ROLES = ['super_admin', 'support_admin'];

const USER_COLUMNS = 'id, email, cognito_sub, created_at, last_login_at, is_admin, admin_role, status';

export async function findUserByCognitoSub(cognitoSub) {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users WHERE cognito_sub = $1`, [cognitoSub]);
  return rows[0];
}

export async function findUserById(userId) {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
  return rows[0];
}

export async function findUserByEmail(email) {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
  return rows[0];
}

export async function createUser(email, cognitoSub) {
  const { rows } = await query('INSERT INTO users (email, cognito_sub) VALUES ($1, $2) RETURNING id', [
    email,
    cognitoSub,
  ]);
  return findUserById(rows[0].id);
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

async function syncAdminFlag(user) {
  if (!user.is_admin && isAdminEmail(user.email)) {
    await query("UPDATE users SET is_admin = true, admin_role = 'super_admin' WHERE id = $1", [user.id]);
    return { ...user, is_admin: true, admin_role: 'super_admin' };
  }
  return user;
}

export async function findOrCreateUserByCognitoSub(cognitoSub, email) {
  const user = (await findUserByCognitoSub(cognitoSub)) || (await createUser(email, cognitoSub));
  return syncAdminFlag(user);
}

export async function updateLastLogin(userId) {
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
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
// both read off the exact same interval.
const ACTIVITY_FILTERS = {
  activeToday: { column: 'u.last_login_at', days: 1 },
  activeLast30Days: { column: 'u.last_login_at', days: 30 },
  newRegistrations: { column: 'u.created_at', days: 7 },
};

export async function listUsersForAdmin({ search, status, adminRole, activity, sort, order, page, pageSize }) {
  const params = [];
  const clauses = [];

  if (search) {
    params.push(`%${search}%`);
    clauses.push(`u.email ILIKE $${params.length}`);
  }
  if (status && ['active', 'suspended'].includes(status)) {
    params.push(status);
    clauses.push(`u.status = $${params.length}`);
  }
  if (adminRole === 'admins') {
    clauses.push('u.admin_role IS NOT NULL');
  } else if (adminRole && ADMIN_ROLES.includes(adminRole)) {
    params.push(adminRole);
    clauses.push(`u.admin_role = $${params.length}`);
  }
  if (activity && ACTIVITY_FILTERS[activity]) {
    const { column, days } = ACTIVITY_FILTERS[activity];
    params.push(days);
    clauses.push(`${column} >= NOW() - make_interval(days => $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalResult = await query(`SELECT COUNT(*) AS c FROM users u ${where}`, params);
  const total = Number(totalResult.rows[0].c);

  const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
  const listParams = [...params, limit, offset];
  const { rows: users } = await query(
    `SELECT ${USER_COLUMNS},
            (SELECT COUNT(*) FROM trees WHERE trees.owner_id = u.id) AS owned_tree_count
     FROM users u ${where}
     ORDER BY ${resolveUserSort(sort, order)} LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { users, total, page: safePage, pageSize: safePageSize };
}

// Storage is approximated from data already stored locally (tree JSON size and
// support attachment sizes) - there is no per-user storage accounting table, and
// nothing on the Cognito side is included. Good enough for an admin-facing estimate.
export async function getUserStorageUsage(userId) {
  const treesResult = await query(
    `SELECT COALESCE(SUM(LENGTH(fd.json_data::text)), 0) AS bytes
     FROM family_data fd
     JOIN trees t ON t.id = fd.tree_id
     WHERE t.owner_id = $1`,
    [userId]
  );
  const treesBytes = Number(treesResult.rows[0].bytes) || 0;

  const ticketAttachmentResult = await query(
    `SELECT COALESCE(SUM(sm.attachment_size), 0) AS bytes
     FROM support_messages sm
     JOIN support_tickets st ON st.id = sm.ticket_id
     WHERE st.user_id = $1`,
    [userId]
  );
  const ticketAttachmentBytes = Number(ticketAttachmentResult.rows[0].bytes) || 0;

  const contactAttachmentResult = await query(
    'SELECT COALESCE(SUM(attachment_size), 0) AS bytes FROM contact_submissions WHERE user_id = $1',
    [userId]
  );
  const contactAttachmentBytes = Number(contactAttachmentResult.rows[0].bytes) || 0;

  return treesBytes + ticketAttachmentBytes + contactAttachmentBytes;
}

export async function getUserProfileForAdmin(userId) {
  const user = await findUserById(userId);
  if (!user) return null;
  const { rows: ownedTrees } = await query(
    `SELECT t.id, t.name, t.created_at, COALESCE(fd.updated_at, t.created_at) AS updated_at,
            COALESCE(jsonb_array_length(fd.json_data), 0) AS member_count
     FROM trees t
     LEFT JOIN family_data fd ON fd.tree_id = t.id
     WHERE t.owner_id = $1
     ORDER BY t.created_at DESC`,
    [userId]
  );

  return {
    ...user,
    owned_trees: ownedTrees,
    storage_bytes: await getUserStorageUsage(userId),
  };
}

export async function setUserStatus(userId, status) {
  if (!['active', 'suspended'].includes(status)) throw new Error('Invalid status');
  await query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
  return findUserById(userId);
}

export async function setAdminRole(userId, adminRole) {
  if (adminRole === null) {
    await query('UPDATE users SET admin_role = NULL, is_admin = false WHERE id = $1', [userId]);
  } else {
    if (!ADMIN_ROLES.includes(adminRole)) throw new Error('Invalid admin role');
    await query('UPDATE users SET admin_role = $1, is_admin = true WHERE id = $2', [adminRole, userId]);
  }
  return findUserById(userId);
}

export async function deleteUser(userId) {
  await query('DELETE FROM users WHERE id = $1', [userId]);
}

export async function countActiveUsersSince(days) {
  const { rows } = await query('SELECT COUNT(*) AS c FROM users WHERE last_login_at >= NOW() - make_interval(days => $1)', [
    days,
  ]);
  return Number(rows[0].c);
}

export async function countUsersCreatedSince(days) {
  const { rows } = await query('SELECT COUNT(*) AS c FROM users WHERE created_at >= NOW() - make_interval(days => $1)', [
    days,
  ]);
  return Number(rows[0].c);
}

export async function countAllUsers() {
  const { rows } = await query('SELECT COUNT(*) AS c FROM users');
  return Number(rows[0].c);
}
