const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isNonEmptyString(value, max = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function isValidEmail(email) {
  return typeof email === 'string' && email.trim().length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email.trim());
}
