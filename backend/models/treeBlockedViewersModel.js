import { query } from '../db/index.js';

// Case-insensitive throughout (lower(email)) since email addresses are
// case-insensitive in practice and a guest could otherwise dodge a block by
// varying case.
export async function blockViewer({ treeId, email, blockedBy }) {
  await query(
    `INSERT INTO tree_blocked_viewers (tree_id, email, blocked_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (tree_id, lower(email)) DO UPDATE SET blocked_at = now(), blocked_by = $3`,
    [treeId, email, blockedBy ?? null]
  );
}

export async function unblockViewer({ treeId, email }) {
  await query('DELETE FROM tree_blocked_viewers WHERE tree_id = $1 AND lower(email) = lower($2)', [treeId, email]);
}

export async function isViewerBlocked({ treeId, email }) {
  const { rows } = await query('SELECT 1 FROM tree_blocked_viewers WHERE tree_id = $1 AND lower(email) = lower($2)', [
    treeId,
    email,
  ]);
  return rows.length > 0;
}
