const validRoles = new Set(['owner', 'editor', 'viewer']);
const validStatuses = new Set(['pending', 'approved', 'revoked']);

export function isNonEmptyString(value, max = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function isValidRole(role) {
  return validRoles.has(role);
}

export function isValidStatus(status) {
  return validStatuses.has(status);
}
