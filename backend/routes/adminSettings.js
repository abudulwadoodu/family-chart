import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { requireRole } from '../middleware/requireRole.js';
import { SETTINGS_SCHEMA, getAllSettings, updateSettings } from '../models/settingsModel.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../services/auditLog.js';

export const adminSettingsRouter = express.Router();

adminSettingsRouter.use(requireAuth, requireAdmin);

adminSettingsRouter.get('/', async (_req, res, next) => {
  try {
    return res.json({ schema: SETTINGS_SCHEMA, values: await getAllSettings() });
  } catch (error) {
    return next(error);
  }
});

adminSettingsRouter.put('/', requireRole('super_admin'), async (req, res, next) => {
  try {
    const updates = req.body || {};
    const invalidKey = Object.keys(updates).find((key) => !(key in SETTINGS_SCHEMA));
    if (invalidKey) return res.status(400).json({ error: `Unknown setting: ${invalidKey}` });

    const values = await updateSettings(updates, req.user.id);
    await recordAuditLog(req, { action: AUDIT_ACTIONS.SETTINGS_CHANGED, targetType: 'settings', targetId: null, details: updates });
    return res.json({ ok: true, values });
  } catch (error) {
    return next(error);
  }
});
