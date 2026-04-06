import { getDb } from '../db/index.js';

export function getMembershipByUserAndTree(userId, treeId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, user_id, tree_id, role, status
       FROM tree_memberships
       WHERE user_id = ? AND tree_id = ?`
    )
    .get(userId, treeId);
}
