// Extend this array (and add one `state.admin.section` case in main.js's
// renderAdminSectionContent + loadAdminSection) to add a new admin module.
// `permission` gates visibility per frontend/admin/shared/permissions.js.
export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', enabled: true, permission: 'dashboard:view' },
  { id: 'users', label: 'Users', enabled: true, permission: 'users:view' },
  { id: 'tickets', label: 'Support Tickets', enabled: true, permission: 'tickets:view' },
  { id: 'trees', label: 'Family Trees', enabled: true, permission: 'trees:view' },
  { id: 'analytics', label: 'Analytics', enabled: true, permission: 'analytics:view' },
  { id: 'settings', label: 'Settings', enabled: true, permission: 'settings:view' },
  { id: 'auditLogs', label: 'Audit Logs', enabled: true, permission: 'auditLogs:view' },
];
