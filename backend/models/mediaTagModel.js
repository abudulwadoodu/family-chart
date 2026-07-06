import { getDb } from '../db/index.js';

// member_id is a Datum.id from that tree's family_data.json_data blob, not a
// SQL row (see memberModel.js) - callers are responsible for having already
// confirmed the member exists in the tree's JSON before tagging it here.
export function tagMember({ mediaId, treeId, memberId, source = 'manual', confidence, box }) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO media_tags (media_id, tree_id, member_id, source, confidence, box_x, box_y, box_w, box_h)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      mediaId,
      treeId,
      memberId,
      source,
      confidence ?? null,
      box?.x ?? null,
      box?.y ?? null,
      box?.w ?? null,
      box?.h ?? null
    );
  return db.prepare('SELECT * FROM media_tags WHERE id = ?').get(result.lastInsertRowid);
}

export function listTagsForMedia(mediaId) {
  const db = getDb();
  return db.prepare('SELECT * FROM media_tags WHERE media_id = ? ORDER BY created_at ASC').all(mediaId);
}

// Human review step for AI-suggested tags - confirming just stamps
// confirmed_at/confirmed_by, it doesn't change `source`, so the row keeps a
// record that it originated from AI even after acceptance.
export function confirmAiTag(tagId, confirmedByUserId) {
  const db = getDb();
  return db
    .prepare("UPDATE media_tags SET confirmed_at = datetime('now'), confirmed_by = ? WHERE id = ? AND source = 'ai'")
    .run(confirmedByUserId, tagId);
}

export function removeTag(tagId) {
  const db = getDb();
  return db.prepare('DELETE FROM media_tags WHERE id = ?').run(tagId);
}
