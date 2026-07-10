import fs from 'fs';
import path from 'path';
import os from 'os';
import pg from 'pg';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setBaseTestEnv } from '../test/testEnv.js';

setBaseTestEnv();

const { Pool } = pg;
const { getPool, initDb, closeDb } = await import('./index.js');
const { runMigrations } = await import('./migrate.js');

describe('schema_migrations tracking (real backend/db/migrations)', () => {
  beforeEach(async () => {
    await initDb();
  });

  afterEach(async () => {
    await closeDb();
  });

  it('records every applied migration file by name', async () => {
    const { rows } = await getPool().query('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toContain('001_init.sql');
  });

  it('does not re-apply a migration that is already recorded', async () => {
    const pool = getPool();
    const before = await pool.query('SELECT COUNT(*) AS c FROM schema_migrations');

    await runMigrations(pool);

    const after = await pool.query('SELECT COUNT(*) AS c FROM schema_migrations');
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  it('produces the final schema directly - no legacy tree_memberships table exists to migrate from', async () => {
    const { rows } = await getPool().query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tree_memberships'`
    );
    expect(rows).toHaveLength(0);
  });

  it('applies 007_media_event_visibility.sql: visibility columns default to tree, and *_shares tables exist', async () => {
    const { rows: applied } = await getPool().query('SELECT name FROM schema_migrations ORDER BY name');
    expect(applied.map((r) => r.name)).toContain('007_media_event_visibility.sql');

    const { rows: mediaColumns } = await getPool().query(
      `SELECT column_default FROM information_schema.columns WHERE table_name = 'media' AND column_name = 'visibility'`
    );
    expect(mediaColumns[0].column_default).toContain('tree');

    const { rows: eventColumns } = await getPool().query(
      `SELECT column_default FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'visibility'`
    );
    expect(eventColumns[0].column_default).toContain('tree');

    const { rows: sharesTables } = await getPool().query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('media_shares', 'event_shares')`
    );
    expect(sharesTables.map((r) => r.table_name).sort()).toEqual(['event_shares', 'media_shares']);
  });
});

describe('runMigrations against a scratch migration directory', () => {
  it('applies numbered migrations in order and skips already-applied ones on a second run', async () => {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-chart-migrations-'));
    fs.writeFileSync(
      path.join(scratchDir, '001_create_widgets.sql'),
      'CREATE TABLE widgets (id SERIAL PRIMARY KEY, name TEXT NOT NULL);',
      'utf8'
    );
    fs.writeFileSync(path.join(scratchDir, '002_add_widget_color.sql'), 'ALTER TABLE widgets ADD COLUMN color TEXT;', 'utf8');

    const schema = `scratch_${Date.now()}`;
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

    try {
      await runMigrations(pool, scratchDir);
      await runMigrations(pool, scratchDir); // second run must be a no-op, not an error

      const { rows: columns } = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'widgets'`,
        [schema]
      );
      expect(columns.map((c) => c.column_name)).toEqual(expect.arrayContaining(['id', 'name', 'color']));

      const { rows: applied } = await pool.query(
        `SELECT name FROM schema_migrations ORDER BY name`
      );
      expect(applied.map((r) => r.name)).toEqual(['001_create_widgets.sql', '002_add_widget_color.sql']);
    } finally {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });
});
