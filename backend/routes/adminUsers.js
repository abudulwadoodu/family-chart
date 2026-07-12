import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  ADMIN_ROLES,
  listUsersForAdmin,
  getUserProfileForAdmin,
  setUserStatus,
  setAdminRole,
  deleteUser,
  findUserById,
} from '../models/userModel.js';
import { recordAuditLog, logAuditEvent, AUDIT_ACTIONS } from '../services/auditLog.js';

export const adminUsersRouter = express.Router();

adminUsersRouter.use(requireAuth, requireAdmin);

adminUsersRouter.get('/', async (req, res, next) => {
  try {
    const { search, status, adminRole, activity, sort, order, page, pageSize } = req.query;
    const result = await listUsersForAdmin({ search, status, adminRole, activity, sort, order, page, pageSize });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

adminUsersRouter.get('/:id', async (req, res, next) => {
  try {
    const profile = await getUserProfileForAdmin(Number(req.params.id));
    if (!profile) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: profile });
  } catch (error) {
    return next(error);
  }
});

adminUsersRouter.patch('/:id/status', requireRole('super_admin', 'support_admin'), async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const target = await findUserById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const { status } = req.body || {};
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (target.admin_role && status === 'suspended') {
      return res.status(400).json({ error: 'Cannot suspend another administrator' });
    }

    const user = await setUserStatus(targetId, status);
    await recordAuditLog(req, {
      action: status === 'suspended' ? AUDIT_ACTIONS.USER_SUSPENDED : AUDIT_ACTIONS.USER_ACTIVATED,
      targetType: 'user',
      targetId,
      details: { email: user.email },
    });
    return res.json({ ok: true, user });
  } catch (error) {
    return next(error);
  }
});

adminUsersRouter.patch('/:id/role', requireRole('super_admin'), async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const target = await findUserById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const { adminRole } = req.body || {};
    if (adminRole !== null && !ADMIN_ROLES.includes(adminRole)) {
      return res.status(400).json({ error: 'Invalid admin role' });
    }

    const previousRole = target.admin_role;
    const user = await setAdminRole(targetId, adminRole);
    await recordAuditLog(req, {
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      targetType: 'user',
      targetId,
      details: { email: user.email, adminRole },
    });

    // Awaited (unlike logAuditEvent's usual fire-and-forget contract) because
    // this is a low-traffic admin action where a durable forensic trail
    // matters more than shaving the insert's latency off the response -
    // errors are still swallowed internally by the service, so a failed
    // write still can't fail this request.
    await logAuditEvent(
      req.user.id,
      AUDIT_ACTIONS.ROLE_UPDATE,
      'user',
      targetId,
      { adminRole: previousRole },
      { adminRole },
      req
    );

    return res.json({ ok: true, user });
  } catch (error) {
    return next(error);
  }
});

adminUsersRouter.delete('/:id', requireRole('super_admin'), async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const target = await findUserById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account here' });

    await deleteUser(targetId);
    await recordAuditLog(req, {
      action: AUDIT_ACTIONS.USER_DELETED,
      targetType: 'user',
      targetId,
      details: { email: target.email },
    });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

// Placeholder: no backend trigger for a Cognito admin-initiated password reset
// exists yet. This records intent without sending anything, so the frontend
// button has somewhere real to call once Cognito admin actions are wired up.
adminUsersRouter.post('/:id/reset-password', requireRole('super_admin', 'support_admin'), async (req, res, next) => {
  try {
    const target = await findUserById(Number(req.params.id));
    if (!target) return res.status(404).json({ error: 'User not found' });
    return res.json({ ok: true, placeholder: true, message: 'Password reset email queued (placeholder - not yet sent).' });
  } catch (error) {
    return next(error);
  }
});
