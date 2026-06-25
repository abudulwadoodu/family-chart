import { getDb } from '../db/index.js';

export function invalidatePendingOtpRequests(email) {
  const db = getDb();
  db.prepare("UPDATE otp_requests SET consumed_at = datetime('now') WHERE email = ? AND consumed_at IS NULL").run(
    email
  );
}

export function createOtpRequest(email, otpHash, expiryMinutes) {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO otp_requests (email, otp_hash, expires_at) VALUES (?, ?, datetime('now', ?))")
    .run(email, otpHash, `+${expiryMinutes} minutes`);
  return db.prepare('SELECT * FROM otp_requests WHERE id = ?').get(result.lastInsertRowid);
}

export function getPendingOtpRequest(email) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM otp_requests
       WHERE email = ? AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(email);
}

export function incrementAttemptCount(id) {
  const db = getDb();
  db.prepare('UPDATE otp_requests SET attempt_count = attempt_count + 1 WHERE id = ?').run(id);
}

export function markConsumed(id) {
  const db = getDb();
  db.prepare("UPDATE otp_requests SET consumed_at = datetime('now') WHERE id = ?").run(id);
}

export function isExpired(otpRequest) {
  const db = getDb();
  const row = db.prepare("SELECT datetime('now') > ? AS expired").get(otpRequest.expires_at);
  return Boolean(row.expired);
}
