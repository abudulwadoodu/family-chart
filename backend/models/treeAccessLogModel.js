import { query } from '../db/index.js';

// Written once per successful email-verified view (never for passcode-only
// views - see backend/routes/publicTrees.js). Deliberately separate from
// audit_logs: this is guest-facing access history the tree owner reviews,
// not an admin/actor audit trail.
export async function createAccessLogEntry({ treeId, viewerEmail, ipAddress, shareToken, userAgent }) {
  await query(
    `INSERT INTO tree_access_log (tree_id, viewer_email, ip_address, share_token, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [treeId, viewerEmail, ipAddress ?? null, shareToken ?? null, userAgent ?? null]
  );
}

// One row per distinct viewer email, most-recent view first - the owner
// wants "who has viewed this and when did I last see them", not a raw event
// feed of every reload.
export async function listAccessLogForTree(treeId) {
  const { rows } = await query(
    `SELECT viewer_email, MAX(created_at) AS last_viewed_at, COUNT(*) AS view_count
     FROM tree_access_log
     WHERE tree_id = $1
     GROUP BY viewer_email
     ORDER BY last_viewed_at DESC`,
    [treeId]
  );
  return rows;
}
