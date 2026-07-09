import { query } from '../db/index.js';

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

export async function listMediaForAlbum(albumId) {
  const { rows } = await query(
    `SELECT m.*, am.sort_order
     FROM album_media am
     JOIN media m ON m.id = am.media_id
     WHERE am.album_id = $1
     ORDER BY am.sort_order ASC, m.created_at ASC`,
    [albumId]
  );
  return rows;
}

export async function deleteAlbum(id) {
  return query('DELETE FROM albums WHERE id = $1', [id]);
}
