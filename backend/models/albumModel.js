import { getDb } from '../db/index.js';

export function createAlbum({ treeId, name, description, createdBy }) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO albums (tree_id, name, description, created_by, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
    .run(treeId, name, description ?? null, createdBy);
  return getAlbumById(result.lastInsertRowid);
}

export function getAlbumById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM albums WHERE id = ?').get(id);
}

export function listAlbumsForTree(treeId) {
  const db = getDb();
  return db.prepare('SELECT * FROM albums WHERE tree_id = ? ORDER BY created_at DESC').all(treeId);
}

export function updateAlbum(id, { name, description }) {
  const db = getDb();
  db.prepare("UPDATE albums SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?").run(
    name,
    description ?? null,
    id
  );
  return getAlbumById(id);
}

export function setAlbumCover(albumId, mediaId) {
  const db = getDb();
  return db
    .prepare("UPDATE albums SET cover_media_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(mediaId, albumId);
}

export function addMediaToAlbum(albumId, mediaId, sortOrder = 0) {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO album_media (album_id, media_id, sort_order)
       VALUES (?, ?, ?)
       ON CONFLICT(album_id, media_id) DO UPDATE SET sort_order = excluded.sort_order`
    )
    .run(albumId, mediaId, sortOrder);
}

export function removeMediaFromAlbum(albumId, mediaId) {
  const db = getDb();
  return db.prepare('DELETE FROM album_media WHERE album_id = ? AND media_id = ?').run(albumId, mediaId);
}

export function listMediaForAlbum(albumId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT m.*, am.sort_order
       FROM album_media am
       JOIN media m ON m.id = am.media_id
       WHERE am.album_id = ?
       ORDER BY am.sort_order ASC, m.created_at ASC`
    )
    .all(albumId);
}

export function deleteAlbum(id) {
  const db = getDb();
  return db.prepare('DELETE FROM albums WHERE id = ?').run(id);
}
