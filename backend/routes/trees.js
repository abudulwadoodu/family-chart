import express from 'express';
import multer from 'multer';

import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isNonEmptyString } from '../utils/validation.js';
import { getDefaultTreeDataJson } from '../utils/defaultTreeData.js';
import { parseCsvImport } from '../utils/csvImport.js';

export const treesRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

treesRouter.use(requireAuth);

treesRouter.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const trees = db
      .prepare(
        `SELECT t.id, t.name, t.owner_id, t.created_at, tm.role, tm.status
         FROM trees t
         JOIN tree_memberships tm ON tm.tree_id = t.id
         WHERE tm.user_id = ? AND tm.status = 'approved'
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

      db.prepare('INSERT INTO tree_memberships (user_id, tree_id, role, status) VALUES (?, ?, ?, ?)')
        .run(userId, treeId, 'owner', 'approved');
      db.prepare('INSERT INTO family_data (tree_id, json_data) VALUES (?, ?)').run(treeId, initialJson);
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
      role: req.treeMembership.role,
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
        `INSERT INTO family_data (tree_id, json_data)
         VALUES (?, ?)
         ON CONFLICT(tree_id) DO UPDATE SET json_data = excluded.json_data`
      )
      .run(treeId, normalizedJson);

    return res.json({ ok: true, changes: result.changes });
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
        `INSERT INTO family_data (tree_id, json_data)
         VALUES (?, ?)
         ON CONFLICT(tree_id) DO UPDATE SET json_data = excluded.json_data`
      ).run(treeId, JSON.stringify(importedData));

      return res.json({ ok: true, imported_count: importedData.length });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ error: error.message });
      return next(error);
    }
  }
);
