import { query, withTransaction } from '../db/index.js';

export class VaultError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Snapshots are only ever taken of trees.owner_id = userId (not
// tree_permissions membership) - a private vault is scoped to trees this
// user is responsible for, matching the ownership semantics
// permissionModel.getTreesOwnedByUser already uses for account deletion.
// This also guarantees an editor/viewer on someone else's tree can never
// clone that owner's data into their own permanent archive.
export async function createSnapshotForTree(userId, treeId, archiveName) {
  return withTransaction(async (client) => {
    const { rows: treeRows } = await client.query('SELECT id, name, owner_id FROM trees WHERE id = $1 FOR UPDATE', [
      treeId,
    ]);
    const tree = treeRows[0];
    if (!tree) throw new VaultError('TREE_NOT_FOUND');
    if (tree.owner_id !== userId) throw new VaultError('FORBIDDEN');

    const { rows: familyDataRows } = await client.query('SELECT json_data FROM family_data WHERE tree_id = $1', [
      treeId,
    ]);
    const familyData = familyDataRows[0]?.json_data ?? [];

    const { rows } = await client.query(
      `INSERT INTO user_account_archives (user_id, tree_id, archive_name, family_data)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, tree_id, archive_name, family_data, created_at`,
      [userId, treeId, archiveName || tree.name, JSON.stringify(familyData)]
    );
    return rows[0];
  });
}

export async function getSnapshotsForUser(userId) {
  const { rows } = await query(
    `SELECT id, user_id, tree_id, archive_name, created_at
     FROM user_account_archives
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function getSnapshotById(id) {
  const { rows } = await query(
    `SELECT id, user_id, tree_id, archive_name, family_data, created_at
     FROM user_account_archives
     WHERE id = $1`,
    [id]
  );
  return rows[0];
}

// Ownership check lives here (rather than only in the route) so every
// caller - the "view" and "download" routes, and delete - gets the same
// guarantee that a user can only ever touch their own archived snapshots.
export async function getOwnSnapshotById(id, userId) {
  const snapshot = await getSnapshotById(id);
  if (!snapshot || snapshot.user_id !== userId) return null;
  return snapshot;
}

export async function deleteSnapshot(id, userId) {
  const { rowCount } = await query('DELETE FROM user_account_archives WHERE id = $1 AND user_id = $2', [id, userId]);
  return rowCount > 0;
}
