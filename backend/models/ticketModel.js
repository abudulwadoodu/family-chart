import { query, withTransaction } from '../db/index.js';

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

export async function createTicket({ userId, subject, category, priority = 'normal' }) {
  const ticketId = await withTransaction(async (client) => {
    const insertResult = await client.query(
      `INSERT INTO support_tickets (ticket_number, user_id, subject, category, priority, status)
       VALUES ('', $1, $2, $3, $4, 'NEW') RETURNING id`,
      [userId, subject, category, priority]
    );
    const id = insertResult.rows[0].id;
    await client.query('UPDATE support_tickets SET ticket_number = $1 WHERE id = $2', [ticketNumberFor(id), id]);
    return id;
  });
  return getTicketById(ticketId);
}

export async function getTicketById(ticketId) {
  const { rows } = await query(`SELECT ${TICKET_COLUMNS} FROM support_tickets t WHERE t.id = $1`, [ticketId]);
  return rows[0];
}

export async function getTicketForUser(ticketId, userId) {
  const { rows } = await query(`SELECT ${TICKET_COLUMNS} FROM support_tickets t WHERE t.id = $1 AND t.user_id = $2`, [
    ticketId,
    userId,
  ]);
  return rows[0];
}

function buildFilters({ status, priority, assignedTo, userId }, params) {
  const clauses = [];
  if (userId) {
    params.push(userId);
    clauses.push(`t.user_id = $${params.length}`);
  }
  // 'open' is a virtual status (everything except CLOSED) matching exactly
  // how the admin dashboard's openTickets stat is computed, so the card's
  // count and this filtered list never drift apart.
  if (status === 'open') {
    clauses.push("t.status != 'CLOSED'");
  } else if (status && TICKET_STATUSES.includes(status)) {
    params.push(status);
    clauses.push(`t.status = $${params.length}`);
  }
  if (priority && TICKET_PRIORITIES.includes(priority)) {
    params.push(priority);
    clauses.push(`t.priority = $${params.length}`);
  }
  if (assignedTo === 'unassigned') {
    clauses.push('t.assigned_to IS NULL');
  } else if (assignedTo) {
    params.push(Number(assignedTo));
    clauses.push(`t.assigned_to = $${params.length}`);
  }
  return clauses;
}

export async function listTicketsForUser({ userId, search, status, priority, sort, order, page, pageSize }) {
  const params = [];
  const clauses = buildFilters({ status, priority, userId }, params);

  if (search) {
    const like = `%${search}%`;
    params.push(like, like, like);
    clauses.push(`(t.ticket_number ILIKE $${params.length - 2} OR t.subject ILIKE $${params.length - 1} OR t.category ILIKE $${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalResult = await query(`SELECT COUNT(*) AS c FROM support_tickets t ${where}`, params);
  const total = Number(totalResult.rows[0].c);

  const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
  const listParams = [...params, limit, offset];
  const { rows: tickets } = await query(
    `SELECT ${TICKET_COLUMNS} FROM support_tickets t ${where} ORDER BY ${resolveSort(sort, order)} LIMIT $${
      listParams.length - 1
    } OFFSET $${listParams.length}`,
    listParams
  );

  return { tickets, total, page: safePage, pageSize: safePageSize };
}

export async function listTicketsForAdmin({ search, status, priority, assignedTo, sort, order, page, pageSize }) {
  const params = [];
  const clauses = buildFilters({ status, priority, assignedTo }, params);

  if (search) {
    const like = `%${search}%`;
    params.push(like, like, like, like);
    clauses.push(
      `(t.ticket_number ILIKE $${params.length - 3} OR t.subject ILIKE $${params.length - 2} OR t.category ILIKE $${
        params.length - 1
      } OR owner.email ILIKE $${params.length})`
    );
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const joins = 'LEFT JOIN users owner ON owner.id = t.user_id LEFT JOIN users admin ON admin.id = t.assigned_to';

  const totalResult = await query(`SELECT COUNT(*) AS c FROM support_tickets t ${joins} ${where}`, params);
  const total = Number(totalResult.rows[0].c);

  const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
  const listParams = [...params, limit, offset];
  const { rows: tickets } = await query(
    `SELECT ${TICKET_COLUMNS}, owner.email AS user_email, admin.email AS assigned_admin_email
     FROM support_tickets t ${joins} ${where}
     ORDER BY ${resolveSort(sort, order)} LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return { tickets, total, page: safePage, pageSize: safePageSize };
}

export async function updateTicketStatus(ticketId, status) {
  const closedAtExpr = status === 'CLOSED' ? 'NOW()' : 'NULL';
  await query(`UPDATE support_tickets SET status = $1, closed_at = ${closedAtExpr}, updated_at = NOW() WHERE id = $2`, [
    status,
    ticketId,
  ]);
  return getTicketById(ticketId);
}

export async function updateTicketFields(ticketId, { priority, category, assignedTo } = {}) {
  const sets = [];
  const params = [];
  if (priority !== undefined) {
    params.push(priority);
    sets.push(`priority = $${params.length}`);
  }
  if (category !== undefined) {
    params.push(category);
    sets.push(`category = $${params.length}`);
  }
  if (assignedTo !== undefined) {
    params.push(assignedTo);
    sets.push(`assigned_to = $${params.length}`);
  }
  if (!sets.length) return getTicketById(ticketId);

  sets.push('updated_at = NOW()');
  params.push(ticketId);
  await query(`UPDATE support_tickets SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return getTicketById(ticketId);
}

export async function touchUpdatedAt(ticketId) {
  await query('UPDATE support_tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);
}
