import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isNonEmptyString } from '../utils/validation.js';
import {
  createEvent,
  listEventsForTree,
  getEventById,
  resolveEventAccess,
  updateEvent,
  setEventVisibility,
  listShareUserIdsForEvent,
  EventVisibilityForbiddenError,
  addParticipant,
  removeParticipant,
  listParticipants,
  attachMedia,
  detachMedia,
  listMediaForEvent,
  deleteEvent,
} from '../models/eventModel.js';
import { withMediaUrls } from '../utils/mediaUrl.js';
import { parseVisibilityInput, validateShareUserIds, VisibilityInputError } from '../utils/visibility.js';

export const eventsRouter = express.Router({ mergeParams: true });

eventsRouter.use(requireAuth);

// Also the data source for the timeline view: ordered by event_date, and
// narrowable to a single person's timeline via ?memberId=.
eventsRouter.get('/', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const { memberId } = req.query;
    const events = await listEventsForTree(Number(req.params.treeId), { memberId, requestingUserId: req.user.id });
    return res.json({ events });
  } catch (error) {
    return next(error);
  }
});

eventsRouter.post('/', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const { title, eventType, description, eventDate, datePrecision, location } = req.body || {};
    if (!isNonEmptyString(title, 200)) {
      return res.status(400).json({ error: 'Event title is required' });
    }
    const treeId = Number(req.params.treeId);
    const { visibility, shareUserIds } = parseVisibilityInput(req.body);
    await validateShareUserIds(treeId, shareUserIds);

    const event = await createEvent({
      treeId,
      title: title.trim(),
      eventType,
      description,
      eventDate,
      datePrecision,
      location,
      createdBy: req.user.id,
      visibility,
    });
    if (visibility === 'private' && shareUserIds.length) {
      await setEventVisibility(event.id, 'private', shareUserIds, req.user.id);
    }

    const final = shareUserIds.length ? await getEventById(event.id) : event;
    return res.status(201).json({ event: final });
  } catch (error) {
    if (error instanceof VisibilityInputError) return res.status(400).json({ error: error.message });
    return next(error);
  }
});

eventsRouter.get('/:eventId', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const event = await getEventById(Number(req.params.eventId));
    if (!event || event.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const access = await resolveEventAccess(event, req.user.id);
    if (access === 'none') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (access === 'stub') {
      // Moderation stub for the owner: enough to identify/delete, no
      // participants/media detail - those would leak who's involved/attached
      // beyond what the stub's metadata-only contract allows.
      return res.json({ event, participants: [], media: [] });
    }

    const response = {
      event,
      participants: await listParticipants(event.id),
      media: withMediaUrls(await listMediaForEvent(event.id, req.user.id)),
    };
    if (event.visibility === 'private') {
      response.shareUserIds = await listShareUserIdsForEvent(event.id);
    }
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

eventsRouter.patch('/:eventId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const event = await getEventById(Number(req.params.eventId));
    if (!event || event.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { title, eventType, description, eventDate, datePrecision, location } = req.body || {};
    if (!isNonEmptyString(title, 200)) {
      return res.status(400).json({ error: 'Event title is required' });
    }

    const updated = await updateEvent(event.id, {
      title: title.trim(),
      eventType,
      description,
      eventDate: eventDate || null,
      datePrecision,
      location,
    });

    // visibility is only touched when the caller explicitly includes it -
    // a plain title/description edit must not reset an existing share list.
    let final = updated;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'visibility')) {
      const { visibility, shareUserIds } = parseVisibilityInput(req.body);
      await validateShareUserIds(event.tree_id, shareUserIds);
      await setEventVisibility(event.id, visibility, shareUserIds, req.user.id);
      final = await getEventById(event.id);
    }

    return res.json({ event: final });
  } catch (error) {
    if (error instanceof VisibilityInputError) return res.status(400).json({ error: error.message });
    if (error instanceof EventVisibilityForbiddenError) return res.status(403).json({ error: error.message });
    return next(error);
  }
});

eventsRouter.post('/:eventId/participants', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const { memberId, role } = req.body || {};
    if (!isNonEmptyString(memberId, 100)) {
      return res.status(400).json({ error: 'memberId is required' });
    }
    await addParticipant(Number(req.params.eventId), Number(req.params.treeId), memberId, role);
    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

eventsRouter.delete('/:eventId/participants/:memberId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    await removeParticipant(Number(req.params.eventId), Number(req.params.treeId), req.params.memberId);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

eventsRouter.post('/:eventId/media', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const { mediaId } = req.body || {};
    await attachMedia(Number(req.params.eventId), Number(mediaId));
    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

eventsRouter.delete('/:eventId/media/:mediaId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    await detachMedia(Number(req.params.eventId), Number(req.params.mediaId));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

eventsRouter.delete('/:eventId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    await deleteEvent(Number(req.params.eventId));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
