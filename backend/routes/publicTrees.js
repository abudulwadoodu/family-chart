import express from 'express';

import { query } from '../db/index.js';

// The one deliberately unauthenticated read path in the app - no requireAuth,
// no requireTreeRole. Reachable only by holding a valid share_token, which is
// unguessable (see utils/shareToken.js) and only ever exposed to the tree
// owner via the owner-only GET/PATCH /:id/share-link routes in trees.js.
export const publicTreesRouter = express.Router();

publicTreesRouter.get('/:shareToken', async (req, res, next) => {
  try {
    const { shareToken } = req.params;

    const { rows: treeRows } = await query(
      `SELECT id, name, status, default_main_id, default_generation_depth
       FROM trees
       WHERE share_token = $1 AND link_access = 'view'`,
      [shareToken]
    );
    const tree = treeRows[0];
    // A wrong/reset token, a tree whose owner flipped link_access back to
    // restricted, and a disabled tree all collapse to the same 404 here -
    // there's no reason to tell an anonymous caller which case it is.
    if (!tree || tree.status === 'disabled') return res.status(404).json({ error: 'This link is no longer available' });

    const { rows: familyDataRows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [tree.id]);

    return res.json({
      tree: {
        id: tree.id,
        name: tree.name,
        default_main_id: tree.default_main_id,
        default_generation_depth: tree.default_generation_depth,
      },
      data: familyDataRows[0]?.json_data ?? [],
    });
  } catch (error) {
    return next(error);
  }
});
