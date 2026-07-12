import { query } from '../db/index.js';
import { getActiveOverride } from '../models/specialAccessModel.js';

const WRITE_ROLES = new Set(['owner', 'editor']);
const READ_ROLES = new Set(['owner', 'editor', 'viewer']);
const WRITE_OVERRIDE_LEVELS = new Set(['read_write']);
const READ_OVERRIDE_LEVELS = new Set(['read_only', 'read_write']);

// Resolves which resource this request is acting on. Routes in this app are nested
// under /api/trees/:treeId/..., with a more specific id (e.g. :eventId) present when
// the request targets a sub-resource. An explicit override on that sub-resource is
// checked first; it falls back to the tree itself so a tree-level grant still covers
// every event under it.
function resolveTargets(req) {
  const treeId = Number(req.params.treeId || req.params.id);
  const targets = [];
  if (req.params.eventId) {
    targets.push({ targetType: 'timeline_event', targetId: Number(req.params.eventId) });
  }
  if (treeId) {
    targets.push({ targetType: 'tree', targetId: treeId });
  }
  return targets;
}

async function getStructuralRole(userId, treeId) {
  if (!treeId) return null;
  const { rows } = await query('SELECT role FROM tree_permissions WHERE user_id = $1 AND tree_id = $2', [
    userId,
    treeId,
  ]);
  return rows[0]?.role || null;
}

/**
 * checkPermission(requiredAction) — cascading authorization for tree-scoped routes.
 *
 * Evaluation order: superadmin bypass -> structural role in tree_permissions
 * (owner/editor get read+write, viewer gets read only) -> explicit
 * special_access_overrides grant on the resource -> 403.
 */
export function checkPermission(requiredAction) {
  if (requiredAction !== 'read' && requiredAction !== 'write') {
    throw new Error(`checkPermission: requiredAction must be 'read' or 'write', got '${requiredAction}'`);
  }

  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // 1. Superadmin bypass.
      if (req.user.adminRole === 'super_admin') {
        return next();
      }

      const targets = resolveTargets(req);
      const treeId = targets.find((t) => t.targetType === 'tree')?.targetId;
      if (!targets.length) {
        return res.status(400).json({ error: 'Invalid resource context' });
      }

      // 2. Structural RBAC check.
      const role = await getStructuralRole(userId, treeId);
      if (role) {
        const allowed = requiredAction === 'write' ? WRITE_ROLES.has(role) : READ_ROLES.has(role);
        if (allowed) return next();
      }

      // 3. Explicit override check, most specific target first.
      const allowedLevels = requiredAction === 'write' ? WRITE_OVERRIDE_LEVELS : READ_OVERRIDE_LEVELS;
      for (const { targetType, targetId } of targets) {
        const override = await getActiveOverride(userId, targetType, targetId);
        if (override && allowedLevels.has(override.permission_level)) {
          req.specialAccessOverride = override;
          return next();
        }
      }

      // 4. Deny.
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    } catch (error) {
      return next(error);
    }
  };
}
