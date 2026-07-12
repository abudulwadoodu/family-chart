import { createAuditLog, createAuditLogEvent } from '../models/auditLogModel.js';

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
  ROLE_UPDATE: 'ROLE_UPDATE',
  OVERRIDE_GRANTED: 'OVERRIDE_GRANTED',
  OVERRIDE_REVOKED: 'OVERRIDE_REVOKED',
  TREE_DISABLED: 'TREE_DISABLED',
};

export async function recordAuditLog(req, { action, targetType, targetId, details }) {
  try {
    await createAuditLog({ adminId: req.user.id, action, targetType, targetId, details });
  } catch (error) {
    // Auditing must never block the action it's recording.
    console.error('[audit-log] failed to record entry', error);
  }
}

// Express puts the first hop of X-Forwarded-For in req.ip only when
// `trust proxy` is configured - falls back to the raw socket address
// otherwise. Either way this is best-effort metadata, not an auth signal.
function resolveIp(req) {
  return req?.ip || req?.socket?.remoteAddress || null;
}

// Forensic logger for structural/role/override changes: records a
// before/after snapshot plus requester IP/user-agent. Fire-and-forget by
// design (see logAuditEvent below) - never awaited by the caller's request
// path, so a slow or failing audit write can't add latency to or block the
// action it's describing.
export async function logAuditEventNow(actorId, actionType, targetType, targetId, oldValues, newValues, req) {
  await createAuditLogEvent({
    actorId,
    actionType,
    targetType,
    targetId,
    oldValues,
    newValues,
    ipAddress: resolveIp(req),
    userAgent: req?.headers?.['user-agent'] || null,
  });
}

// Non-blocking entry point: schedules the insert on the next microtask/IO
// tick and returns immediately. Errors are swallowed (logged only) so a
// broken audit write never surfaces as a failed request or an unhandled
// rejection - auditing is observability, not a transactional guarantee.
export function logAuditEvent(actorId, actionType, targetType, targetId, oldValues, newValues, req) {
  return logAuditEventNow(actorId, actionType, targetType, targetId, oldValues, newValues, req).catch((error) => {
    console.error('[audit-log] failed to record event', { actionType, targetType, targetId, error });
  });
}
