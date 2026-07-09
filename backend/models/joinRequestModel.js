import { query, withTransaction } from '../db/index.js';

export class JoinRequestError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Trees matching a name search, restricted to is_discoverable = true so
// member data itself never leaks - only the title and owner's email. The
// name match is a simple ILIKE against family_data.json_data's people
// (Datum objects with first/last name fields) on either first or last name,
// which is good enough for "does a tree for this family already exist"
// without needing a dedicated search index.
export async function searchDiscoverableTrees(searchTerm, requestingUserId) {
  const term = `%${searchTerm}%`;
  const { rows } = await query(
    `SELECT DISTINCT t.id, t.name, t.created_at, u.email AS owner_email,
            tp.role AS viewer_role,
            jr.status AS request_status
     FROM trees t
     JOIN users u ON u.id = t.owner_id
     LEFT JOIN family_data fd ON fd.tree_id = t.id
     LEFT JOIN tree_permissions tp ON tp.tree_id = t.id AND tp.user_id = $2
     LEFT JOIN tree_join_requests jr ON jr.tree_id = t.id AND jr.sender_id = $2 AND jr.status = 'pending'
     WHERE t.is_discoverable = true
       AND (
         t.name ILIKE $1
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(fd.json_data, '[]'::jsonb)) AS person
           WHERE (person->'data'->>'first name') ILIKE $1
              OR (person->'data'->>'last name') ILIKE $1
         )
       )
     ORDER BY t.created_at DESC
     LIMIT 25`,
    [term, requestingUserId]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerEmail: row.owner_email,
    membershipStatus: row.viewer_role ? 'member' : row.request_status === 'pending' ? 'pending' : 'none',
  }));
}

export async function getJoinRequestById(id) {
  const { rows } = await query(
    `SELECT id, tree_id, sender_id, role_requested, status, message, request_type, created_at, updated_at FROM tree_join_requests WHERE id = $1`,
    [id]
  );
  return rows[0];
}

export async function createJoinRequest(treeId, senderId, roleRequested, message) {
  const { rows: existingMember } = await query('SELECT id FROM tree_permissions WHERE tree_id = $1 AND user_id = $2', [
    treeId,
    senderId,
  ]);
  if (existingMember[0]) throw new JoinRequestError('ALREADY_MEMBER');

  const { rows: existingRequest } = await query(
    'SELECT id, status FROM tree_join_requests WHERE tree_id = $1 AND sender_id = $2',
    [treeId, senderId]
  );

  if (existingRequest[0]) {
    if (existingRequest[0].status === 'pending') throw new JoinRequestError('ALREADY_PENDING');
    const { rows } = await query(
      `UPDATE tree_join_requests
       SET status = 'pending', role_requested = $1, message = $2, request_type = 'join', updated_at = NOW()
       WHERE id = $3
       RETURNING id, tree_id, sender_id, role_requested, status, message, request_type, created_at, updated_at`,
      [roleRequested, message || null, existingRequest[0].id]
    );
    return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO tree_join_requests (tree_id, sender_id, role_requested, message, request_type)
     VALUES ($1, $2, $3, $4, 'join')
     RETURNING id, tree_id, sender_id, role_requested, status, message, request_type, created_at, updated_at`,
    [treeId, senderId, roleRequested, message || null]
  );
  return rows[0];
}

// A current member of the tree asking the owner to change their role (e.g.
// viewer -> editor). Unlike createJoinRequest, this *requires* the sender
// already be a member, and rejects requesting the role they already have.
export async function createRoleChangeRequest(treeId, senderId, roleRequested, message) {
  const { rows: existingMember } = await query('SELECT role FROM tree_permissions WHERE tree_id = $1 AND user_id = $2', [
    treeId,
    senderId,
  ]);
  const membership = existingMember[0];
  if (!membership) throw new JoinRequestError('NOT_A_MEMBER');
  if (membership.role === 'owner') throw new JoinRequestError('OWNER_CANNOT_REQUEST');
  if (membership.role === roleRequested) throw new JoinRequestError('SAME_ROLE');

  const { rows: existingRequest } = await query(
    'SELECT id, status FROM tree_join_requests WHERE tree_id = $1 AND sender_id = $2',
    [treeId, senderId]
  );

  if (existingRequest[0]) {
    if (existingRequest[0].status === 'pending') throw new JoinRequestError('ALREADY_PENDING');
    const { rows } = await query(
      `UPDATE tree_join_requests
       SET status = 'pending', role_requested = $1, message = $2, request_type = 'role_change', updated_at = NOW()
       WHERE id = $3
       RETURNING id, tree_id, sender_id, role_requested, status, message, request_type, created_at, updated_at`,
      [roleRequested, message || null, existingRequest[0].id]
    );
    return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO tree_join_requests (tree_id, sender_id, role_requested, message, request_type)
     VALUES ($1, $2, $3, $4, 'role_change')
     RETURNING id, tree_id, sender_id, role_requested, status, message, request_type, created_at, updated_at`,
    [treeId, senderId, roleRequested, message || null]
  );
  return rows[0];
}

// Pending requests for every tree owned by this user, joined with the
// requester's email and tree name for display in the "Pending Requests"
// dashboard view.
export async function getPendingRequestsForOwner(ownerId) {
  const { rows } = await query(
    `SELECT jr.id, jr.tree_id, jr.sender_id, jr.role_requested, jr.status, jr.message, jr.request_type, jr.created_at,
            t.name AS tree_name, u.email AS sender_email
     FROM tree_join_requests jr
     JOIN trees t ON t.id = jr.tree_id
     JOIN users u ON u.id = jr.sender_id
     WHERE t.owner_id = $1 AND jr.status = 'pending'
     ORDER BY jr.created_at ASC`,
    [ownerId]
  );
  return rows;
}

// Every request this user has sent (any status), joined with tree name and
// owner email, for the "My Requests" dashboard view - lets a requester see
// pending/approved/rejected without needing an email to tell them apart.
export async function getSentRequestsForUser(senderId) {
  const { rows } = await query(
    `SELECT jr.id, jr.tree_id, jr.role_requested, jr.status, jr.message, jr.request_type, jr.created_at, jr.updated_at,
            t.name AS tree_name, u.email AS owner_email
     FROM tree_join_requests jr
     JOIN trees t ON t.id = jr.tree_id
     JOIN users u ON u.id = t.owner_id
     WHERE jr.sender_id = $1
     ORDER BY jr.updated_at DESC`,
    [senderId]
  );
  return rows;
}

// Approves or rejects a request on behalf of the tree's owner. Approval and
// the resulting tree_permissions grant happen in one transaction so a crash
// between the two can't leave an "approved" request with no actual access.
// The tree_permissions upsert (ON CONFLICT DO UPDATE) handles both request
// types identically: a 'join' request inserts a new row, a 'role_change'
// request updates the sender's existing row to the new role.
// Also returns the requester's email and the tree name so the caller can
// notify the requester of the decision without a second round-trip.
export async function decideJoinRequest(requestId, ownerId, decision) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT jr.id, jr.tree_id, jr.sender_id, jr.role_requested, jr.status, jr.request_type, t.owner_id, t.name AS tree_name,
              u.email AS sender_email
       FROM tree_join_requests jr
       JOIN trees t ON t.id = jr.tree_id
       JOIN users u ON u.id = jr.sender_id
       WHERE jr.id = $1
       FOR UPDATE OF jr`,
      [requestId]
    );
    const request = rows[0];
    if (!request) throw new JoinRequestError('NOT_FOUND');
    if (request.owner_id !== ownerId) throw new JoinRequestError('FORBIDDEN');
    if (request.status !== 'pending') throw new JoinRequestError('ALREADY_DECIDED');

    await client.query('UPDATE tree_join_requests SET status = $1, updated_at = NOW() WHERE id = $2', [
      decision,
      requestId,
    ]);

    if (decision === 'approved') {
      await client.query(
        `INSERT INTO tree_permissions (tree_id, user_id, role, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (tree_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
        [request.tree_id, request.sender_id, request.role_requested]
      );
    }

    return { ...request, status: decision };
  });
}
