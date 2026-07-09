import { query } from '../db/index.js';

// member_id is a Datum.id from that tree's family_data.json_data blob, not a
// SQL row (see memberModel.js) - callers are responsible for having already
// confirmed the member exists in the tree's JSON before tagging it here.
export async function tagMember({ mediaId, treeId, memberId, source = 'manual', confidence, box }) {
  const { rows } = await query(
    `INSERT INTO media_tags (media_id, tree_id, member_id, source, confidence, box_x, box_y, box_w, box_h)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [mediaId, treeId, memberId, source, confidence ?? null, box?.x ?? null, box?.y ?? null, box?.w ?? null, box?.h ?? null]
  );
  const { rows: tagRows } = await query('SELECT * FROM media_tags WHERE id = $1', [rows[0].id]);
  return tagRows[0];
}

export async function listTagsForMedia(mediaId) {
  const { rows } = await query('SELECT * FROM media_tags WHERE media_id = $1 ORDER BY created_at ASC', [mediaId]);
  return rows;
}

// Human review step for AI-suggested tags - confirming just stamps
// confirmed_at/confirmed_by, it doesn't change `source`, so the row keeps a
// record that it originated from AI even after acceptance.
export async function confirmAiTag(tagId, confirmedByUserId) {
  return query("UPDATE media_tags SET confirmed_at = NOW(), confirmed_by = $1 WHERE id = $2 AND source = 'ai'", [
    confirmedByUserId,
    tagId,
  ]);
}

export async function removeTag(tagId) {
  return query('DELETE FROM media_tags WHERE id = $1', [tagId]);
}
