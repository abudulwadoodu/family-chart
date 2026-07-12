import { createAuditLog } from '../models/auditLogModel.js';

// Constants so call sites and the frontend audit-log filter stay in sync -
// add an entry here when a new admin mutation needs tracking.
export const AUDIT_ACTIONS = {
  USER_SUSPENDED: 'user.suspended',
  USER_ACTIVATED: 'user.activated',
  USER_DELETED: 'user.deleted',
  USER_ROLE_CHANGED: 'user.role_changed',
  TREE_SUSPENDED: 'tree.suspended',
  TREE_ACTIVATED: 'tree.activated',
  ACCESS_OVERRIDE_GRANTED: 'access_override.granted',
  ACCESS_OVERRIDE_REVOKED: 'access_override.revoked',
  TICKET_UPDATED: 'ticket.updated',
  SETTINGS_CHANGED: 'settings.changed',
};

export async function recordAuditLog(req, { action, targetType, targetId, details }) {
  try {
    await createAuditLog({ adminId: req.user.id, action, targetType, targetId, details });
  } catch (error) {
    // Auditing must never block the action it's recording.
    console.error('[audit-log] failed to record entry', error);
  }
}
