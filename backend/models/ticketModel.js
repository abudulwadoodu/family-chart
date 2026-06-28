import { getDb } from '../db/index.js';

export const TICKET_STATUSES = ['NEW', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED'];
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const TICKET_COLUMNS = `
  t.id, t.ticket_number, t.user_id, t.subject, t.category, t.priority, t.status,
  t.assigned_to, t.created_at, t.updated_at, t.closed_at
`;

// Maps each sortable key to the SQL ordering expression. priority/status need a
// CASE so "urgent" sorts above "low" instead of alphabetically; everything else
// whitelists straight to a column so request input never reaches raw SQL.
const SORTABLE = {
  created_at: 't.created_at',
  updated_at: 't.updated_at',
  status: `CASE t.status WHEN 'NEW' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'WAITING_FOR_USER' THEN 3 WHEN 'RESOLVED' THEN 4 WHEN 'CLOSED' THEN 5 ELSE 6 END`,
  priority: `CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END`,
};

function resolveSort(sort, order) {
  const column = SORTABLE[sort] || SORTABLE.updated_at;
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${direction}`;
}

function resolvePagination(page, pageSize) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  return { limit: safePageSize, offset: (safePage - 1) * safePageSize, page: safePage, pageSize: safePageSize };
}

function ticketNumberFor(id) {
  return `TCK-${String(id).padStart(6, '0')}`;
}

export function createTicket({ userId, subject, category, priority = 'normal' }) {
  const db = getDb();
  const tx = db.transaction(() => {
    const insertResult = db
      .prepare(
        `INSERT INTO support_tickets (ticket_number, user_id, subject, category, priority, status)
         VALUES ('', ?, ?, ?, ?, 'NEW')`
      )
      .run(userId, subject, category, priority);
    const ticketId = insertResult.lastInsertRowid;
    db.prepare('UPDATE support_tickets SET ticket_number = ? WHERE id = ?').run(ticketNumberFor(ticketId), ticketId);
    return ticketId;
  });
  const ticketId = tx();
  return getTicketById(ticketId);
}

export function getTicketById(ticketId) {
  const db = getDb();
  return db.prepare(`SELECT ${TICKET_COLUMNS} FROM support_tickets t WHERE t.id = ?`).get(ticketId);
}

export function getTicketForUser(ticketId, userId) {
  const db = getDb();
  return db.prepare(`SELECT ${TICKET_COLUMNS} FROM support_tickets t WHERE t.id = ? AND t.user_id = ?`).get(ticketId, userId);
}

function buildFilters({ status, priority, assignedTo, search, userId }, params) {
  const clauses = [];
  if (userId) {
    clauses.push('t.user_id = ?');
    params.push(userId);
  }
  if (status && TICKET_STATUSES.includes(status)) {
    clauses.push('t.status = ?');
    params.push(status);
  }
  if (priority && TICKET_PRIORITIES.includes(priority)) {
    clauses.push('t.priority = ?');
    params.push(priority);
  }
  if (assignedTo === 'unassigned') {
    clauses.push('t.assigned_to IS NULL');
  } else if (assignedTo) {
    clauses.push('t.assigned_to = ?');
    params.push(Number(assignedTo));
  }
  return clauses;
}

export function listTicketsForUser({ userId, search, status, priority, sort, order, page, pageSize }) {
  const db = getDb();
  const params = [];
  const clauses = buildFilters({ status, priority, search, userId }, params);

  if (search) {
    clauses.push('(t.ticket_number LIKE ? OR t.subject LIKE ? OR t.category LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM support_tickets t ${where}`).get(...params).c;

  const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
  const tickets = db
    .prepare(`SELECT ${TICKET_COLUMNS} FROM support_tickets t ${where} ORDER BY ${resolveSort(sort, order)} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return { tickets, total, page: safePage, pageSize: safePageSize };
}

export function listTicketsForAdmin({ search, status, priority, assignedTo, sort, order, page, pageSize }) {
  const db = getDb();
  const params = [];
  const clauses = buildFilters({ status, priority, assignedTo }, params);

  if (search) {
    clauses.push('(t.ticket_number LIKE ? OR t.subject LIKE ? OR t.category LIKE ? OR owner.email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const joins = 'LEFT JOIN users owner ON owner.id = t.user_id LEFT JOIN users admin ON admin.id = t.assigned_to';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM support_tickets t ${joins} ${where}`).get(...params).c;

  const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
  const tickets = db
    .prepare(
      `SELECT ${TICKET_COLUMNS}, owner.email AS user_email, admin.email AS assigned_admin_email
       FROM support_tickets t ${joins} ${where}
       ORDER BY ${resolveSort(sort, order)} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return { tickets, total, page: safePage, pageSize: safePageSize };
}

export function updateTicketStatus(ticketId, status) {
  const db = getDb();
  const closedAt = status === 'CLOSED' ? "datetime('now')" : 'NULL';
  db.prepare(
    `UPDATE support_tickets SET status = ?, closed_at = ${closedAt}, updated_at = datetime('now') WHERE id = ?`
  ).run(status, ticketId);
  return getTicketById(ticketId);
}

export function updateTicketFields(ticketId, { priority, category, assignedTo } = {}) {
  const db = getDb();
  const sets = [];
  const params = [];
  if (priority !== undefined) {
    sets.push('priority = ?');
    params.push(priority);
  }
  if (category !== undefined) {
    sets.push('category = ?');
    params.push(category);
  }
  if (assignedTo !== undefined) {
    sets.push('assigned_to = ?');
    params.push(assignedTo);
  }
  if (!sets.length) return getTicketById(ticketId);

  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE support_tickets SET ${sets.join(', ')} WHERE id = ?`).run(...params, ticketId);
  return getTicketById(ticketId);
}

export function touchUpdatedAt(ticketId) {
  const db = getDb();
  db.prepare("UPDATE support_tickets SET updated_at = datetime('now') WHERE id = ?").run(ticketId);
}
