import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import {
  createSnapshotForTree,
  getSnapshotsForUser,
  getOwnSnapshotById,
  deleteSnapshot,
  VaultError,
} from '../models/vaultModel.js';
import { writeGedcom } from '../utils/gedcom/writer.js';

export const vaultRouter = express.Router();

vaultRouter.use(requireAuth);

function serializeSnapshot(row) {
  return {
    id: row.id,
    treeId: row.tree_id,
    archiveName: row.archive_name,
    createdAt: row.created_at,
  };
}

vaultRouter.get('/snapshots', async (req, res, next) => {
  try {
    const snapshots = (await getSnapshotsForUser(req.user.id)).map(serializeSnapshot);
    return res.json({ ok: true, snapshots });
  } catch (error) {
    return next(error);
  }
});

// Snapshotting is only ever allowed for trees this user owns - requireTreeRole
// enforces that structurally (tree_permissions.role === 'owner'), and
// createSnapshotForTree re-checks trees.owner_id itself as a second guard.
vaultRouter.post('/trees/:id/snapshots', requireTreeRole(['owner']), async (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const archiveName = typeof req.body?.archiveName === 'string' ? req.body.archiveName.trim() : '';

    const snapshot = await createSnapshotForTree(req.user.id, treeId, archiveName);
    return res.status(201).json({ ok: true, snapshot: serializeSnapshot(snapshot) });
  } catch (error) {
    if (error instanceof VaultError) {
      const status = error.code === 'TREE_NOT_FOUND' ? 404 : 403;
      return res.status(status).json({ error: 'You can only archive trees you own' });
    }
    return next(error);
  }
});

vaultRouter.get('/snapshots/:id', async (req, res, next) => {
  try {
    const snapshot = await getOwnSnapshotById(Number(req.params.id), req.user.id);
    if (!snapshot) return res.status(404).json({ error: 'Archive not found' });
    return res.json({
      ok: true,
      snapshot: { ...serializeSnapshot(snapshot), familyData: snapshot.family_data },
    });
  } catch (error) {
    return next(error);
  }
});

// Reuses the same hand-rolled GEDCOM writer as the per-tree export route
// (utils/gedcom/writer.js) so a frozen vault snapshot produces byte-identical
// GEDCOM syntax to a live tree export, just from the archived JSONB instead
// of the current family_data row.
vaultRouter.get('/snapshots/:id/export/gedcom', async (req, res, next) => {
  try {
    const snapshot = await getOwnSnapshotById(Number(req.params.id), req.user.id);
    if (!snapshot) return res.status(404).json({ error: 'Archive not found' });

    const options = {
      includeNotes: req.query.includeNotes !== 'false',
      includePrivate: req.query.includePrivate !== 'false',
      includeDeceased: req.query.includeDeceased !== 'false',
      includeLiving: req.query.includeLiving !== 'false',
    };

    const gedcom = writeGedcom(snapshot.family_data || [], options);
    const filename = `${snapshot.archive_name || 'family-archive'}.ged`.replace(/["\r\n]/g, '');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    return res.send(gedcom);
  } catch (error) {
    return next(error);
  }
});

vaultRouter.delete('/snapshots/:id', async (req, res, next) => {
  try {
    const deleted = await deleteSnapshot(Number(req.params.id), req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Archive not found' });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
