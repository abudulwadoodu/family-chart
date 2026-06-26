import { getPermissionByUserAndTree } from '../models/permissionModel.js';

export function requireTreeRole(allowedRoles = []) {
  return (req, res, next) => {
    const treeId = Number(req.params.id || req.params.treeId);
    const userId = req.user?.id;

    if (!treeId || !userId) {
      return res.status(400).json({ error: 'Invalid tree or user context' });
    }

    const permission = getPermissionByUserAndTree(userId, treeId);

    if (!permission) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (allowedRoles.length && !allowedRoles.includes(permission.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    req.treePermission = permission;
    return next();
  };
}
