import express from 'express';

import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isValidRole, isValidStatus } from '../utils/validation.js';

export const membershipsRouter = express.Router();

membershipsRouter.use(requireAuth);

membershipsRouter.post('/trees/:id/request-access', (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const userId = req.session.userId;
    const db = getDb();

    const treeExists = db.prepare('SELECT id FROM trees WHERE id = ?').get(treeId);
    if (!treeExists) return res.status(404).json({ error: 'Tree not found' });

    db.prepare(
      `INSERT INTO tree_memberships (user_id, tree_id, role, status)
       VALUES (?, ?, 'viewer', 'pending')
       ON CONFLICT(user_id, tree_id) DO UPDATE SET status = 'pending'`
    ).run(userId, treeId);

    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

membershipsRouter.get('/trees/:id/members', requireTreeRole(['owner']), (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const db = getDb();
    const members = db
      .prepare(
        `SELECT tm.id, tm.user_id, tm.tree_id, tm.role, tm.status, tm.created_at, u.email
         FROM tree_memberships tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.tree_id = ?
         ORDER BY tm.created_at ASC`
      )
      .all(treeId);
    return res.json({ members });
  } catch (error) {
    return next(error);
  }
});

membershipsRouter.patch('/memberships/:id', (req, res, next) => {
  try {
    const membershipId = Number(req.params.id);
    const { role, status } = req.body || {};
    const db = getDb();

    const targetMembership = db
      .prepare('SELECT id, user_id, tree_id, role, status FROM tree_memberships WHERE id = ?')
      .get(membershipId);
    if (!targetMembership) return res.status(404).json({ error: 'Membership not found' });

    const actingMembership = db
      .prepare(
        `SELECT role, status
         FROM tree_memberships
         WHERE user_id = ? AND tree_id = ?`
      )
      .get(req.session.userId, targetMembership.tree_id);

    if (!actingMembership || actingMembership.status !== 'approved' || actingMembership.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }

    const nextRole = typeof role === 'string' ? role : targetMembership.role;
    const nextStatus = typeof status === 'string' ? status : targetMembership.status;

    if (!isValidRole(nextRole) || !isValidStatus(nextStatus)) {
      return res.status(400).json({ error: 'Invalid role or status' });
    }

    if (targetMembership.role === 'owner' && nextRole !== 'owner') {
      return res.status(400).json({ error: 'Owner role cannot be changed here' });
    }

    db.prepare('UPDATE tree_memberships SET role = ?, status = ? WHERE id = ?').run(
      nextRole,
      nextStatus,
      membershipId
    );
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
