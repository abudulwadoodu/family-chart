import { query } from '../db/index.js';

export async function createEvent({ treeId, title, eventType, description, eventDate, datePrecision = 'day', location, createdBy }) {
  const { rows } = await query(
    `INSERT INTO events (
       tree_id, title, event_type, description, event_date, date_precision, location, created_by, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id`,
    [treeId, title, eventType ?? null, description ?? null, eventDate ?? null, datePrecision, location ?? null, createdBy]
  );
  return getEventById(rows[0].id);
}

export async function getEventById(id) {
  const { rows } = await query('SELECT * FROM events WHERE id = $1', [id]);
  return rows[0];
}

// Ordered by event_date (nulls last) - this is the query the timeline view
// is built on, optionally narrowed to a single member via event_participants.
export async function listEventsForTree(treeId, { memberId } = {}) {
  if (memberId) {
    const { rows } = await query(
      `SELECT * FROM (
         SELECT DISTINCT ON (e.id) e.*
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE e.tree_id = $1 AND ep.tree_id = $2 AND ep.member_id = $3
       ) e
       ORDER BY (e.event_date IS NULL), e.event_date ASC`,
      [treeId, treeId, memberId]
    );
    return rows;
  }
  const { rows } = await query('SELECT * FROM events WHERE tree_id = $1 ORDER BY (event_date IS NULL), event_date ASC', [
    treeId,
  ]);
  return rows;
}

export async function updateEvent(id, { title, eventType, description, eventDate, datePrecision, location }) {
  await query(
    `UPDATE events SET title = $1, event_type = $2, description = $3, event_date = $4, date_precision = $5, location = $6, updated_at = NOW()
     WHERE id = $7`,
    [title, eventType ?? null, description ?? null, eventDate ?? null, datePrecision ?? 'day', location ?? null, id]
  );
  return getEventById(id);
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

export async function listMediaForEvent(eventId) {
  const { rows } = await query(
    `SELECT m.* FROM event_media em JOIN media m ON m.id = em.media_id
     WHERE em.event_id = $1 ORDER BY COALESCE(m.taken_at, m.created_at) ASC`,
    [eventId]
  );
  return rows;
}

export async function deleteEvent(id) {
  return query('DELETE FROM events WHERE id = $1', [id]);
}
