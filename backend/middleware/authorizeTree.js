import { getMembershipByUserAndTree } from '../models/membershipModel.js';

export function requireTreeRole(allowedRoles = []) {
  return (req, res, next) => {
    const treeId = Number(req.params.id || req.params.treeId);
    const userId = req.user?.id;

    if (!treeId || !userId) {
      return res.status(400).json({ error: 'Invalid tree or user context' });
    }

    const membership = getMembershipByUserAndTree(userId, treeId);

    if (!membership || membership.status !== 'approved') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (allowedRoles.length && !allowedRoles.includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    req.treeMembership = membership;
    return next();
  };
}
