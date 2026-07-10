import { query, withTransaction } from '../db/index.js';

// Shared access-tier expression, embedded (as a SELECT column, computed
// once per row and then referenced by its `access` alias in an outer WHERE
// - never recomputed/duplicated) into every list/lookup query that returns
// media rows to a specific requesting user. Three possible values:
//   'full' - tree-wide, or requester uploaded it, or requester is explicitly
//            shared on it. Real content should be returned.
//   'stub' - private AND shared with someone (i.e. NOT "only me"), requester
//            is the tree owner but not the uploader/a sharee. Caller must
//            strip storage_key/file-bearing fields and use this only for
//            moderation metadata - never serve file bytes for a stub row.
//   'none' - everything else. Caller must exclude the row entirely.
// Joins against trees.owner_id (not tree_permissions.role='owner') since
// that's the canonical ownership column - see permissionModel.js's comment
// that this app only ever assigns one owner per tree via trees.owner_id.
// `$N` is the requestingUserId parameter's positional index for that query.
// Exported so eventModel.js's listMediaForEvent (a different join path onto
// these same media rows) can reuse the identical access-tier logic rather
// than reimplementing it.
export function mediaAccessCaseSql(requestingUserIdParamIndex) {
  const p = `$${requestingUserIdParamIndex}`;
  return `
    CASE
      WHEN m.visibility = 'tree' THEN 'full'
      WHEN m.uploaded_by = ${p} THEN 'full'
      WHEN EXISTS (SELECT 1 FROM media_shares ms WHERE ms.media_id = m.id AND ms.user_id = ${p}) THEN 'full'
      WHEN t.owner_id = ${p} AND EXISTS (SELECT 1 FROM media_shares ms WHERE ms.media_id = m.id) THEN 'stub'
      ELSE 'none'
    END
  `;
}

// Fields safe to expose on a 'stub' row - metadata for moderation, never the
// actual file. Applied in JS after the query rather than in SQL so the same
// row shape/column list doesn't have to be duplicated per call site. Exported
// for the same reason as mediaAccessCaseSql above.
const STUB_SAFE_FIELDS = ['id', 'tree_id', 'kind', 'title', 'uploaded_by', 'created_at', 'access'];

export function shapeForAccess(row) {
  if (row.access === 'stub') {
    const stub = {};
    for (const field of STUB_SAFE_FIELDS) stub[field] = row[field];
    return stub;
  }
  return row;
}

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
  visibility = 'tree',
}) {
  const { rows } = await query(
    `INSERT INTO media (
       tree_id, kind, storage_key, mime_type, file_size, width, height,
       duration_seconds, page_count, title, description, taken_at, uploaded_by, visibility, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW()) RETURNING id`,
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
      visibility,
    ]
  );
  return getMediaById(rows[0].id);
}

export async function getMediaById(id) {
  const { rows } = await query('SELECT * FROM media WHERE id = $1', [id]);
  return rows[0];
}

// Resolves this requester's access tier to a single media item - used by the
// single-item routes (GET .../file, GET .../usage, PATCH, DELETE) which look
// the row up individually rather than through one of the list queries below.
export async function resolveMediaAccess(media, requestingUserId) {
  const { rows } = await query(
    `SELECT t.owner_id,
            (m.visibility = 'tree') AS is_tree,
            (m.uploaded_by = $2) AS is_uploader,
            EXISTS (SELECT 1 FROM media_shares ms WHERE ms.media_id = m.id AND ms.user_id = $2) AS is_sharee,
            EXISTS (SELECT 1 FROM media_shares ms WHERE ms.media_id = m.id) AS has_any_share
     FROM media m
     JOIN trees t ON t.id = m.tree_id
     WHERE m.id = $1`,
    [media.id, requestingUserId]
  );
  const row = rows[0];
  if (!row) return 'none';
  if (row.is_tree || row.is_uploader || row.is_sharee) return 'full';
  if (row.owner_id === requestingUserId && row.has_any_share) return 'stub';
  return 'none';
}

export async function listMediaForTree(treeId, { kind, requestingUserId } = {}) {
  const params = [treeId, requestingUserId];
  let sql = `
    SELECT * FROM (
      SELECT m.*, ${mediaAccessCaseSql(2)} AS access
      FROM media m
      JOIN trees t ON t.id = m.tree_id
      WHERE m.tree_id = $1
    ) m
    WHERE m.access != 'none'
  `;
  if (kind) {
    params.push(kind);
    sql += ` AND m.kind = $${params.length}`;
  }
  sql += ' ORDER BY COALESCE(m.taken_at, m.created_at) DESC';
  const { rows } = await query(sql, params);
  return rows.map(shapeForAccess);
}

// Every photo/video/document tagged with this person, across the tree -
// powers a per-person media gallery on the card/profile view.
export async function listMediaForMember(treeId, memberId, requestingUserId) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT DISTINCT ON (m.id) m.*, ${mediaAccessCaseSql(3)} AS access
       FROM media m
       JOIN trees t ON t.id = m.tree_id
       JOIN media_tags mt ON mt.media_id = m.id
       WHERE mt.tree_id = $1 AND mt.member_id = $2
     ) m
     WHERE m.access != 'none'
     ORDER BY COALESCE(m.taken_at, m.created_at) DESC`,
    [treeId, memberId, requestingUserId]
  );
  return rows.map(shapeForAccess);
}

// Only the uploader or the tree owner may change an item's visibility -
// a different editor can still edit title/description via updateMedia, but
// not who it's shared with. Throws (route maps to 403) otherwise.
export class VisibilityForbiddenError extends Error {}

export async function setMediaVisibility(mediaId, visibility, shareUserIds, requestingUserId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT m.tree_id, m.uploaded_by, t.owner_id FROM media m JOIN trees t ON t.id = m.tree_id WHERE m.id = $1`,
      [mediaId]
    );
    const media = rows[0];
    if (!media) throw new Error('Media not found');
    if (media.uploaded_by !== requestingUserId && media.owner_id !== requestingUserId) {
      throw new VisibilityForbiddenError('Only the uploader or tree owner can change visibility');
    }

    await client.query('UPDATE media SET visibility = $1, updated_at = NOW() WHERE id = $2', [visibility, mediaId]);
    await client.query('DELETE FROM media_shares WHERE media_id = $1', [mediaId]);
    if (visibility === 'private' && shareUserIds?.length) {
      const values = shareUserIds.map((_, i) => `($1, $2, $${i + 3})`).join(', ');
      await client.query(
        `INSERT INTO media_shares (media_id, tree_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [mediaId, media.tree_id, ...shareUserIds]
      );
    }
  });
}

export async function listShareUserIdsForMedia(mediaId) {
  const { rows } = await query('SELECT user_id FROM media_shares WHERE media_id = $1', [mediaId]);
  return rows.map((row) => row.user_id);
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
