// Recently-selected members and recently-used relationship types, for the
// Relationship Manager's one-click reuse affordance. Session-only, mutates
// the `recent` slice it's given rather than owning state itself.

const RECENT_LIMIT = 8;

function pushFrontDeduped(list, value, limit) {
  const next = [value, ...list.filter((v) => v !== value)];
  next.length = Math.min(next.length, limit);
  return next;
}

export function recordRecentMember(recent, memberId) {
  recent.memberIds = pushFrontDeduped(recent.memberIds, memberId, RECENT_LIMIT);
}

export function recordRecentType(recent, type) {
  recent.types = pushFrontDeduped(recent.types, type, RECENT_LIMIT);
}

export function getRecentMembers(recent, data, limit = 5) {
  const byId = new Map(data.map((d) => [d.id, d]));
  return recent.memberIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, limit);
}

export function getRecentTypes(recent, limit = 4) {
  return recent.types.slice(0, limit);
}
