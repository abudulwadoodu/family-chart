import { getDb } from '../db/index.js';

function resolvePagination(page, pageSize) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  return { limit: safePageSize, offset: (safePage - 1) * safePageSize, page: safePage, pageSize: safePageSize };
}

export function createAuditLog({ adminId, action, targetType, targetId, details }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
     VALUES (?, ?, ?, ?, ?)`
  ).run(adminId, action, targetType, targetId == null ? null : String(targetId), details ? JSON.stringify(details) : null);
}

export function listAuditLogs({ search, action, adminId, page, pageSize }) {
  const db = getDb();
  const params = [];
  const clauses = [];

  if (action) {
    clauses.push('a.action = ?');
    params.push(action);
  }
  if (adminId) {
    clauses.push('a.admin_id = ?');
    params.push(Number(adminId));
  }
  if (search) {
    clauses.push('(a.target_type LIKE ? OR a.target_id LIKE ? OR admin.email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const joins = 'LEFT JOIN users admin ON admin.id = a.admin_id';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs a ${joins} ${where}`).get(...params).c;

  const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
  const logs = db
    .prepare(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
              admin.id AS admin_id, admin.email AS admin_email
       FROM audit_logs a ${joins} ${where}
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset)
    .map((row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null }));

  return { logs, total, page: safePage, pageSize: safePageSize };
}

export function listRecentAuditLogs(limit = 10) {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.created_at, admin.email AS admin_email
       FROM audit_logs a LEFT JOIN users admin ON admin.id = a.admin_id
       ORDER BY a.created_at DESC LIMIT ?`
    )
    .all(limit);
}
