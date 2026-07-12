import { query } from '../db/index.js';

export const COMMENT_TARGET_TYPES = ['media', 'event'];

export async function addComment({ userId, targetType, targetId, body }) {
  const { rows } = await query(
    `INSERT INTO comments (target_type, target_id, user_id, body)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [targetType, targetId, userId, body]
  );
  return getCommentById(rows[0].id);
}

export async function getCommentById(id) {
  const { rows } = await query(
    `SELECT c.*, u.full_name AS user_full_name, u.avatar_url AS user_avatar_url, u.email AS user_email
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = $1`,
    [id]
  );
  return rows[0];
}

// Chronological (oldest first) - matches how comment threads read top to bottom.
export async function getComments(targetType, targetId) {
  const { rows } = await query(
    `SELECT c.*, u.full_name AS user_full_name, u.avatar_url AS user_avatar_url, u.email AS user_email
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.target_type = $1 AND c.target_id = $2
     ORDER BY c.created_at ASC`,
    [targetType, targetId]
  );
  return rows;
}

export async function getCommentOwnerId(id) {
  const { rows } = await query('SELECT user_id FROM comments WHERE id = $1', [id]);
  return rows[0]?.user_id ?? null;
}

export async function deleteComment(id) {
  return query('DELETE FROM comments WHERE id = $1', [id]);
}
