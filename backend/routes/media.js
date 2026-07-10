import express from 'express';
import multer from 'multer';

import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isNonEmptyString } from '../utils/validation.js';
import {
  createMedia,
  listMediaForTree,
  listMediaForMember,
  getMediaById,
  resolveMediaAccess,
  getMediaUsage,
  updateMedia,
  deleteMedia,
  setMediaVisibility,
  listShareUserIdsForMedia,
  VisibilityForbiddenError,
} from '../models/mediaModel.js';
import { tagMember, listTagsForMedia, removeTag } from '../models/mediaTagModel.js';
import { storePutObject, storeGetObjectStream, storeDeleteObject } from '../services/storage/index.js';
import { fileUrlFor, withMediaUrls } from '../utils/mediaUrl.js';
import { parseVisibilityInput, validateShareUserIds, VisibilityInputError } from '../utils/visibility.js';

const MEDIA_KINDS = ['photo', 'video', 'document'];

export const mediaRouter = express.Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

mediaRouter.use(requireAuth);

mediaRouter.get('/', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.treeId);
    const { kind, memberId } = req.query;
    const requestingUserId = req.user.id;
    const items = memberId
      ? await listMediaForMember(treeId, memberId, requestingUserId)
      : await listMediaForTree(treeId, { kind, requestingUserId });
    return res.json({ media: withMediaUrls(items) });
  } catch (error) {
    return next(error);
  }
});

mediaRouter.post('/', requireTreeRole(['owner', 'editor']), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'A file is required' });

    const { kind, title, description, takenAt } = req.body || {};
    if (!MEDIA_KINDS.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of ${MEDIA_KINDS.join(', ')}` });
    }

    const treeId = Number(req.params.treeId);
    const { visibility, shareUserIds } = parseVisibilityInput(req.body);
    await validateShareUserIds(treeId, shareUserIds);

    const storageKey = `${treeId}/${Date.now()}-${req.file.originalname}`;
    await storePutObject(storageKey, req.file.buffer, req.file.mimetype);

    const media = await createMedia({
      treeId,
      kind,
      storageKey,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      title: isNonEmptyString(title, 200) ? title : null,
      description: isNonEmptyString(description, 2000) ? description : null,
      takenAt: takenAt || null,
      uploadedBy: req.user.id,
      visibility,
    });
    if (visibility === 'private' && shareUserIds.length) {
      await setMediaVisibility(media.id, 'private', shareUserIds, req.user.id);
    }

    const final = shareUserIds.length ? await getMediaById(media.id) : media;
    return res.status(201).json({ media: { ...final, url: fileUrlFor(final) } });
  } catch (error) {
    if (error instanceof VisibilityInputError) return res.status(400).json({ error: error.message });
    return next(error);
  }
});

mediaRouter.get('/:mediaId/file', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const media = await getMediaById(Number(req.params.mediaId));
    if (!media || media.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Media not found' });
    }
    // A stub-tier requester (owner viewing a "shared with specific people"
    // item they're not part of) gets metadata elsewhere (list/usage), but
    // never the actual file bytes - treat 'stub' the same as 'none' here.
    const access = await resolveMediaAccess(media, req.user.id);
    if (access !== 'full') {
      return res.status(404).json({ error: 'Media not found' });
    }
    const stream = await storeGetObjectStream(media.storage_key);
    res.setHeader('Content-Type', media.mime_type);
    if (media.title) {
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(media.title)}"`);
    }
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    return next(error);
  }
});

mediaRouter.patch('/:mediaId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const media = await getMediaById(Number(req.params.mediaId));
    if (!media || media.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const { title, description, takenAt } = req.body || {};
    const updated = await updateMedia(media.id, {
      title: isNonEmptyString(title, 200) ? title : null,
      description: isNonEmptyString(description, 2000) ? description : null,
      takenAt: takenAt || null,
    });

    // visibility is only touched when the caller explicitly includes it -
    // a plain title/description edit must not reset an existing share list.
    let final = updated;
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'visibility')) {
      const { visibility, shareUserIds } = parseVisibilityInput(req.body);
      await validateShareUserIds(media.tree_id, shareUserIds);
      await setMediaVisibility(media.id, visibility, shareUserIds, req.user.id);
      final = await getMediaById(media.id);
    }

    return res.json({ media: { ...final, url: fileUrlFor(final) } });
  } catch (error) {
    if (error instanceof VisibilityInputError) return res.status(400).json({ error: error.message });
    if (error instanceof VisibilityForbiddenError) return res.status(403).json({ error: error.message });
    return next(error);
  }
});

mediaRouter.get('/:mediaId/usage', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const media = await getMediaById(Number(req.params.mediaId));
    if (!media || media.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Media not found' });
    }
    const access = await resolveMediaAccess(media, req.user.id);
    if (access === 'none') {
      return res.status(404).json({ error: 'Media not found' });
    }
    const usage = await getMediaUsage(media.id);
    // shareUserIds is only meaningful (and only shown) to whoever has full
    // access - a 'stub' viewer (the owner, moderating) doesn't get to see
    // exactly who this was shared with, only that it's shared with someone.
    if (access === 'full' && media.visibility === 'private') {
      usage.shareUserIds = await listShareUserIdsForMedia(media.id);
    }
    return res.json(usage);
  } catch (error) {
    return next(error);
  }
});

mediaRouter.delete('/:mediaId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const media = await getMediaById(Number(req.params.mediaId));
    if (!media || media.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Media not found' });
    }
    // Deleting a stub is allowed (that's the point of the owner's
    // moderation stub - identify and remove without being able to view it),
    // but a fully-hidden ("only me") item must stay 404 to anyone but its
    // uploader, same as every other route here.
    const access = await resolveMediaAccess(media, req.user.id);
    if (access === 'none') {
      return res.status(404).json({ error: 'Media not found' });
    }
    await storeDeleteObject(media.storage_key);
    await deleteMedia(media.id);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

mediaRouter.get('/:mediaId/tags', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    return res.json({ tags: await listTagsForMedia(Number(req.params.mediaId)) });
  } catch (error) {
    return next(error);
  }
});

mediaRouter.post('/:mediaId/tags', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const { memberId, box } = req.body || {};
    if (!isNonEmptyString(memberId, 100)) {
      return res.status(400).json({ error: 'memberId is required' });
    }
    const tag = await tagMember({
      mediaId: Number(req.params.mediaId),
      treeId: Number(req.params.treeId),
      memberId,
      source: 'manual',
      box,
    });
    return res.status(201).json({ tag });
  } catch (error) {
    return next(error);
  }
});

mediaRouter.delete('/:mediaId/tags/:tagId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    await removeTag(Number(req.params.tagId));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
