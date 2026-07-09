import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { listAuditLogs } from '../models/auditLogModel.js';
import { AUDIT_ACTIONS } from '../services/auditLog.js';

export const adminAuditLogsRouter = express.Router();

adminAuditLogsRouter.use(requireAuth, requireAdmin);

adminAuditLogsRouter.get('/', async (req, res, next) => {
  try {
    const { search, action, adminId, page, pageSize } = req.query;
    const result = await listAuditLogs({ search, action, adminId, page, pageSize });
    return res.json({ ...result, actions: Object.values(AUDIT_ACTIONS) });
  } catch (error) {
    return next(error);
  }
});
