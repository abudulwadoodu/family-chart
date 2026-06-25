import { getDb } from '../db/index.js';

export function createRefreshToken(userId, tokenHash, ttlSeconds) {
  const db = getDb();
  db.prepare("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', ?))").run(
    userId,
    tokenHash,
    `+${ttlSeconds} seconds`
  );
}

export function findValidRefreshToken(tokenHash) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')")
    .get(tokenHash);
}

export function deleteRefreshTokenByHash(tokenHash) {
  const db = getDb();
  db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);
}

export function deleteAllRefreshTokensForUser(userId) {
  const db = getDb();
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}
