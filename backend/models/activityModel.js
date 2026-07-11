import { query } from '../db/index.js';
import { mediaAccessCaseSql } from './mediaModel.js';
import { eventAccessCaseSql } from './eventModel.js';

const BIRTHDAY_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function createActivity({
  treeId,
  activityType,
  actorId,
  memberId,
  relatedMediaId,
  relatedEventId,
  summary,
}) {
  await query(
    `INSERT INTO activity_log (tree_id, activity_type, actor_id, member_id, related_media_id, related_event_id, summary)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [treeId, activityType, actorId, memberId ?? null, relatedMediaId ?? null, relatedEventId ?? null, summary ?? null]
  );
}

function memberName(person) {
  if (!person) return null;
  const first = person['first name'] || '';
  const last = person['last name'] || '';
  const label = `${first} ${last}`.trim();
  return label || null;
}

// Tolerant parse matching frontend/main.js's parseBirthdayForSort - birthday
// is free text in family_data, not a strict date column, so unparseable or
// year-only values must be skipped rather than treated as errors.
function parseBirthday(birthday) {
  if (!birthday || typeof birthday !== 'string') return null;
  const trimmed = birthday.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

// Returns { memberId, memberName, monthDay, age, hasYear } for every member
// whose birthday falls in the requested window, working purely off month/day
// (birthdays recur annually - the stored year, if any, is only used to
// compute a displayable age, never to gate the window).
function computeBirthdayActivity(people, { windowDays = BIRTHDAY_WINDOW_DAYS, now = new Date() } = {}) {
  const results = [];
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (const person of Array.isArray(people) ? people : []) {
    const birthDate = parseBirthday(person?.data?.birthday);
    if (!birthDate) continue;

    const hasYear = birthDate.getUTCFullYear() > 1;
    let occursAt = new Date(Date.UTC(today.getUTCFullYear(), birthDate.getUTCMonth(), birthDate.getUTCDate()));
    const diffDays = Math.round((occursAt.getTime() - today.getTime()) / MS_PER_DAY);

    // Also check last year's occurrence so a birthday a few days into the
    // new year still shows up when "now" is late December (window wraps
    // across the year boundary).
    let bestDiffDays = diffDays;
    if (diffDays > windowDays) {
      const lastYear = new Date(Date.UTC(today.getUTCFullYear() - 1, birthDate.getUTCMonth(), birthDate.getUTCDate()));
      const lastYearDiff = Math.round((lastYear.getTime() - today.getTime()) / MS_PER_DAY);
      if (Math.abs(lastYearDiff) < Math.abs(bestDiffDays)) {
        bestDiffDays = lastYearDiff;
        occursAt = lastYear;
      }
    }
    if (diffDays < -windowDays) {
      const nextYear = new Date(Date.UTC(today.getUTCFullYear() + 1, birthDate.getUTCMonth(), birthDate.getUTCDate()));
      const nextYearDiff = Math.round((nextYear.getTime() - today.getTime()) / MS_PER_DAY);
      if (Math.abs(nextYearDiff) < Math.abs(bestDiffDays)) {
        bestDiffDays = nextYearDiff;
        occursAt = nextYear;
      }
    }

    if (Math.abs(bestDiffDays) > windowDays) continue;

    results.push({
      id: `birthday-${person.id}`,
      activity_type: 'birthday',
      member_id: person.id,
      member_name: memberName(person.data),
      age: hasYear ? occursAt.getUTCFullYear() - birthDate.getUTCFullYear() : null,
      effective_at: occursAt.toISOString(),
      is_today: bestDiffDays === 0,
    });
  }

  return results;
}

// Feed-read query for the Family Feed panel: logged activity_log rows
// (media_added/event_added/member_added), access-filtered the same way
// mediaModel.js/eventModel.js filter their own list queries, merged with
// computed birthday entries (see computeBirthdayActivity above) and sorted
// by an effective timestamp descending. Stub-tier rows (private-and-shared
// media/event the requester isn't part of) are dropped entirely rather than
// shown redacted - an activity item with no visible content isn't useful.
export async function listActivityForTree(treeId, { requestingUserId, limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT
         a.id,
         a.activity_type,
         a.actor_id,
         actor.email AS actor_email,
         a.member_id,
         a.related_media_id,
         a.related_event_id,
         a.summary,
         a.created_at,
         CASE
           WHEN a.related_media_id IS NOT NULL THEN (${mediaAccessCaseSql(2)})
           WHEN a.related_event_id IS NOT NULL THEN (${eventAccessCaseSql(2)})
           ELSE 'full'
         END AS access,
         e.title AS event_title
       FROM activity_log a
       JOIN users actor ON actor.id = a.actor_id
       LEFT JOIN media m ON m.id = a.related_media_id
       LEFT JOIN events e ON e.id = a.related_event_id
       LEFT JOIN trees t ON t.id = COALESCE(m.tree_id, e.tree_id)
       WHERE a.tree_id = $1
     ) a
     WHERE a.access != 'none' AND a.access != 'stub'
     ORDER BY a.created_at DESC
     LIMIT $3`,
    [treeId, requestingUserId, limit]
  );

  const { rows: familyDataRows } = await query('SELECT json_data FROM family_data WHERE tree_id = $1', [treeId]);
  const people = familyDataRows[0]?.json_data ?? [];
  const peopleById = new Map(people.map((person) => [person.id, person]));

  const loggedItems = rows.map((row) => ({
    id: `log-${row.id}`,
    activity_type: row.activity_type,
    actor_email: row.actor_email,
    member_id: row.member_id,
    member_name: memberName(peopleById.get(row.member_id)?.data),
    media_id: row.related_media_id,
    event_id: row.related_event_id,
    event_title: row.event_title,
    summary: row.summary,
    created_at: row.created_at,
    effective_at: row.created_at,
  }));

  const birthdayItems = computeBirthdayActivity(people);

  return [...loggedItems, ...birthdayItems]
    .sort((a, b) => new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime())
    .slice(0, limit);
}
