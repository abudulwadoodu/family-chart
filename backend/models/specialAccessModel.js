import { query } from '../db/index.js';

// Single row lookup used by checkPermission's ABAC fallback. expires_at IS NULL means
// a permanent grant; otherwise it must still be in the future to count as active.
export async function getActiveOverride(userId, targetType, targetId) {
  const { rows } = await query(
    `SELECT id, user_id, target_type, target_id, permission_level, expires_at
     FROM special_access_overrides
     WHERE user_id = $1
       AND target_type = $2
       AND target_id = $3
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [userId, targetType, targetId]
  );
  return rows[0];
}

export async function grantOverride({ userId, targetType, targetId, permissionLevel, grantedBy, expiresAt = null }) {
  const { rows } = await query(
    `INSERT INTO special_access_overrides (user_id, target_type, target_id, permission_level, granted_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, target_type, target_id)
     DO UPDATE SET permission_level = EXCLUDED.permission_level,
                    granted_by = EXCLUDED.granted_by,
                    expires_at = EXCLUDED.expires_at
     RETURNING id, user_id, target_type, target_id, permission_level, expires_at`,
    [userId, targetType, targetId, permissionLevel, grantedBy, expiresAt]
  );
  return rows[0];
}

export async function revokeOverride(userId, targetType, targetId) {
  await query('DELETE FROM special_access_overrides WHERE user_id = $1 AND target_type = $2 AND target_id = $3', [
    userId,
    targetType,
    targetId,
  ]);
}

// Admin-facing list for a single resource (e.g. the Tree Detail page's Access
// Overrides panel) - joins in the grantee's and granter's email so the UI never
// has to resolve ids itself. Includes expired rows (annotated via is_expired)
// since an admin reviewing overrides should still see what recently lapsed.
export async function listOverridesForTarget(targetType, targetId) {
  const { rows } = await query(
    `SELECT sao.id, sao.user_id, sao.target_type, sao.target_id, sao.permission_level,
            sao.expires_at, sao.created_at, grantee.email AS user_email,
            granter.email AS granted_by_email, (sao.expires_at IS NOT NULL AND sao.expires_at <= NOW()) AS is_expired
     FROM special_access_overrides sao
     JOIN users grantee ON grantee.id = sao.user_id
     JOIN users granter ON granter.id = sao.granted_by
     WHERE sao.target_type = $1 AND sao.target_id = $2
     ORDER BY sao.created_at DESC`,
    [targetType, targetId]
  );
  return rows;
}
