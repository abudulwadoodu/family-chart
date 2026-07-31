import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Salted scrypt hash stored as "salt:hash" (both hex) in one TEXT column -
// no extra dependency needed (bcrypt/argon2 aren't already in package.json;
// see backend/routes/auth being Cognito-based, so this is the only place in
// the app that ever hashes a secret) since Node's built-in crypto covers it.
export function hashPasscode(passcode) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPasscode(passcode, storedHash) {
  if (!storedHash) return false;
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(passcode, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
