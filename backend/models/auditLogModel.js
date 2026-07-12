import { query } from '../db/index.js';

function resolvePagination(page, pageSize) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  return { limit: safePageSize, offset: (safePage - 1) * safePageSize, page: safePage, pageSize: safePageSize };
}

export async function createAuditLog({ adminId, action, targetType, targetId, details }) {
  await query(
    `INSERT INTO audit_logs (admin_id, actor_id, action, target_type, target_id, details)
     VALUES ($1, $1, $2, $3, $4, $5)`,
    [adminId, action, targetType, targetId == null ? null : String(targetId), details ? JSON.stringify(details) : null]
  );
}

// Forensic variant: captures before/after snapshots plus request metadata
// (IP/user-agent), for actions where the delta itself matters - role
// changes, override grants/revokes, structural tree edits. Deliberately
// separate from createAuditLog rather than folding oldValues/newValues into
// `details`, so existing callers/readers of `details` are unaffected.
export async function createAuditLogEvent({
  actorId,
  actionType,
  targetType,
  targetId,
  oldValues,
  newValues,
  ipAddress,
  userAgent,
}) {
  await query(
    `INSERT INTO audit_logs
       (admin_id, actor_id, action, target_type, target_id, old_values, new_values, ip_address, user_agent)
     VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      actorId ?? null,
      actionType,
      targetType,
      targetId == null ? null : String(targetId),
      oldValues == null ? null : JSON.stringify(oldValues),
      newValues == null ? null : JSON.stringify(newValues),
      ipAddress ?? null,
      userAgent ?? null,
    ]
  );
}

export async function listAuditLogs({ search, action, adminId, page, pageSize }) {
  const params = [];
  const clauses = [];

  if (action) {
    params.push(action);
    clauses.push(`a.action = $${params.length}`);
  }
  if (adminId) {
    params.push(Number(adminId));
    clauses.push(`a.admin_id = $${params.length}`);
  }
  if (search) {
    const like = `%${search}%`;
    params.push(like, like, like);
    clauses.push(`(a.target_type ILIKE $${params.length - 2} OR a.target_id ILIKE $${params.length - 1} OR admin.email ILIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const joins = 'LEFT JOIN users admin ON admin.id = a.admin_id';

  const totalResult = await query(`SELECT COUNT(*) AS c FROM audit_logs a ${joins} ${where}`, params);
  const total = Number(totalResult.rows[0].c);

  const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
            a.old_values, a.new_values, a.ip_address, a.user_agent,
            admin.id AS admin_id, admin.email AS admin_email
     FROM audit_logs a ${joins} ${where}
     ORDER BY a.created_at DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  // details is stored as TEXT (JSON.stringify'd) while old_values/new_values
  // are native JSONB, so only the former needs a parse - pg already returns
  // JSONB columns as parsed objects.
  const logs = rows.map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null }));

  return { logs, total, page: safePage, pageSize: safePageSize };
}

export async function listRecentAuditLogs(limit = 10) {
  const { rows } = await query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.created_at, admin.email AS admin_email
     FROM audit_logs a LEFT JOIN users admin ON admin.id = a.admin_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}
