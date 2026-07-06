import express from 'express';
import multer from 'multer';

import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isNonEmptyString } from '../utils/validation.js';
import { createMedia, listMediaForTree, listMediaForMember, getMediaById, getMediaUsage, updateMedia, deleteMedia } from '../models/mediaModel.js';
import { tagMember, listTagsForMedia, removeTag } from '../models/mediaTagModel.js';
import { storePutObject, storeGetObjectStream, storeDeleteObject } from '../services/storage/index.js';
import { fileUrlFor, withMediaUrls } from '../utils/mediaUrl.js';

const MEDIA_KINDS = ['photo', 'video', 'document'];

export const mediaRouter = express.Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

mediaRouter.use(requireAuth);

mediaRouter.get('/', requireTreeRole(['owner', 'editor', 'viewer']), (req, res, next) => {
  try {
    const treeId = Number(req.params.treeId);
    const { kind, memberId } = req.query;
    const items = memberId ? listMediaForMember(treeId, memberId) : listMediaForTree(treeId, { kind });
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
    const storageKey = `${treeId}/${Date.now()}-${req.file.originalname}`;
    await storePutObject(storageKey, req.file.buffer, req.file.mimetype);

    const media = createMedia({
      treeId,
      kind,
      storageKey,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      title: isNonEmptyString(title, 200) ? title : null,
      description: isNonEmptyString(description, 2000) ? description : null,
      takenAt: takenAt || null,
      uploadedBy: req.user.id,
    });

    return res.status(201).json({ media: { ...media, url: fileUrlFor(media) } });
  } catch (error) {
    return next(error);
  }
});

mediaRouter.get('/:mediaId/file', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const media = getMediaById(Number(req.params.mediaId));
    if (!media || media.tree_id !== Number(req.params.treeId)) {
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

mediaRouter.patch('/:mediaId', requireTreeRole(['owner', 'editor']), (req, res, next) => {
  try {
    const media = getMediaById(Number(req.params.mediaId));
    if (!media || media.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const { title, description, takenAt } = req.body || {};
    const updated = updateMedia(media.id, {
      title: isNonEmptyString(title, 200) ? title : null,
      description: isNonEmptyString(description, 2000) ? description : null,
      takenAt: takenAt || null,
    });

    return res.json({ media: { ...updated, url: fileUrlFor(updated) } });
  } catch (error) {
    return next(error);
  }
});

mediaRouter.get('/:mediaId/usage', requireTreeRole(['owner', 'editor', 'viewer']), (req, res, next) => {
  try {
    const media = getMediaById(Number(req.params.mediaId));
    if (!media || media.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Media not found' });
    }
    return res.json(getMediaUsage(media.id));
  } catch (error) {
    return next(error);
  }
});

mediaRouter.delete('/:mediaId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const media = getMediaById(Number(req.params.mediaId));
    if (!media || media.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Media not found' });
    }
    await storeDeleteObject(media.storage_key);
    deleteMedia(media.id);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

mediaRouter.get('/:mediaId/tags', requireTreeRole(['owner', 'editor', 'viewer']), (req, res, next) => {
  try {
    return res.json({ tags: listTagsForMedia(Number(req.params.mediaId)) });
  } catch (error) {
    return next(error);
  }
});

mediaRouter.post('/:mediaId/tags', requireTreeRole(['owner', 'editor']), (req, res, next) => {
  try {
    const { memberId, box } = req.body || {};
    if (!isNonEmptyString(memberId, 100)) {
      return res.status(400).json({ error: 'memberId is required' });
    }
    const tag = tagMember({
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

mediaRouter.delete('/:mediaId/tags/:tagId', requireTreeRole(['owner', 'editor']), (req, res, next) => {
  try {
    removeTag(Number(req.params.tagId));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
