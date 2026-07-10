import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isNonEmptyString } from '../utils/validation.js';
import {
  createAlbum,
  listAlbumsForTree,
  getAlbumById,
  updateAlbum,
  setAlbumCover,
  addMediaToAlbum,
  removeMediaFromAlbum,
  listMediaForAlbum,
  deleteAlbum,
} from '../models/albumModel.js';
import { withMediaUrls } from '../utils/mediaUrl.js';

export const albumsRouter = express.Router({ mergeParams: true });

albumsRouter.use(requireAuth);

albumsRouter.get('/', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    return res.json({ albums: await listAlbumsForTree(Number(req.params.treeId)) });
  } catch (error) {
    return next(error);
  }
});

albumsRouter.post('/', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    if (!isNonEmptyString(name, 120)) {
      return res.status(400).json({ error: 'Album name is required' });
    }
    const album = await createAlbum({ treeId: Number(req.params.treeId), name: name.trim(), description, createdBy: req.user.id });
    return res.status(201).json({ album });
  } catch (error) {
    return next(error);
  }
});

albumsRouter.get('/:albumId', requireTreeRole(['owner', 'editor', 'viewer']), async (req, res, next) => {
  try {
    const album = await getAlbumById(Number(req.params.albumId));
    if (!album || album.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Album not found' });
    }
    const media = await listMediaForAlbum(album.id, req.user.id);
    return res.json({ album, media: withMediaUrls(media) });
  } catch (error) {
    return next(error);
  }
});

albumsRouter.patch('/:albumId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const album = await getAlbumById(Number(req.params.albumId));
    if (!album || album.tree_id !== Number(req.params.treeId)) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const { name, description } = req.body || {};
    if (!isNonEmptyString(name, 120)) {
      return res.status(400).json({ error: 'Album name is required' });
    }

    const updated = await updateAlbum(album.id, { name: name.trim(), description });
    return res.json({ album: updated });
  } catch (error) {
    return next(error);
  }
});

albumsRouter.post('/:albumId/media', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const { mediaId, sortOrder } = req.body || {};
    await addMediaToAlbum(Number(req.params.albumId), Number(mediaId), sortOrder ?? 0);
    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

albumsRouter.delete('/:albumId/media/:mediaId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    await removeMediaFromAlbum(Number(req.params.albumId), Number(req.params.mediaId));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

albumsRouter.patch('/:albumId/cover', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    const { mediaId } = req.body || {};
    await setAlbumCover(Number(req.params.albumId), Number(mediaId));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

albumsRouter.delete('/:albumId', requireTreeRole(['owner', 'editor']), async (req, res, next) => {
  try {
    await deleteAlbum(Number(req.params.albumId));
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
