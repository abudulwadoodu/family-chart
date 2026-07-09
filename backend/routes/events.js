import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isNonEmptyString } from '../utils/validation.js';
import {
  createEvent,
  listEventsForTree,
  getEventById,
  updateEvent,
  addParticipant,
  removeParticipant,
  listParticipants,
  attachMedia,
  detachMedia,
  listMediaForEvent,
  deleteEvent,
} from '../models/eventModel.js';
import { withMediaUrls } from '../utils/mediaUrl.js';

export const eventsRouter = express.Router({ mergeParams: true });

eventsRouter.use(requireAuth);

// Also the data source for the timeline view: ordered by event_date, and
// narrowable to a single person's timeline via ?memberId=.
eventsRouter.get('/', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const { memberId } = req.query;
    return res.json({ events: await listEventsForTree(Number(req.params.treeId), { memberId }) });
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
    const event = await createEvent({
      treeId: Number(req.params.treeId),
      title: title.trim(),
      eventType,
      description,
      eventDate,
      datePrecision,
      location,
      createdBy: req.user.id,
    });
    return res.status(201).json({ event });
  } catch (error) {
    return next(error);
  }
});

eventsRouter.get('/:eventId', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const event = await getEventById(Number(req.params.eventId));
    if (!event || event.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Event not found' });
    }
    return res.json({
      event,
      participants: await listParticipants(event.id),
      media: withMediaUrls(await listMediaForEvent(event.id)),
    });
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
    return res.json({ event: updated });
  } catch (error) {
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
