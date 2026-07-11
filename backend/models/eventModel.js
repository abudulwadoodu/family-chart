import { query, withTransaction } from '../db/index.js';
import { mediaAccessCaseSql, shapeForAccess } from './mediaModel.js';

// Same three-tier access model as mediaModel.js's mediaAccessCaseSql -
// 'full' (tree-wide, creator, or explicit sharee), 'stub' (private+shared,
// requester is the tree owner but not creator/sharee - moderation metadata
// only), 'none' (excluded entirely). See mediaModel.js's top-of-file comment
// for the full rationale; kept in sync deliberately rather than factored
// into one cross-table helper, since events/media are different tables with
// different owner/creator column names. Exported so activityModel.js's feed
// query (a different join path onto these same event rows, same as this
// file's own listMediaForEvent reuses mediaAccessCaseSql) can reuse the
// identical access-tier logic rather than reimplementing it.
export function eventAccessCaseSql(requestingUserIdParamIndex) {
  const p = `$${requestingUserIdParamIndex}`;
  return `
    CASE
      WHEN e.visibility = 'tree' THEN 'full'
      WHEN e.created_by = ${p} THEN 'full'
      WHEN EXISTS (SELECT 1 FROM event_shares es WHERE es.event_id = e.id AND es.user_id = ${p}) THEN 'full'
      WHEN t.owner_id = ${p} AND EXISTS (SELECT 1 FROM event_shares es WHERE es.event_id = e.id) THEN 'stub'
      ELSE 'none'
    END
  `;
}

const EVENT_STUB_SAFE_FIELDS = ['id', 'tree_id', 'title', 'event_type', 'created_by', 'created_at', 'access'];

function shapeEventForAccess(row) {
  if (row.access === 'stub') {
    const stub = {};
    for (const field of EVENT_STUB_SAFE_FIELDS) stub[field] = row[field];
    return stub;
  }
  return row;
}

export async function createEvent({
  treeId,
  title,
  eventType,
  description,
  eventDate,
  datePrecision = 'day',
  location,
  createdBy,
  visibility = 'tree',
}) {
  const { rows } = await query(
    `INSERT INTO events (
       tree_id, title, event_type, description, event_date, date_precision, location, created_by, visibility, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id`,
    [
      treeId,
      title,
      eventType ?? null,
      description ?? null,
      eventDate ?? null,
      datePrecision,
      location ?? null,
      createdBy,
      visibility,
    ]
  );
  return getEventById(rows[0].id);
}

export async function getEventById(id) {
  const { rows } = await query('SELECT * FROM events WHERE id = $1', [id]);
  return rows[0];
}

// Resolves this requester's access tier to a single event - used by GET
// /:eventId, which looks the row up individually rather than through
// listEventsForTree.
export async function resolveEventAccess(event, requestingUserId) {
  const { rows } = await query(
    `SELECT t.owner_id,
            (e.visibility = 'tree') AS is_tree,
            (e.created_by = $2) AS is_creator,
            EXISTS (SELECT 1 FROM event_shares es WHERE es.event_id = e.id AND es.user_id = $2) AS is_sharee,
            EXISTS (SELECT 1 FROM event_shares es WHERE es.event_id = e.id) AS has_any_share
     FROM events e
     JOIN trees t ON t.id = e.tree_id
     WHERE e.id = $1`,
    [event.id, requestingUserId]
  );
  const row = rows[0];
  if (!row) return 'none';
  if (row.is_tree || row.is_creator || row.is_sharee) return 'full';
  if (row.owner_id === requestingUserId && row.has_any_share) return 'stub';
  return 'none';
}

// Ordered by event_date (nulls last) - this is the query the timeline view
// is built on, optionally narrowed to a single member via event_participants.
export async function listEventsForTree(treeId, { memberId, requestingUserId } = {}) {
  if (memberId) {
    const { rows } = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (e.id) e.*, ${eventAccessCaseSql(4)} AS access
         FROM events e
         JOIN trees t ON t.id = e.tree_id
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE e.tree_id = $1 AND ep.tree_id = $2 AND ep.member_id = $3
       ) e
       WHERE e.access != 'none'
       ORDER BY (e.event_date IS NULL), e.event_date ASC`,
      [treeId, treeId, memberId, requestingUserId]
    );
    return rows.map(shapeEventForAccess);
  }
  const { rows } = await query(
    `SELECT * FROM (
       SELECT e.*, ${eventAccessCaseSql(2)} AS access
       FROM events e
       JOIN trees t ON t.id = e.tree_id
       WHERE e.tree_id = $1
     ) e
     WHERE e.access != 'none'
     ORDER BY (e.event_date IS NULL), e.event_date ASC`,
    [treeId, requestingUserId]
  );
  return rows.map(shapeEventForAccess);
}

export async function updateEvent(id, { title, eventType, description, eventDate, datePrecision, location }) {
  await query(
    `UPDATE events SET title = $1, event_type = $2, description = $3, event_date = $4, date_precision = $5, location = $6, updated_at = NOW()
     WHERE id = $7`,
    [title, eventType ?? null, description ?? null, eventDate ?? null, datePrecision ?? 'day', location ?? null, id]
  );
  return getEventById(id);
}

// Only the creator or the tree owner may change an event's visibility -
// mirrors mediaModel.js's setMediaVisibility/VisibilityForbiddenError.
export class EventVisibilityForbiddenError extends Error {}

export async function setEventVisibility(eventId, visibility, shareUserIds, requestingUserId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT e.tree_id, e.created_by, t.owner_id FROM events e JOIN trees t ON t.id = e.tree_id WHERE e.id = $1`,
      [eventId]
    );
    const event = rows[0];
    if (!event) throw new Error('Event not found');
    if (event.created_by !== requestingUserId && event.owner_id !== requestingUserId) {
      throw new EventVisibilityForbiddenError('Only the creator or tree owner can change visibility');
    }

    await client.query('UPDATE events SET visibility = $1, updated_at = NOW() WHERE id = $2', [visibility, eventId]);
    await client.query('DELETE FROM event_shares WHERE event_id = $1', [eventId]);
    if (visibility === 'private' && shareUserIds?.length) {
      const values = shareUserIds.map((_, i) => `($1, $2, $${i + 3})`).join(', ');
      await client.query(
        `INSERT INTO event_shares (event_id, tree_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [eventId, event.tree_id, ...shareUserIds]
      );
    }
  });
}

export async function listShareUserIdsForEvent(eventId) {
  const { rows } = await query('SELECT user_id FROM event_shares WHERE event_id = $1', [eventId]);
  return rows.map((row) => row.user_id);
}

export async function addParticipant(eventId, treeId, memberId, role) {
  return query(
    `INSERT INTO event_participants (event_id, tree_id, member_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(event_id, tree_id, member_id) DO UPDATE SET role = excluded.role`,
    [eventId, treeId, memberId, role ?? null]
  );
}

export async function removeParticipant(eventId, treeId, memberId) {
  return query('DELETE FROM event_participants WHERE event_id = $1 AND tree_id = $2 AND member_id = $3', [
    eventId,
    treeId,
    memberId,
  ]);
}

export async function listParticipants(eventId) {
  const { rows } = await query('SELECT * FROM event_participants WHERE event_id = $1', [eventId]);
  return rows;
}

export async function attachMedia(eventId, mediaId) {
  return query('INSERT INTO event_media (event_id, media_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    eventId,
    mediaId,
  ]);
}

export async function detachMedia(eventId, mediaId) {
  return query('DELETE FROM event_media WHERE event_id = $1 AND media_id = $2', [eventId, mediaId]);
}

// Media rows are visibility-filtered same as mediaModel.js's own list
// functions (reuses its access-tier SQL/shaping) - a tree-visible event can
// still have private media attached that shouldn't show up here to
// non-owners of that media.
export async function listMediaForEvent(eventId, requestingUserId) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT m.*, ${mediaAccessCaseSql(2)} AS access
       FROM event_media em
       JOIN media m ON m.id = em.media_id
       JOIN trees t ON t.id = m.tree_id
       WHERE em.event_id = $1
     ) m
     WHERE m.access != 'none'
     ORDER BY COALESCE(m.taken_at, m.created_at) ASC`,
    [eventId, requestingUserId]
  );
  return rows.map(shapeForAccess);
}

export async function deleteEvent(id) {
  return query('DELETE FROM events WHERE id = $1', [id]);
}
