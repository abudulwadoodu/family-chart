import { getDb } from '../db/index.js';

export function createEvent({ treeId, title, eventType, description, eventDate, datePrecision = 'day', location, createdBy }) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO events (
         tree_id, title, event_type, description, event_date, date_precision, location, created_by, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(treeId, title, eventType ?? null, description ?? null, eventDate ?? null, datePrecision, location ?? null, createdBy);
  return getEventById(result.lastInsertRowid);
}

export function getEventById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
}

// Ordered by event_date (nulls last) - this is the query the timeline view
// is built on, optionally narrowed to a single member via event_participants.
export function listEventsForTree(treeId, { memberId } = {}) {
  const db = getDb();
  if (memberId) {
    return db
      .prepare(
        `SELECT DISTINCT e.*
         FROM events e
         JOIN event_participants ep ON ep.event_id = e.id
         WHERE e.tree_id = ? AND ep.tree_id = ? AND ep.member_id = ?
         ORDER BY (e.event_date IS NULL), e.event_date ASC`
      )
      .all(treeId, treeId, memberId);
  }
  return db
    .prepare('SELECT * FROM events WHERE tree_id = ? ORDER BY (event_date IS NULL), event_date ASC')
    .all(treeId);
}

export function updateEvent(id, { title, eventType, description, eventDate, datePrecision, location }) {
  const db = getDb();
  db.prepare(
    `UPDATE events SET title = ?, event_type = ?, description = ?, event_date = ?, date_precision = ?, location = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(title, eventType ?? null, description ?? null, eventDate ?? null, datePrecision ?? 'day', location ?? null, id);
  return getEventById(id);
}

export function addParticipant(eventId, treeId, memberId, role) {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO event_participants (event_id, tree_id, member_id, role)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(event_id, tree_id, member_id) DO UPDATE SET role = excluded.role`
    )
    .run(eventId, treeId, memberId, role ?? null);
}

export function removeParticipant(eventId, treeId, memberId) {
  const db = getDb();
  return db
    .prepare('DELETE FROM event_participants WHERE event_id = ? AND tree_id = ? AND member_id = ?')
    .run(eventId, treeId, memberId);
}

export function listParticipants(eventId) {
  const db = getDb();
  return db.prepare('SELECT * FROM event_participants WHERE event_id = ?').all(eventId);
}

export function attachMedia(eventId, mediaId) {
  const db = getDb();
  return db
    .prepare('INSERT OR IGNORE INTO event_media (event_id, media_id) VALUES (?, ?)')
    .run(eventId, mediaId);
}

export function detachMedia(eventId, mediaId) {
  const db = getDb();
  return db.prepare('DELETE FROM event_media WHERE event_id = ? AND media_id = ?').run(eventId, mediaId);
}

export function listMediaForEvent(eventId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT m.* FROM event_media em JOIN media m ON m.id = em.media_id
       WHERE em.event_id = ? ORDER BY COALESCE(m.taken_at, m.created_at) ASC`
    )
    .all(eventId);
}

export function deleteEvent(id) {
  const db = getDb();
  return db.prepare('DELETE FROM events WHERE id = ?').run(id);
}
