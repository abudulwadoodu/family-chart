import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { listActivityForTree } from '../models/activityModel.js';

export const activityRouter = express.Router({ mergeParams: true });

activityRouter.use(requireAuth);

// Data source for the Family Feed panel - same read-access role set as
// events/media GET (any collaborator, including viewer).
activityRouter.get('/', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const activity = await listActivityForTree(Number(req.params.treeId), { requestingUserId: req.user.id });
    return res.json({ activity });
  } catch (error) {
    return next(error);
  }
});
