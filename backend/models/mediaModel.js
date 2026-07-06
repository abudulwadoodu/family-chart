import { getDb } from '../db/index.js';

export function createMedia({
  treeId,
  kind,
  storageKey,
  mimeType,
  fileSize,
  width,
  height,
  durationSeconds,
  pageCount,
  title,
  description,
  takenAt,
  uploadedBy,
}) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO media (
         tree_id, kind, storage_key, mime_type, file_size, width, height,
         duration_seconds, page_count, title, description, taken_at, uploaded_by, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      treeId,
      kind,
      storageKey,
      mimeType,
      fileSize ?? null,
      width ?? null,
      height ?? null,
      durationSeconds ?? null,
      pageCount ?? null,
      title ?? null,
      description ?? null,
      takenAt ?? null,
      uploadedBy
    );
  return getMediaById(result.lastInsertRowid);
}

export function getMediaById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM media WHERE id = ?').get(id);
}

export function listMediaForTree(treeId, { kind } = {}) {
  const db = getDb();
  if (kind) {
    return db
      .prepare('SELECT * FROM media WHERE tree_id = ? AND kind = ? ORDER BY COALESCE(taken_at, created_at) DESC')
      .all(treeId, kind);
  }
  return db
    .prepare('SELECT * FROM media WHERE tree_id = ? ORDER BY COALESCE(taken_at, created_at) DESC')
    .all(treeId);
}

// Every photo/video/document tagged with this person, across the tree -
// powers a per-person media gallery on the card/profile view.
export function listMediaForMember(treeId, memberId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT m.*
       FROM media m
       JOIN media_tags mt ON mt.media_id = m.id
       WHERE mt.tree_id = ? AND mt.member_id = ?
       ORDER BY COALESCE(m.taken_at, m.created_at) DESC`
    )
    .all(treeId, memberId);
}

// Everywhere this media item is currently linked - shown in the delete
// confirmation so removing it from one place (or permanently) doesn't
// silently break other albums/events/person tags that reference it.
export function getMediaUsage(mediaId) {
  const db = getDb();
  const albums = db
    .prepare(`SELECT a.id, a.name FROM album_media am JOIN albums a ON a.id = am.album_id WHERE am.media_id = ?`)
    .all(mediaId);
  const events = db
    .prepare(`SELECT e.id, e.title FROM event_media em JOIN events e ON e.id = em.event_id WHERE em.media_id = ?`)
    .all(mediaId);
  const taggedMemberCount = db.prepare('SELECT COUNT(*) AS count FROM media_tags WHERE media_id = ?').get(mediaId).count;
  return { albums, events, taggedMemberCount };
}

export function updateMedia(id, { title, description, takenAt }) {
  const db = getDb();
  db.prepare(
    `UPDATE media SET title = ?, description = ?, taken_at = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title ?? null, description ?? null, takenAt ?? null, id);
  return getMediaById(id);
}

export function deleteMedia(id) {
  const db = getDb();
  return db.prepare('DELETE FROM media WHERE id = ?').run(id);
}
