import { describe, it, expect, beforeEach } from 'vitest';

import { setBaseTestEnv, resetDb } from '../test/testEnv.js';

setBaseTestEnv();

const { initDb, query } = await import('./index.js');

beforeEach(async () => {
  await initDb();
  await resetDb();
});

describe('initDb', () => {
  it('creates the users table with a cognito_sub column and no password/OTP/refresh-token tables', async () => {
    const { rows: columns } = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`
    );
    const columnNames = columns.map((row) => row.column_name);
    expect(columnNames).toContain('cognito_sub');
    expect(columnNames).not.toContain('password_hash');

    const { rows: tableRows } = await query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const tables = tableRows.map((row) => row.table_name);
    expect(tables).not.toContain('otp_requests');
    expect(tables).not.toContain('refresh_tokens');
    expect(tables).not.toContain('tree_memberships');
    expect(tables).toContain('tree_permissions');
  });

  it('is safe to run twice - migrations are only applied once', async () => {
    await initDb();
    const { rows } = await query('SELECT name FROM schema_migrations');
    const names = rows.map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
