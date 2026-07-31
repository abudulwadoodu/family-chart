import { randomInt, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Zero-padded so every code is exactly 6 digits (randomInt's lower bound
// means a code can start with 0, e.g. "042817" - padStart keeps that visible
// rather than silently emailing a 5-digit code).
export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Same salted-scrypt shape as backend/utils/passcode.js - the code is a
// short-lived secret the guest typed in, same trust model as a passcode.
export function hashOtpCode(code) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(code, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyOtpCode(code, storedHash) {
  if (!storedHash || typeof code !== 'string') return false;
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(code, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
