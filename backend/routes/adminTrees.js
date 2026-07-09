import express from 'express';

import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { listMembersForAdmin } from '../models/memberModel.js';

export const adminTreesRouter = express.Router();

adminTreesRouter.use(requireAuth, requireAdmin);

// Every route here is read-only by design: admins may inspect trees for support
// and moderation purposes, but must never modify tree data through this module.

const SORTABLE = {
  created_at: 't.created_at',
  updated_at: 'updated_at',
  name: 't.name',
};

function resolveSort(sort, order) {
  const column = SORTABLE[sort] || SORTABLE.created_at;
  const direction = order === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${direction}`;
}

function resolvePagination(page, pageSize) {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  return { limit: safePageSize, offset: (safePage - 1) * safePageSize, page: safePage, pageSize: safePageSize };
}

adminTreesRouter.get('/', async (req, res, next) => {
  try {
    const { search, sort, order, page, pageSize } = req.query;
    const params = [];
    const clauses = [];

    if (search) {
      const like = `%${search}%`;
      params.push(like, like);
      clauses.push(`(t.name ILIKE $${params.length - 1} OR owner.email ILIKE $${params.length})`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const joins = 'LEFT JOIN users owner ON owner.id = t.owner_id LEFT JOIN family_data fd ON fd.tree_id = t.id';

    const totalResult = await query(`SELECT COUNT(*) AS c FROM trees t ${joins} ${where}`, params);
    const total = Number(totalResult.rows[0].c);

    const { limit, offset, page: safePage, pageSize: safePageSize } = resolvePagination(page, pageSize);
    const listParams = [...params, limit, offset];
    const { rows: trees } = await query(
      `SELECT t.id, t.name, t.owner_id, t.created_at, owner.email AS owner_email,
              COALESCE(fd.updated_at, t.created_at) AS updated_at,
              COALESCE(jsonb_array_length(fd.json_data), 0) AS member_count,
              COALESCE(LENGTH(fd.json_data::text), 0) AS storage_bytes,
              (SELECT COUNT(*) FROM tree_permissions tp WHERE tp.tree_id = t.id AND tp.role != 'owner') AS collaborator_count
       FROM trees t ${joins} ${where}
       ORDER BY ${resolveSort(sort, order)} LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    return res.json({ trees, total, page: safePage, pageSize: safePageSize });
  } catch (error) {
    return next(error);
  }
});

adminTreesRouter.get('/members', async (req, res, next) => {
  try {
    const { search, treeId, page, pageSize } = req.query;
    const result = await listMembersForAdmin({ search, treeId, page, pageSize });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

adminTreesRouter.get('/:id', async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { rows: treeRows } = await query(
      `SELECT t.id, t.name, t.owner_id, t.created_at, owner.email AS owner_email,
              COALESCE(fd.updated_at, t.created_at) AS updated_at,
              COALESCE(jsonb_array_length(fd.json_data), 0) AS member_count,
              COALESCE(LENGTH(fd.json_data::text), 0) AS storage_bytes
       FROM trees t
       LEFT JOIN users owner ON owner.id = t.owner_id
       LEFT JOIN family_data fd ON fd.tree_id = t.id
       WHERE t.id = $1`,
      [treeId]
    );
    const tree = treeRows[0];
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const { rows: collaborators } = await query(
      `SELECT tp.user_id, tp.role, u.email
       FROM tree_permissions tp JOIN users u ON u.id = tp.user_id
       WHERE tp.tree_id = $1 ORDER BY tp.role, u.email`,
      [treeId]
    );

    return res.json({ tree, collaborators });
  } catch (error) {
    return next(error);
  }
});

// Read-only tree data for the admin viewer - identical shape to what the owner's
// own viewer consumes, but there is no corresponding write route in this router.
adminTreesRouter.get('/:id/data', async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { rows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [treeId]);
    if (!rows[0]) return res.status(404).json({ error: 'Tree data not found' });
    return res.json({ data: rows[0].json_data });
  } catch (error) {
    return next(error);
  }
});
