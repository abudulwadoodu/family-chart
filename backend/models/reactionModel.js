import { query } from '../db/index.js';

export const REACTION_TARGET_TYPES = ['media', 'event'];

// Toggle semantics in one round trip:
//  - no existing reaction from this user on this target -> insert
//  - existing reaction with the SAME emoji -> remove (un-react)
//  - existing reaction with a DIFFERENT emoji -> swap to the new emoji
// The UNIQUE(target_type, target_id, user_id) constraint on reactions is
// what makes the insert/update half of this a single atomic upsert; the
// delete-on-same-emoji half is a separate statement since ON CONFLICT can't
// express "remove row" as its conflict action.
export async function toggleReaction({ userId, targetType, targetId, emoji }) {
  const { rows: existingRows } = await query(
    `SELECT id, emoji FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3`,
    [targetType, targetId, userId]
  );
  const existing = existingRows[0];

  if (existing && existing.emoji === emoji) {
    await query('DELETE FROM reactions WHERE id = $1', [existing.id]);
    return { action: 'removed', reaction: null };
  }

  const { rows } = await query(
    `INSERT INTO reactions (target_type, target_id, user_id, emoji)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (target_type, target_id, user_id)
     DO UPDATE SET emoji = excluded.emoji, created_at = now()
     RETURNING *`,
    [targetType, targetId, userId, emoji]
  );
  return { action: existing ? 'updated' : 'added', reaction: rows[0] };
}

export async function getReactions(targetType, targetId) {
  const { rows } = await query(
    `SELECT r.*, u.full_name AS user_full_name, u.avatar_url AS user_avatar_url, u.email AS user_email
     FROM reactions r
     JOIN users u ON u.id = r.user_id
     WHERE r.target_type = $1 AND r.target_id = $2
     ORDER BY r.created_at ASC`,
    [targetType, targetId]
  );
  return rows;
}

// Emoji -> count, for a compact summary bar (e.g. "👍 3  ❤️ 1") without
// shipping every reactor's identity to the client on first load.
export async function getReactionSummary(targetType, targetId) {
  const { rows } = await query(
    `SELECT emoji, COUNT(*)::int AS count
     FROM reactions
     WHERE target_type = $1 AND target_id = $2
     GROUP BY emoji
     ORDER BY count DESC`,
    [targetType, targetId]
  );
  return rows;
}
