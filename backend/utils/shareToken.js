import { randomBytes } from 'crypto';

// 24 random bytes -> 32-char base64url string: unguessable and safe to embed
// directly in a URL path segment (/tree/t/:shareToken) with no encoding needed.
export function generateShareToken() {
  return randomBytes(24).toString('base64url');
}
