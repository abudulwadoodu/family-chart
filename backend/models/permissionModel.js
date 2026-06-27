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

export class TransferOwnershipError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Trees this user owns, annotated with their other members so callers can offer a
// transfer target. Ownership is keyed off trees.owner_id — the column the schema's
// ON DELETE CASCADE actually anchors on — rather than tree_permissions.role, since
// this app only ever assigns one owner per tree (no multi-owner support exists).
export function getTreesOwnedByUser(userId) {
  const db = getDb();
  const ownedTrees = db
    .prepare('SELECT id, name FROM trees WHERE owner_id = ? ORDER BY created_at ASC')
    .all(userId);

  if (!ownedTrees.length) return [];

  const treeIds = ownedTrees.map((tree) => tree.id);
  const placeholders = treeIds.map(() => '?').join(',');
  const otherMembers = db
    .prepare(
      `SELECT tp.tree_id, tp.user_id, tp.role, u.email
       FROM tree_permissions tp
       JOIN users u ON u.id = tp.user_id
       WHERE tp.tree_id IN (${placeholders}) AND tp.user_id != ?
       ORDER BY tp.created_at ASC`
    )
    .all(...treeIds, userId);

  return ownedTrees.map((tree) => {
    const members = otherMembers.filter((member) => member.tree_id === tree.id);
    return {
      id: tree.id,
      name: tree.name,
      editors: members.filter((member) => member.role === 'editor').map((m) => ({ userId: m.user_id, email: m.email })),
      viewers: members.filter((member) => member.role === 'viewer').map((m) => ({ userId: m.user_id, email: m.email })),
    };
  });
}

// Promotes an existing member (editor or viewer) of the tree to owner, then removes
// the current owner's permission row. The target must already be a member — this
// never invites a new user, it only re-assigns ownership among existing collaborators.
export function transferTreeOwnership(treeId, fromUserId, toUserId) {
  const db = getDb();
  const tx = db.transaction(() => {
    const target = db
      .prepare('SELECT id, role FROM tree_permissions WHERE tree_id = ? AND user_id = ?')
      .get(treeId, toUserId);
    if (!target || target.role === 'owner') {
      throw new TransferOwnershipError('INVALID_TRANSFER_TARGET');
    }

    db.prepare("UPDATE tree_permissions SET role = 'owner', updated_at = datetime('now') WHERE id = ?").run(target.id);
    db.prepare('UPDATE trees SET owner_id = ? WHERE id = ?').run(toUserId, treeId);
    db.prepare('DELETE FROM tree_permissions WHERE tree_id = ? AND user_id = ?').run(treeId, fromUserId);
  });
  tx();
}
