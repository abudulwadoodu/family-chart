import { getDb } from '../db/index.js';

export function getPermissionByUserAndTree(userId, treeId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, tree_id, user_id, role, created_at, updated_at
       FROM tree_permissions
       WHERE user_id = ? AND tree_id = ?`
    )
    .get(userId, treeId);
}
