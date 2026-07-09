## Why

The backend persists all data (users, trees, family data, media, support tickets, audit logs) in a single SQLite file (`data/app.db`) accessed via `better-sqlite3` on one EC2 instance. This blocks horizontal scaling (SQLite is single-writer, single-file, single-host), makes zero-downtime deploys risky (the file is excluded from every deploy sync and lives only on that one box), and has no managed backup/replication story beyond ad hoc file copies. Moving to PostgreSQL (e.g. RDS) decouples the database from the app server, enables multiple backend instances, and gets us point-in-time recovery and standard operational tooling.

## What Changes

- Replace `better-sqlite3` with a PostgreSQL client (`pg`), converting the synchronous DB access layer (`backend/db/index.js`) to an async pool-based one. **BREAKING**: every model/route function that touches the DB becomes `async`/returns a `Promise`.
- Port `backend/db/schema.sql` to PostgreSQL DDL: `SERIAL`/`IDENTITY` instead of `AUTOINCREMENT`, native `TIMESTAMPTZ` instead of `TEXT` timestamps, native `BOOLEAN` instead of `INTEGER` flags, `BYTEA` instead of `BLOB`, and `JSONB` instead of `TEXT` for `family_data.json_data`.
- Rewrite SQLite-specific SQL across all models/routes to Postgres syntax: `datetime('now', ?)` → `NOW() + INTERVAL`, `json_array_length(col)` → `jsonb_array_length(col)`, `LIKE` case-sensitivity/parameter placeholders (`?` → `$1, $2, ...`), `PRAGMA table_info` → `information_schema.columns`, `db.transaction(fn)` → explicit `BEGIN`/`COMMIT`/`ROLLBACK` via a pooled client, `INSERT ... ON CONFLICT` (already Postgres-compatible syntax, verify column/constraint names carry over).
- Replace the hand-rolled `runMigrations()` ad hoc migration function with a proper forward-only migration mechanism (numbered SQL migration files run in order) suitable for Postgres, since the existing approach was already an ad hoc stand-in for a real migration tool.
- Add a one-time data migration script that reads every row out of the existing `data/app.db` SQLite file and loads it into PostgreSQL, preserving primary keys and BLOB/attachment bytes.
- Update local dev setup (docs/scripts) and CD pipeline (`.github/workflows/cd.yml`) to provision/point at a PostgreSQL connection string (`DATABASE_URL`) instead of a SQLite file path (`DB_PATH`), and drop the `data/` exclude-from-sync special-casing.
- Update `backend/db/seed.js` and all Vitest suites that spin up an in-memory/temp SQLite DB (`db/index.test.js`, `db/migration.test.js`, and every route/model test using a test DB) to run against Postgres instead (e.g. a disposable test database/schema).

## Capabilities

### New Capabilities
- `db-postgres-access`: The application's data access layer — connection/pool management, transactions, and query conventions for PostgreSQL, replacing the previous SQLite-based access layer.
- `db-schema-migrations`: Forward-only, numbered SQL migration mechanism for evolving the Postgres schema over time, replacing the ad hoc `runMigrations()` SQLite patch-up logic.

### Modified Capabilities
(none — no existing `openspec/specs/` capabilities are defined yet for this project; the data access behavior is being introduced as spec-tracked capabilities for the first time.)

## Impact

- **Code**: `backend/db/index.js`, `backend/db/schema.sql`, `backend/db/seed.js`, every file under `backend/models/*.js`, and DB-touching code in `backend/routes/*.js` (trees, adminTrees, adminDashboard, adminUsers, adminAuditLogs, adminSettings, auth, support, adminSupport, albums, events, media, account).
- **Dependencies**: remove `better-sqlite3`; add `pg` (and optionally `pg-format`/a lightweight migration runner such as `node-pg-migrate` or hand-rolled numbered `.sql` files executed via `pg`).
- **Infra**: requires a provisioned AWS RDS PostgreSQL 16 instance reachable from the EC2 host; new `DATABASE_URL`/connection secrets in GitHub Actions and the EC2 `.env`. Local development uses a `postgres:16` Docker container (via a new `docker-compose.yml`) instead of RDS.
- **CI/CD**: `.github/workflows/ci.yml` needs a Postgres service container for `test:backend`; `.github/workflows/cd.yml` no longer needs to exclude `data/` from rsync, and needs the new DB connection secret wired through.
- **Data**: one-time cutover migration of existing production data in `data/app.db` into the new Postgres instance; `data/app.db` becomes legacy/retired after cutover.
- **Tests**: all backend Vitest suites that touch the DB (there are many — user, tree, permission, ticket, media, album, event, settings, audit-log models and their route tests) need their fixture/setup layer switched from an ephemeral SQLite DB to Postgres.
