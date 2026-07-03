// Gate a route behind one or more admin_role values. Must run after requireAuth
// and requireAdmin - it only narrows within "is an admin", it doesn't grant it.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.adminRole)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    return next();
  };
}
