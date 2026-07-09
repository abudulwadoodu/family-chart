import { query } from '../db/index.js';

export async function createMedia({
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
  const { rows } = await query(
    `INSERT INTO media (
       tree_id, kind, storage_key, mime_type, file_size, width, height,
       duration_seconds, page_count, title, description, taken_at, uploaded_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()) RETURNING id`,
    [
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
      uploadedBy,
    ]
  );
  return getMediaById(rows[0].id);
}

export async function getMediaById(id) {
  const { rows } = await query('SELECT * FROM media WHERE id = $1', [id]);
  return rows[0];
}

export async function listMediaForTree(treeId, { kind } = {}) {
  if (kind) {
    const { rows } = await query(
      'SELECT * FROM media WHERE tree_id = $1 AND kind = $2 ORDER BY COALESCE(taken_at, created_at) DESC',
      [treeId, kind]
    );
    return rows;
  }
  const { rows } = await query('SELECT * FROM media WHERE tree_id = $1 ORDER BY COALESCE(taken_at, created_at) DESC', [
    treeId,
  ]);
  return rows;
}

// Every photo/video/document tagged with this person, across the tree -
// powers a per-person media gallery on the card/profile view.
export async function listMediaForMember(treeId, memberId) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT DISTINCT ON (m.id) m.*
       FROM media m
       JOIN media_tags mt ON mt.media_id = m.id
       WHERE mt.tree_id = $1 AND mt.member_id = $2
     ) m
     ORDER BY COALESCE(m.taken_at, m.created_at) DESC`,
    [treeId, memberId]
  );
  return rows;
}

// Everywhere this media item is currently linked - shown in the delete
// confirmation so removing it from one place (or permanently) doesn't
// silently break other albums/events/person tags that reference it.
export async function getMediaUsage(mediaId) {
  const { rows: albums } = await query(
    `SELECT a.id, a.name FROM album_media am JOIN albums a ON a.id = am.album_id WHERE am.media_id = $1`,
    [mediaId]
  );
  const { rows: events } = await query(
    `SELECT e.id, e.title FROM event_media em JOIN events e ON e.id = em.event_id WHERE em.media_id = $1`,
    [mediaId]
  );
  const taggedResult = await query('SELECT COUNT(*) AS count FROM media_tags WHERE media_id = $1', [mediaId]);
  const taggedMemberCount = Number(taggedResult.rows[0].count);
  return { albums, events, taggedMemberCount };
}

export async function updateMedia(id, { title, description, takenAt }) {
  await query(`UPDATE media SET title = $1, description = $2, taken_at = $3, updated_at = NOW() WHERE id = $4`, [
    title ?? null,
    description ?? null,
    takenAt ?? null,
    id,
  ]);
  return getMediaById(id);
}

export async function deleteMedia(id) {
  return query('DELETE FROM media WHERE id = $1', [id]);
}
