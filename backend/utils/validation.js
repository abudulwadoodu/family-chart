const validRoles = new Set(['owner', 'editor', 'viewer']);
const validStatuses = new Set(['pending', 'approved', 'revoked']);

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

export function isNonEmptyString(value, max = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function isValidRole(role) {
  return validRoles.has(role);
}

export function isValidStatus(status) {
  return validStatuses.has(status);
}
