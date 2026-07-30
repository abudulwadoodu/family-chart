import express from 'express';

import { query } from '../db/index.js';
import { verifyPasscode } from '../utils/passcode.js';

// The one deliberately unauthenticated read path in the app - no requireAuth,
// no requireTreeRole. Reachable only by holding a valid share_token, which is
// unguessable (see utils/shareToken.js) and only ever exposed to the tree
// owner via the owner-only GET/PATCH /:id/share-link routes in trees.js.
export const publicTreesRouter = express.Router();

async function findViewableTree(shareToken) {
  const { rows: treeRows } = await query(
    `SELECT id, name, status, default_main_id, default_generation_depth, link_passcode_hash
     FROM trees
     WHERE share_token = $1 AND link_access = 'view'`,
    [shareToken]
  );
  const tree = treeRows[0];
  // A wrong/reset token, a tree whose owner flipped link_access back to
  // restricted, and a disabled tree all collapse to the same 404 here -
  // there's no reason to tell an anonymous caller which case it is.
  if (!tree || tree.status === 'disabled') return null;
  return tree;
}

async function loadTreePayload(tree) {
  const { rows: familyDataRows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [tree.id]);
  return {
    tree: {
      id: tree.id,
      name: tree.name,
      default_main_id: tree.default_main_id,
      default_generation_depth: tree.default_generation_depth,
    },
    data: familyDataRows[0]?.json_data ?? [],
  };
}

// Passcode-protected trees never return data from the plain GET - only a
// { passcode_required: true } flag, so the tree contents stay hidden from
// anyone who merely has the URL. The frontend then calls the POST /verify
// route below with the passcode to actually fetch the data.
publicTreesRouter.get('/:shareToken', async (req, res, next) => {
  try {
    const tree = await findViewableTree(req.params.shareToken);
    if (!tree) return res.status(404).json({ error: 'This link is no longer available' });

    if (tree.link_passcode_hash) {
      return res.status(401).json({ error: 'This link is protected by a passcode', passcode_required: true });
    }

    return res.json(await loadTreePayload(tree));
  } catch (error) {
    return next(error);
  }
});

publicTreesRouter.post('/:shareToken/verify', async (req, res, next) => {
  try {
    const tree = await findViewableTree(req.params.shareToken);
    if (!tree) return res.status(404).json({ error: 'This link is no longer available' });

    const { passcode } = req.body || {};
    if (!tree.link_passcode_hash) return res.json(await loadTreePayload(tree));

    if (typeof passcode !== 'string' || !verifyPasscode(passcode, tree.link_passcode_hash)) {
      return res.status(403).json({ error: 'Incorrect passcode' });
    }

    return res.json(await loadTreePayload(tree));
  } catch (error) {
    return next(error);
  }
});
