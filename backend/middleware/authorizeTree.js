import { query } from '../db/index.js';
import { getPermissionByUserAndTree } from '../models/permissionModel.js';

// Same shape as requireAuth's suspended-user check (middleware/auth.js) - a
// disabled tree is unreachable by every role, owner included, not just
// blocked from writes. Admins still read it through adminTrees.js, which
// bypasses this middleware entirely.
export function requireTreeRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const treeId = Number(req.params.id || req.params.treeId);
      const userId = req.user?.id;

      if (!treeId || !userId) {
        return res.status(400).json({ error: 'Invalid tree or user context' });
      }

      const { rows } = await query('SELECT status FROM trees WHERE id = $1', [treeId]);
      const tree = rows[0];
      if (!tree) return res.status(404).json({ error: 'Tree not found' });
      if (tree.status === 'disabled') return res.status(403).json({ error: 'This family tree has been disabled' });

      const permission = await getPermissionByUserAndTree(userId, treeId);

      if (!permission) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (allowedRoles.length && !allowedRoles.includes(permission.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.treePermission = permission;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
