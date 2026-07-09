import { query, withTransaction } from '../db/index.js';

export async function getPermissionByUserAndTree(userId, treeId) {
  const { rows } = await query(
    `SELECT id, tree_id, user_id, role, created_at, updated_at
     FROM tree_permissions
     WHERE user_id = $1 AND tree_id = $2`,
    [userId, treeId]
  );
  return rows[0];
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
export async function getTreesOwnedByUser(userId) {
  const { rows: ownedTrees } = await query('SELECT id, name FROM trees WHERE owner_id = $1 ORDER BY created_at ASC', [
    userId,
  ]);

  if (!ownedTrees.length) return [];

  const treeIds = ownedTrees.map((tree) => tree.id);
  const placeholders = treeIds.map((_, i) => `$${i + 1}`).join(',');
  const { rows: otherMembers } = await query(
    `SELECT tp.tree_id, tp.user_id, tp.role, u.email
     FROM tree_permissions tp
     JOIN users u ON u.id = tp.user_id
     WHERE tp.tree_id IN (${placeholders}) AND tp.user_id != $${treeIds.length + 1}
     ORDER BY tp.created_at ASC`,
    [...treeIds, userId]
  );

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
export async function transferTreeOwnership(treeId, fromUserId, toUserId) {
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id, role FROM tree_permissions WHERE tree_id = $1 AND user_id = $2', [
      treeId,
      toUserId,
    ]);
    const target = rows[0];
    if (!target || target.role === 'owner') {
      throw new TransferOwnershipError('INVALID_TRANSFER_TARGET');
    }

    await client.query("UPDATE tree_permissions SET role = 'owner', updated_at = NOW() WHERE id = $1", [target.id]);
    await client.query('UPDATE trees SET owner_id = $1 WHERE id = $2', [toUserId, treeId]);
    await client.query('DELETE FROM tree_permissions WHERE tree_id = $1 AND user_id = $2', [treeId, fromUserId]);
  });
}
