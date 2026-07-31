import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { requireRole } from '../middleware/requireRole.js';
import { getAllSettings, updateSettings } from '../models/settingsModel.js';
import { recordAuditLog, AUDIT_ACTIONS } from '../services/auditLog.js';

export const adminMaintenanceRouter = express.Router();

adminMaintenanceRouter.use(requireAuth, requireAdmin);

adminMaintenanceRouter.get('/', async (_req, res, next) => {
  try {
    const { maintenanceMode } = await getAllSettings();
    return res.json({ maintenanceMode });
  } catch (error) {
    return next(error);
  }
});

adminMaintenanceRouter.patch('/', requireRole('super_admin'), async (req, res, next) => {
  try {
    if (typeof req.body?.maintenanceMode !== 'boolean') {
      return res.status(400).json({ error: 'maintenanceMode must be a boolean' });
    }

    const { maintenanceMode } = await updateSettings({ maintenanceMode: req.body.maintenanceMode }, req.user.id);
    await recordAuditLog(req, {
      action: AUDIT_ACTIONS.SETTINGS_CHANGED,
      targetType: 'settings',
      targetId: null,
      details: { maintenanceMode },
    });
    return res.json({ ok: true, maintenanceMode });
  } catch (error) {
    return next(error);
  }
});
