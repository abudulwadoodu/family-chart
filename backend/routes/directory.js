import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { listMembersForTree } from '../models/memberModel.js';

// "Member Directory" - GET /api/trees/:treeId/members. Read-only for every
// role on the tree (owner/editor/viewer), mirroring events.js/commentsRouter's
// mount shape (mergeParams so :treeId comes from app.js's mount path, not a
// param on this router itself).
export const directoryRouter = express.Router({ mergeParams: true });

directoryRouter.use(requireAuth);

directoryRouter.get('/', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const members = await listMembersForTree(Number(req.params.treeId));
    return res.json({ members });
  } catch (error) {
    return next(error);
  }
});
