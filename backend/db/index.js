import pg from 'pg';
import { runMigrations } from './migrate.js';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

// Checks out a dedicated client so BEGIN/COMMIT/ROLLBACK apply to the same
// connection - the pool itself round-robins connections per query and can't
// hold a transaction across statements.
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initDb() {
  await runMigrations(getPool());
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
