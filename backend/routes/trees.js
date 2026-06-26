import express from 'express';
import multer from 'multer';

import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isNonEmptyString, isValidEmail } from '../utils/validation.js';
import { getDefaultTreeDataJson } from '../utils/defaultTreeData.js';
import { parseCsvImport } from '../utils/csvImport.js';
import { parseJsonImport } from '../utils/jsonImport.js';
import { findUserByEmail } from '../models/userModel.js';

const ASSIGNABLE_ROLES = ['editor', 'viewer'];

export const treesRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

treesRouter.use(requireAuth);

treesRouter.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const trees = db
      .prepare(
        `SELECT t.id, t.name, t.owner_id, t.created_at, tp.role,
                COALESCE(fd.updated_at, t.created_at) AS updated_at,
                COALESCE(json_array_length(fd.json_data), 0) AS member_count
         FROM trees t
         JOIN tree_permissions tp ON tp.tree_id = t.id
         LEFT JOIN family_data fd ON fd.tree_id = t.id
         WHERE tp.user_id = ?
         ORDER BY t.created_at DESC`
      )
      .all(req.user.id);

    return res.json({ trees });
  } catch (error) {
    return next(error);
  }
});

treesRouter.post('/', (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!isNonEmptyString(name, 120)) {
      return res.status(400).json({ error: 'Tree name is required' });
    }

    const db = getDb();
    const userId = req.user.id;

    const initialJson = getDefaultTreeDataJson();

    const tx = db.transaction(() => {
      const treeResult = db.prepare('INSERT INTO trees (name, owner_id) VALUES (?, ?)').run(name.trim(), userId);
      const treeId = treeResult.lastInsertRowid;

      db.prepare("INSERT INTO tree_permissions (tree_id, user_id, role, updated_at) VALUES (?, ?, 'owner', datetime('now'))")
        .run(treeId, userId);
      db.prepare("INSERT INTO family_data (tree_id, json_data, updated_at) VALUES (?, ?, datetime('now'))")
        .run(treeId, initialJson);
      return treeId;
    });

    const treeId = tx();
    return res.status(201).json({ id: treeId, name: name.trim() });
  } catch (error) {
    return next(error);
  }
});

treesRouter.get('/:id', requireTreeRole(['owner', 'editor', 'viewer']), (req, res, next) => {
  try {
    const db = getDb();
    const treeId = Number(req.params.id);
    const tree = db.prepare('SELECT id, name, owner_id, created_at FROM trees WHERE id = ?').get(treeId);
    const familyData = db.prepare('SELECT json_data FROM family_data WHERE tree_id = ?').get(treeId);

    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    return res.json({
      tree,
      role: req.treePermission.role,
      data: familyData ? JSON.parse(familyData.json_data) : [],
    });
  } catch (error) {
    return next(error);
  }
});

treesRouter.put('/:id', requireTreeRole(['owner', 'editor']), (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { json_data: jsonData } = req.body || {};

    if (typeof jsonData === 'undefined') {
      return res.status(400).json({ error: 'json_data is required' });
    }

    const normalizedJson = JSON.stringify(jsonData);
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO family_data (tree_id, json_data, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(tree_id) DO UPDATE SET json_data = excluded.json_data, updated_at = datetime('now')`
      )
      .run(treeId, normalizedJson);

    return res.json({ ok: true, changes: result.changes });
  } catch (error) {
    return next(error);
  }
});

treesRouter.patch('/:id', requireTreeRole(['owner']), (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!isNonEmptyString(name, 120)) {
      return res.status(400).json({ error: 'Tree name is required' });
    }

    const treeId = Number(req.params.id);
    const db = getDb();
    db.prepare('UPDATE trees SET name = ? WHERE id = ?').run(name.trim(), treeId);

    return res.json({ ok: true, name: name.trim() });
  } catch (error) {
    return next(error);
  }
});

treesRouter.delete('/:id', requireTreeRole(['owner']), (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const db = getDb();

    const tree = db.prepare('SELECT id FROM trees WHERE id = ?').get(treeId);
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    db.prepare('DELETE FROM trees WHERE id = ?').run(treeId);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

treesRouter.post(
  '/:id/import-csv',
  requireTreeRole(['owner', 'editor']),
  upload.single('file'),
  (req, res, next) => {
    try {
      if (!req.file?.buffer) return res.status(400).json({ error: 'CSV file is required' });
      const csvText = req.file.buffer.toString('utf8');
      const importedData = parseCsvImport(csvText);
      const treeId = Number(req.params.id);

      const db = getDb();
      db.prepare(
        `INSERT INTO family_data (tree_id, json_data, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(tree_id) DO UPDATE SET json_data = excluded.json_data, updated_at = datetime('now')`
      ).run(treeId, JSON.stringify(importedData));

      return res.json({ ok: true, imported_count: importedData.length });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ error: error.message });
      return next(error);
    }
  }
);

treesRouter.post(
  '/:id/import-json',
  requireTreeRole(['owner', 'editor']),
  upload.single('file'),
  (req, res, next) => {
    try {
      if (!req.file?.buffer) return res.status(400).json({ error: 'JSON file is required' });
      const jsonText = req.file.buffer.toString('utf8');
      const importedData = parseJsonImport(jsonText);
      const treeId = Number(req.params.id);

      const db = getDb();
      db.prepare(
        `INSERT INTO family_data (tree_id, json_data, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(tree_id) DO UPDATE SET json_data = excluded.json_data, updated_at = datetime('now')`
      ).run(treeId, JSON.stringify(importedData));

      return res.json({ ok: true, imported_count: importedData.length });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ error: error.message });
      return next(error);
    }
  }
);

treesRouter.get('/:id/permissions', requireTreeRole(['owner']), (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const db = getDb();
    const permissions = db
      .prepare(
        `SELECT tp.id, tp.tree_id, tp.user_id, tp.role, tp.created_at, tp.updated_at, u.email
         FROM tree_permissions tp
         JOIN users u ON u.id = tp.user_id
         WHERE tp.tree_id = ?
         ORDER BY tp.created_at ASC`
      )
      .all(treeId);
    return res.json({ permissions });
  } catch (error) {
    return next(error);
  }
});

treesRouter.post('/:id/share', requireTreeRole(['owner']), (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const { email, role } = req.body || {};

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be either editor or viewer' });
    }

    const targetUser = findUserByEmail(email.trim().toLowerCase());
    if (!targetUser) {
      return res.status(404).json({ error: 'No user found with that email. They need to sign in at least once first.' });
    }

    if (targetUser.id === req.user.id) {
      return res.status(400).json({ error: 'You already own this tree' });
    }

    const db = getDb();
    const existing = db
      .prepare('SELECT id FROM tree_permissions WHERE tree_id = ? AND user_id = ?')
      .get(treeId, targetUser.id);
    if (existing) {
      return res.status(409).json({ error: 'This user already has access to this tree' });
    }

    db.prepare(
      `INSERT INTO tree_permissions (tree_id, user_id, role, updated_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(treeId, targetUser.id, role);

    return res.status(201).json({ ok: true, email: targetUser.email, role });
  } catch (error) {
    return next(error);
  }
});

treesRouter.put('/:id/share/:userId', requireTreeRole(['owner']), (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const { role } = req.body || {};

    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be either editor or viewer' });
    }

    const db = getDb();
    const target = db
      .prepare('SELECT id, role FROM tree_permissions WHERE tree_id = ? AND user_id = ?')
      .get(treeId, targetUserId);
    if (!target) return res.status(404).json({ error: 'Permission not found' });
    if (target.role === 'owner') {
      return res.status(400).json({ error: "The owner's role cannot be changed" });
    }

    db.prepare("UPDATE tree_permissions SET role = ?, updated_at = datetime('now') WHERE id = ?").run(
      role,
      target.id
    );

    return res.json({ ok: true, role });
  } catch (error) {
    return next(error);
  }
});

treesRouter.delete('/:id/share/:userId', requireTreeRole(['owner']), (req, res, next) => {
  try {
    const treeId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);

    const db = getDb();
    const target = db
      .prepare('SELECT id, role FROM tree_permissions WHERE tree_id = ? AND user_id = ?')
      .get(treeId, targetUserId);
    if (!target) return res.status(404).json({ error: 'Permission not found' });
    if (target.role === 'owner') {
      return res.status(400).json({ error: 'Owners cannot remove their own access' });
    }

    db.prepare('DELETE FROM tree_permissions WHERE id = ?').run(target.id);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
