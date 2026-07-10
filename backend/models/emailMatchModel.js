import { query, withTransaction } from '../db/index.js';

// Trees where a person-node's data.email matches this user's email
// (case-insensitively, trimmed), excluding trees they're already a member of
// or already have a pending join request for. Unlike
// joinRequestModel.searchDiscoverableTrees, does NOT require
// is_discoverable = true - an email match is a stronger signal of legitimate
// association than a name/tree-name text search hit. This function only
// ever offers a manual "Request to Join" button; it never grants access
// itself (see autoGrantEmailVisibility below for the auto-grant path).
export async function findTreesMatchingUserEmail(userEmail, requestingUserId) {
  const { rows } = await query(
    `SELECT DISTINCT t.id, t.name, t.created_at, u.email AS owner_email
     FROM trees t
     JOIN users u ON u.id = t.owner_id
     JOIN family_data fd ON fd.tree_id = t.id
     LEFT JOIN tree_permissions tp ON tp.tree_id = t.id AND tp.user_id = $2
     LEFT JOIN tree_join_requests jr ON jr.tree_id = t.id AND jr.sender_id = $2 AND jr.status = 'pending'
     WHERE tp.id IS NULL
       AND jr.id IS NULL
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(fd.json_data) AS person
         WHERE person->'data'->>'email' <> ''
           AND lower(trim(person->'data'->>'email')) = lower(trim($1))
       )
     ORDER BY t.created_at DESC
     LIMIT 25`,
    [userEmail, requestingUserId]
  );
  return rows.map((row) => ({ id: row.id, name: row.name, ownerEmail: row.owner_email }));
}

// For a user who just (re-)authenticated: finds every tree with
// email_auto_visibility = true whose family_data contains a person-node
// matching this user's email, and upserts a 'viewer' tree_permissions row
// for each. Idempotent (ON CONFLICT DO UPDATE, same idiom as
// joinRequestModel.decideJoinRequest's approval path). Never downgrades an
// existing editor/owner - the WHERE clause only considers trees where the
// user has no row yet or is already exactly 'viewer'. Returns the tree ids
// granted/reaffirmed this call.
export async function autoGrantEmailVisibility(userId, userEmail) {
  return withTransaction(async (client) => {
    const { rows: matchingTrees } = await client.query(
      `SELECT DISTINCT t.id
       FROM trees t
       JOIN family_data fd ON fd.tree_id = t.id
       LEFT JOIN tree_permissions tp ON tp.tree_id = t.id AND tp.user_id = $2
       WHERE t.email_auto_visibility = true
         AND (tp.id IS NULL OR tp.role = 'viewer')
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(fd.json_data) AS person
           WHERE person->'data'->>'email' <> ''
             AND lower(trim(person->'data'->>'email')) = lower(trim($1))
         )`,
      [userEmail, userId]
    );

    const grantedTreeIds = [];
    for (const { id: treeId } of matchingTrees) {
      await client.query(
        `INSERT INTO tree_permissions (tree_id, user_id, role, updated_at)
         VALUES ($1, $2, 'viewer', NOW())
         ON CONFLICT (tree_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
        [treeId, userId]
      );
      grantedTreeIds.push(treeId);
    }
    return grantedTreeIds;
  });
}
