import { query } from '../db/index.js';
import { mediaAccessCaseSql, shapeForAccess } from './mediaModel.js';

export async function createAlbum({ treeId, name, description, createdBy }) {
  const { rows } = await query(
    `INSERT INTO albums (tree_id, name, description, created_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
    [treeId, name, description ?? null, createdBy]
  );
  return getAlbumById(rows[0].id);
}

export async function getAlbumById(id) {
  const { rows } = await query('SELECT * FROM albums WHERE id = $1', [id]);
  return rows[0];
}

export async function listAlbumsForTree(treeId) {
  const { rows } = await query('SELECT * FROM albums WHERE tree_id = $1 ORDER BY created_at DESC', [treeId]);
  return rows;
}

export async function updateAlbum(id, { name, description }) {
  await query('UPDATE albums SET name = $1, description = $2, updated_at = NOW() WHERE id = $3', [
    name,
    description ?? null,
    id,
  ]);
  return getAlbumById(id);
}

export async function setAlbumCover(albumId, mediaId) {
  return query('UPDATE albums SET cover_media_id = $1, updated_at = NOW() WHERE id = $2', [mediaId, albumId]);
}

export async function addMediaToAlbum(albumId, mediaId, sortOrder = 0) {
  return query(
    `INSERT INTO album_media (album_id, media_id, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT(album_id, media_id) DO UPDATE SET sort_order = excluded.sort_order`,
    [albumId, mediaId, sortOrder]
  );
}

export async function removeMediaFromAlbum(albumId, mediaId) {
  return query('DELETE FROM album_media WHERE album_id = $1 AND media_id = $2', [albumId, mediaId]);
}

// Visibility-filtered same as mediaModel.js's own list functions (reuses
// its access-tier SQL/shaping) - a private item added to a tree-visible
// album must not leak through the album view to anyone but its
// uploader/sharees/the owner (who gets a moderation stub, per the same
// three-tier rule everywhere else).
export async function listMediaForAlbum(albumId, requestingUserId) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT m.*, am.sort_order, ${mediaAccessCaseSql(2)} AS access
       FROM album_media am
       JOIN media m ON m.id = am.media_id
       JOIN trees t ON t.id = m.tree_id
       WHERE am.album_id = $1
     ) m
     WHERE m.access != 'none'
     ORDER BY m.sort_order ASC, m.created_at ASC`,
    [albumId, requestingUserId]
  );
  return rows.map(shapeForAccess);
}

export async function deleteAlbum(id) {
  return query('DELETE FROM albums WHERE id = $1', [id]);
}
