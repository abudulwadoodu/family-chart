import express from 'express';

import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { getTreesOwnedByUser, transferTreeOwnership, TransferOwnershipError } from '../models/permissionModel.js';
import { globalSignOutAndDeleteUser } from '../services/cognitoAdmin.js';

export const accountRouter = express.Router();

accountRouter.use(requireAuth);

accountRouter.get('/deletion-check', (req, res, next) => {
  try {
    return res.json({ blockingTrees: getTreesOwnedByUser(req.user.id) });
  } catch (error) {
    return next(error);
  }
});

accountRouter.post('/trees/:id/transfer-ownership', requireTreeRole(['owner']), (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { toUserId } = req.body || {};

    if (!Number.isInteger(toUserId)) {
      return res.status(400).json({ error: 'toUserId is required' });
    }
    if (toUserId === req.user.id) {
      return res.status(400).json({ error: 'You already own this tree' });
    }

    transferTreeOwnership(treeId, req.user.id, toUserId);
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof TransferOwnershipError) {
      return res.status(400).json({ error: 'The selected member no longer has access to this tree' });
    }
    return next(error);
  }
});

accountRouter.delete('/', async (req, res, next) => {
  try {
    const blockingTrees = getTreesOwnedByUser(req.user.id);
    if (blockingTrees.length) {
      return res.status(409).json({
        error: 'You own family trees that have no other owner. Transfer ownership or delete them before deleting your account.',
        blockingTrees,
      });
    }

    try {
      await globalSignOutAndDeleteUser(req.user.email);
    } catch (cognitoError) {
      console.error(cognitoError);
      return res.status(502).json({ error: 'Could not delete your account right now. Please try again.' });
    }

    getDb().prepare('DELETE FROM users WHERE id = ?').run(req.user.id);

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
