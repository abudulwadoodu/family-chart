import os from 'os';
import path from 'path';

export function setBaseTestEnv() {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || 'postgresql://familytree_app:familytree_dev@localhost:5432/familytree';
  process.env.MEDIA_STORAGE_PATH = path.join(os.tmpdir(), 'family-chart-test-media');
  process.env.FRONTEND_ORIGIN = 'http://localhost:8080';
  process.env.COGNITO_USER_POOL_ID = 'ap-south-2_test';
  process.env.COGNITO_CLIENT_ID = 'test-client-id';
  process.env.SES_REGION = 'ap-south-2';
  process.env.SES_SENDER_EMAIL = 'no-reply@familychart.app';
  process.env.SES_RECIPIENT_EMAIL = 'support@familychart.app';
  process.env.ADMIN_EMAILS = 'admin@example.com';
}

// Postgres is a shared, persistent instance across test files (unlike SQLite's
// per-file :memory: database), so every test file must explicitly clear state
// between tests instead of relying on file-level isolation. Deliberately does
// NOT restart identity sequences: several test suites reuse the same fixture
// email/sub (e.g. 'user-sub') across multiple `it()` blocks within one file,
// and in-memory per-process state keyed by user id (like the rate limiter in
// middleware/rateLimit.js) relies on that user getting a fresh id each time a
// prior row is cleared - matching SQLite's AUTOINCREMENT, which also never
// reuses ids after a DELETE.
export async function resetDb() {
  // Hard guard: TRUNCATE below wipes every table. If DATABASE_URL isn't visibly a
  // test database (name contains "test"), refuse rather than risk truncating a dev/
  // prod database because TEST_DATABASE_URL failed to load for any reason.
  if (!/test/i.test(process.env.DATABASE_URL || '')) {
    throw new Error(
      `Refusing to resetDb(): DATABASE_URL does not look like a test database (${process.env.DATABASE_URL}). ` +
        'Set TEST_DATABASE_URL in .env to a database whose name contains "test".'
    );
  }

  const { query } = await import('../db/index.js');
  await query(`
    TRUNCATE TABLE
      users, trees, tree_permissions, special_access_overrides, tree_join_requests, family_data,
      contact_submissions, support_tickets, support_messages,
      settings, audit_logs, media, media_tags, media_shares, albums, album_media,
      events, event_participants, event_media, event_shares
    CASCADE
  `);
}
