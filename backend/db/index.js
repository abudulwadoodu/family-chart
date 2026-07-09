import pg from 'pg';
import { runMigrations } from './migrate.js';

const { Pool } = pg;

let pool;

// RDS's default parameter group sets rds.force_ssl=1, so a plain (non-SSL)
// connection is rejected by Postgres itself at the pg_hba.conf layer before
// auth even runs. Local Docker Postgres has no such requirement and has no
// TLS listener at all, so SSL must be opt-in per environment rather than
// always-on. `rejectUnauthorized: false` is used (rather than a CA bundle)
// because RDS's certificate is signed by Amazon's regional CA, which isn't
// in Node's default trust store; this still gets encryption in transit, just
// without verifying the server certificate chain.
function shouldUseSsl(connectionString) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return true;
  return !/localhost|127\.0\.0\.1/.test(connectionString);
}

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }
    pool = new Pool({
      connectionString,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
    });
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
