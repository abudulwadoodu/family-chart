export const ADMIN_ROLES = { SUPER_ADMIN: 'super_admin', SUPPORT_ADMIN: 'support_admin' };

// Additive: a role that isn't listed here (or a permission not listed for a role)
// is denied by default, so adding a new role later means adding one entry, not
// auditing every call site. Mirrors backend/middleware/requireRole.js's routes.
const ROLE_PERMISSIONS = {
  [ADMIN_ROLES.SUPER_ADMIN]: ['*'],
  [ADMIN_ROLES.SUPPORT_ADMIN]: [
    'dashboard:view',
    'users:view',
    'users:suspend',
    'tickets:*',
    'trees:view',
    'members:view',
    'analytics:view',
    'auditLogs:view',
    'settings:view',
  ],
};

export function hasPermission(user, permission) {
  const role = user?.admin_role;
  if (!role) return false;
  const granted = ROLE_PERMISSIONS[role] || [];
  if (granted.includes('*')) return true;
  if (granted.includes(permission)) return true;
  const [resource] = permission.split(':');
  return granted.includes(`${resource}:*`);
}
