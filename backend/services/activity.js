import { createActivity } from '../models/activityModel.js';

export const ACTIVITY_TYPES = {
  MEDIA_ADDED: 'media_added',
  EVENT_ADDED: 'event_added',
  MEMBER_ADDED: 'member_added',
};

// req.params.treeId covers media.js/events.js (mounted with mergeParams
// under /api/trees/:treeId/...); req.params.id covers trees.js's own
// PUT /:id save route, which is mounted at /api/trees/:id instead.
export async function recordActivity(req, { activityType, memberId, relatedMediaId, relatedEventId, summary }) {
  try {
    await createActivity({
      treeId: Number(req.params.treeId || req.params.id),
      activityType,
      actorId: req.user.id,
      memberId: memberId ?? null,
      relatedMediaId: relatedMediaId ?? null,
      relatedEventId: relatedEventId ?? null,
      summary: summary ?? null,
    });
  } catch (error) {
    // Activity logging must never block the action it's recording.
    console.error('[activity] failed to record entry', error);
  }
}
