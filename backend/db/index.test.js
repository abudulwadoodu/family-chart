import { describe, it, expect } from 'vitest';

import { setBaseTestEnv } from '../test/testEnv.js';

setBaseTestEnv();

const { initDb, getDb } = await import('./index.js');

describe('initDb', () => {
  it('creates the users table with a cognito_sub column and no password/OTP/refresh-token tables', () => {
    initDb();
    const db = getDb();

    const columns = db.prepare('PRAGMA table_info(users)').all();
    expect(columns.some((column) => column.name === 'cognito_sub')).toBe(true);
    expect(columns.some((column) => column.name === 'password_hash')).toBe(false);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    expect(tables).not.toContain('otp_requests');
    expect(tables).not.toContain('refresh_tokens');
  });
});
