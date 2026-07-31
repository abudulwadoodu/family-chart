import { query, withTransaction } from '../db/index.js';

export class MemberClaimError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function memberExistsInTree(treeId, memberId) {
  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1 FROM family_data, jsonb_array_elements(json_data) AS person
       WHERE tree_id = $1 AND person->>'id' = $2
     ) AS exists`,
    [treeId, memberId]
  );
  return rows[0].exists;
}

// A tree member proposes "this person is me". Always lands as 'pending' -
// self-serve claims are never auto-approved (see 013_member_claims.sql);
// only an owner's decision (decideClaim below) can grant one. Blocks a
// second claim from the same user in the same tree once they already have
// an approved one elsewhere in it - one identity per tree, enforced here
// for a clean error message and again at the DB level (uq_tree_permissions_
// approved_user) as a safety net.
export async function proposeClaim(treeId, userId, memberId, message) {
  const exists = await memberExistsInTree(treeId, memberId);
  if (!exists) throw new MemberClaimError('MEMBER_NOT_FOUND');

  const { rows: permissionRows } = await query(
    'SELECT member_id, claim_status FROM tree_permissions WHERE tree_id = $1 AND user_id = $2',
    [treeId, userId]
  );
  const permission = permissionRows[0];
  if (permission?.claim_status === 'approved') {
    throw new MemberClaimError(permission.member_id === memberId ? 'ALREADY_APPROVED' : 'ALREADY_CLAIMED_ELSEWHERE_IN_TREE');
  }

  const { rows: existingRows } = await query(
    `SELECT id FROM member_claims WHERE tree_id = $1 AND user_id = $2 AND member_id = $3 AND status = 'pending'`,
    [treeId, userId, memberId]
  );
  if (existingRows[0]) throw new MemberClaimError('ALREADY_PENDING');

  const { rows } = await query(
    `INSERT INTO member_claims (tree_id, user_id, member_id, message, source)
     VALUES ($1, $2, $3, $4, 'self_serve')
     RETURNING id, tree_id, user_id, member_id, status, source, message, created_at, updated_at`,
    [treeId, userId, memberId, message || null]
  );
  return rows[0];
}

// Pending claims across every tree this user owns, joined with the
// requester's email and the claimed node's name for display - same shape
// as joinRequestModel.getPendingRequestsForOwner. The LATERAL join tolerates
// a claim whose member_id no longer matches any node (member_name comes
// back null instead of dropping the row) so a stale claim is still visible
// to reject rather than silently disappearing from the list.
export async function getPendingClaimsForOwner(ownerId) {
  const { rows } = await query(
    `SELECT mc.id, mc.tree_id, mc.user_id, mc.member_id, mc.status, mc.source, mc.message, mc.created_at,
            t.name AS tree_name, u.email AS user_email,
            NULLIF(trim(concat_ws(' ', person->'data'->>'first name', person->'data'->>'last name')), '') AS member_name
     FROM member_claims mc
     JOIN trees t ON t.id = mc.tree_id
     JOIN users u ON u.id = mc.user_id
     LEFT JOIN family_data fd ON fd.tree_id = mc.tree_id
     LEFT JOIN LATERAL jsonb_array_elements(fd.json_data) AS person ON person->>'id' = mc.member_id
     WHERE t.owner_id = $1 AND mc.status = 'pending'
     ORDER BY mc.created_at ASC`,
    [ownerId]
  );
  return rows;
}

// Every claim this user has proposed (any status) - mirrors
// joinRequestModel.getSentRequestsForUser so a requester can see whether
// their claim is still pending, was approved, or was rejected.
export async function getSentClaimsForUser(userId) {
  const { rows } = await query(
    `SELECT mc.id, mc.tree_id, mc.member_id, mc.status, mc.source, mc.message, mc.created_at, mc.updated_at,
            t.name AS tree_name,
            NULLIF(trim(concat_ws(' ', person->'data'->>'first name', person->'data'->>'last name')), '') AS member_name
     FROM member_claims mc
     JOIN trees t ON t.id = mc.tree_id
     LEFT JOIN family_data fd ON fd.tree_id = mc.tree_id
     LEFT JOIN LATERAL jsonb_array_elements(fd.json_data) AS person ON person->>'id' = mc.member_id
     WHERE mc.user_id = $1
     ORDER BY mc.updated_at DESC`,
    [userId]
  );
  return rows;
}

// Approves or rejects a claim on behalf of the tree's owner. Approval and
// the resulting tree_permissions upsert happen in one transaction (mirrors
// joinRequestModel.decideJoinRequest) so a crash between the two can't leave
// an "approved" claim with no actual link. The upsert never touches `role` -
// only the claim_* columns - so approving a claim can't accidentally change
// an editor into a viewer or vice versa.
export async function decideClaim(claimId, ownerId, decision) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT mc.id, mc.tree_id, mc.user_id, mc.member_id, mc.status, t.owner_id
       FROM member_claims mc
       JOIN trees t ON t.id = mc.tree_id
       WHERE mc.id = $1
       FOR UPDATE OF mc`,
      [claimId]
    );
    const claim = rows[0];
    if (!claim) throw new MemberClaimError('NOT_FOUND');
    if (claim.owner_id !== ownerId) throw new MemberClaimError('FORBIDDEN');
    if (claim.status !== 'pending') throw new MemberClaimError('ALREADY_DECIDED');

    if (decision === 'approved') {
      const { rows: memberRows } = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM family_data, jsonb_array_elements(json_data) AS person
           WHERE tree_id = $1 AND person->>'id' = $2
         ) AS exists`,
        [claim.tree_id, claim.member_id]
      );
      if (!memberRows[0].exists) {
        await client.query(`UPDATE member_claims SET status = 'withdrawn', updated_at = NOW() WHERE id = $1`, [claimId]);
        throw new MemberClaimError('MEMBER_NO_LONGER_EXISTS');
      }

      try {
        await client.query(
          `INSERT INTO tree_permissions (tree_id, user_id, role, member_id, claim_status, claim_source, claimed_at, claim_decided_by, updated_at)
           VALUES ($1, $2, 'viewer', $3, 'approved', 'self_serve', NOW(), $4, NOW())
           ON CONFLICT (tree_id, user_id) DO UPDATE SET
             member_id = excluded.member_id,
             claim_status = 'approved',
             claim_source = excluded.claim_source,
             claimed_at = NOW(),
             claim_decided_by = excluded.claim_decided_by,
             updated_at = NOW()`,
          [claim.tree_id, claim.user_id, claim.member_id, ownerId]
        );
      } catch (error) {
        if (error.code === '23505') {
          throw new MemberClaimError(
            error.constraint === 'uq_tree_permissions_approved_member' ? 'MEMBER_ALREADY_CLAIMED' : 'USER_ALREADY_CLAIMED_ELSEWHERE'
          );
        }
        throw error;
      }
    }

    await client.query(`UPDATE member_claims SET status = $1, decided_by = $2, decided_at = NOW(), updated_at = NOW() WHERE id = $3`, [
      decision,
      ownerId,
      claimId,
    ]);

    return { ...claim, status: decision };
  });
}
