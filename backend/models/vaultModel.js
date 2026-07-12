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

// Restores a snapshot's frozen family_data into a brand-new tree, owned by
// the same user who owns the snapshot. Mirrors the trees/CSV-JSON-GEDOM
// "create" flow (backend/routes/trees.js POST '/') - insert trees row, seed
// tree_permissions as owner, then write family_data - just sourced from the
// archive instead of getDefaultTreeDataJson().
export async function restoreSnapshotAsNewTree(snapshotId, userId, treeName) {
  return withTransaction(async (client) => {
    const { rows: snapshotRows } = await client.query(
      'SELECT id, user_id, archive_name, family_data FROM user_account_archives WHERE id = $1 FOR UPDATE',
      [snapshotId]
    );
    const snapshot = snapshotRows[0];
    if (!snapshot || snapshot.user_id !== userId) throw new VaultError('ARCHIVE_NOT_FOUND');

    const name = (treeName || snapshot.archive_name || 'Restored Tree').slice(0, 120);

    const { rows: treeRows } = await client.query('INSERT INTO trees (name, owner_id) VALUES ($1, $2) RETURNING id', [
      name,
      userId,
    ]);
    const treeId = treeRows[0].id;

    await client.query(
      "INSERT INTO tree_permissions (tree_id, user_id, role, updated_at) VALUES ($1, $2, 'owner', NOW())",
      [treeId, userId]
    );
    await client.query('INSERT INTO family_data (tree_id, json_data, updated_at) VALUES ($1, $2, NOW())', [
      treeId,
      JSON.stringify(snapshot.family_data ?? []),
    ]);

    return { id: treeId, name };
  });
}

// Overwrites an existing tree's family_data with a snapshot's frozen copy -
// same "import replaces everything" semantics as upsertFamilyData in
// backend/routes/trees.js. Restricted to trees this user owns (checked here,
// not just via requireTreeRole, so a snapshot can never be replayed into a
// tree the caller merely edits) and to snapshots this user owns.
export async function restoreSnapshotIntoTree(snapshotId, userId, treeId) {
  return withTransaction(async (client) => {
    const { rows: snapshotRows } = await client.query(
      'SELECT id, user_id, family_data FROM user_account_archives WHERE id = $1 FOR UPDATE',
      [snapshotId]
    );
    const snapshot = snapshotRows[0];
    if (!snapshot || snapshot.user_id !== userId) throw new VaultError('ARCHIVE_NOT_FOUND');

    const { rows: treeRows } = await client.query('SELECT id, name, owner_id FROM trees WHERE id = $1 FOR UPDATE', [
      treeId,
    ]);
    const tree = treeRows[0];
    if (!tree) throw new VaultError('TREE_NOT_FOUND');
    if (tree.owner_id !== userId) throw new VaultError('FORBIDDEN');

    await client.query(
      `INSERT INTO family_data (tree_id, json_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT(tree_id) DO UPDATE SET json_data = excluded.json_data, updated_at = excluded.updated_at`,
      [treeId, JSON.stringify(snapshot.family_data ?? [])]
    );

    return { id: tree.id, name: tree.name };
  });
}
