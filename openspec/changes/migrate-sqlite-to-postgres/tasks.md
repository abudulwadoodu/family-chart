## 1. Infra and dependencies

- [x] 1.1 Provision an AWS RDS PostgreSQL 16 instance reachable from the EC2 host; record connection details (Terraform: `terraform/rds.tf` — run `terraform apply` to actually provision; not applied by the agent)
- [x] 1.2 Add `docker-compose.yml` at the repo root defining a `postgres:16` service with a named volume, exposed port, and credentials sourced from `.env`, for local development
- [x] 1.3 Add `pg` to `package.json` dependencies; remove `better-sqlite3` once migration is complete (keep during transition for the one-time data copy script)
- [x] 1.4 Add `DATABASE_URL` to local `.env.example` (pointing at the Docker container), EC2 `.env` (pointing at RDS via SSM at deploy time — see `.github/workflows/cd.yml`)
- [ ] 1.5 Document local dev setup (`docker compose up -d`, running migrations/seed against it) — no root README exists in this repo; setup is documented in `.env.example` comments instead

## 2. Schema and migration runner

- [x] 2.1 Port `backend/db/schema.sql` to PostgreSQL DDL: `SERIAL`/`GENERATED ALWAYS AS IDENTITY` instead of `AUTOINCREMENT`, `TIMESTAMPTZ DEFAULT now()` instead of `TEXT DEFAULT (datetime('now'))`, `BOOLEAN` instead of `INTEGER` flags, `BYTEA` instead of `BLOB`, `JSONB` instead of `TEXT` for `family_data.json_data` (`backend/db/migrations/001_init.sql`)
- [x] 2.2 Build the numbered migration runner (`schema_migrations` tracking table + reads `migrations/NNN_*.sql` in order + applies unapplied ones transactionally) to replace `runMigrations()` in `backend/db/index.js` (`backend/db/migrate.js`)
- [x] 2.3 Convert the initial schema into migration file `001_init.sql`; the `is_admin`/`admin_role`/`status`/`family_data.updated_at` columns and the `tree_permissions` (not `tree_memberships`) shape are folded directly into `001_init.sql` since a fresh Postgres database starts at the final shape — no legacy intermediate states to replay
- [x] 2.4 Add indexes from `schema.sql` (lines 218-240) to the ported Postgres migration files

## 3. Core data access layer

- [x] 3.1 Rewrite `backend/db/index.js`: replace `better-sqlite3` `Database`/`getDb()` with a `pg` `Pool`, export an async `getPool()`/`query()` helper, and a `withTransaction(fn)` helper that checks out a client and runs `BEGIN`/`COMMIT`/`ROLLBACK`
- [x] 3.2 Wire `initDb()` (or its replacement) to run the migration runner from task 2.2 at startup

## 4. Convert models to async Postgres queries

- [x] 4.1 `backend/models/userModel.js`: convert all functions to async, `?`→`$1..`, `datetime('now', ?)`→`NOW() - make_interval(days => $n)`, `json_array_length`→`jsonb_array_length`, boolean flags to `true`/`false`
- [x] 4.2 `backend/models/permissionModel.js`: convert to async, port its `db.transaction` call to `withTransaction`
- [x] 4.3 `backend/models/ticketModel.js`: convert to async, port its `db.transaction` call to `withTransaction`, port `LIKE`→`ILIKE` multi-field search
- [x] 4.4 `backend/models/messageModel.js`: convert to async, port BLOB attachment columns to `BYTEA`/`Buffer` handling
- [x] 4.5 `backend/models/settingsModel.js`: convert to async, port its `db.transaction` call to `withTransaction`
- [x] 4.6 `backend/models/auditLogModel.js`: convert to async, port `LIKE`→`ILIKE` multi-field search
- [x] 4.7 `backend/models/mediaModel.js`: convert to async
- [x] 4.8 `backend/models/mediaTagModel.js`: convert to async
- [x] 4.9 `backend/models/albumModel.js`: convert to async
- [x] 4.10 `backend/models/eventModel.js`: convert to async
- [x] 4.11 Grep for remaining `db.prepare` usages outside `backend/models/` to confirm none are missed — found `backend/models/memberModel.js` (not in the original inventory) and all route/test files; memberModel converted alongside routes below

## 5. Convert routes with inline DB access

- [x] 5.1 `backend/routes/trees.js`: convert to async, port its `db.transaction` call (tree creation) to `withTransaction`, port all `ON CONFLICT` upserts and `jsonb_array_length` usage
- [x] 5.2 `backend/routes/adminTrees.js`: convert to async, port `LIKE`→`ILIKE` search and `jsonb_array_length` usage
- [x] 5.3 `backend/routes/adminDashboard.js`: convert to async, port `SUM(json_array_length(...))`→`SUM(jsonb_array_length(...))`
- [x] 5.4 `backend/routes/adminUsers.js`, `adminAuditLogs.js`, `adminSettings.js`, `adminSupport.js`, `auth.js`, `support.js`, `account.js`, `albums.js`, `events.js`, `media.js`: convert any remaining direct DB calls to async and audit for missed `await`s. Also converted `backend/middleware/authorizeTree.js` and `backend/middleware/auth.js` (both called now-async model functions without awaiting), `backend/services/auditLog.js`, `backend/services/ticketWorkflow.js`, and `backend/models/memberModel.js` (discovered via the grep in 4.11; also fixed its `JSON.parse` on `json_data`, which `pg` now returns pre-parsed since the column is JSONB)

## 6. Seed script and one-time data migration

- [x] 6.1 Convert `backend/db/seed.js` to async Postgres queries
- [x] 6.2 Write a one-time migration script that reads all rows from `data/app.db` (via `better-sqlite3`, read-only) and inserts them into PostgreSQL preserving primary keys (sequence reset via `setval` after insert) and BLOB→BYTEA bytes (`backend/db/migrateSqliteToPostgres.js`, run via `npm run db:migrate-sqlite-to-postgres`). **Verified against the real local `data/app.db`** (5 users, 6 trees, 6 family_data rows incl. one with 248 members, 8 contact_submissions with real JPEG attachments) copied into the local Postgres container — every table's row count matched, JSONB member counts and BYTEA attachment byte-lengths spot-checked and correct. Caught and fixed a real bug in the process: the script originally `JSON.parse`'d `json_data` before handing it to `pg`, but `pg` doesn't serialize a parsed JS array back to a JSON literal for a JSONB parameter — it must be passed as the raw JSON text string instead.
- [x] 6.3 Add a guard so re-running the migration script against an already-migrated Postgres database refuses to duplicate rows — checks every target table is empty before inserting anything, and aborts with an error if not. Verified live: a second run against the now-populated database was correctly rejected with a clear error.
- [x] 6.4 Add a row-count verification step (per table, SQLite count vs. Postgres count) to the migration script's output

## 7. Tests

- [x] 7.1 Update `backend/db/index.test.js` to test the new Postgres pool/migration-runner setup instead of SQLite `PRAGMA table_info` (uses `information_schema.columns`/`information_schema.tables`)
- [x] 7.2 Update `backend/db/migration.test.js` to exercise the new numbered migration runner against Postgres (added an optional `migrationsDir` param to `runMigrations()` so the test can point it at a scratch directory)
- [x] 7.3 Update `backend/test/testEnv.js` to point `DATABASE_URL` at the local Docker Postgres and add a `resetDb()` helper (TRUNCATE, not RESTART IDENTITY - see note below)
- [x] 7.4 Update all model/route test files for async calls and Postgres-specific fixture setup/teardown - all 14 DB-touching test files converted and passing against a live `postgres:16` container
- [x] 7.5 Ran the full `test:backend` suite against real Postgres (Docker) locally: **27 files, 191 tests, all passing**. Two genuine dialect bugs were caught and fixed in the process: (1) `resetDb()` initially used `TRUNCATE ... RESTART IDENTITY`, which made deterministic user ids collide with the in-memory rate limiter's per-user-id bucket across tests reusing the same fixture email — switched to plain `TRUNCATE ... CASCADE` (no identity restart) to match SQLite's AUTOINCREMENT-never-reuses-ids behavior that the tests implicitly depended on; (2) `listMediaForMember`/`listEventsForTree` used `SELECT DISTINCT` with an `ORDER BY` expression not in the select list, which SQLite allows but Postgres rejects (`transformDistinctClause` error) - rewritten as `SELECT DISTINCT ON (id) ... ` in a subquery with the `ORDER BY` applied outside

## 8. CI/CD

- [x] 8.1 Add a `postgres:16` service container to `.github/workflows/ci.yml` for the `test:backend` job
- [x] 8.2 Update `.github/workflows/cd.yml`: remove the `data/` rsync exclude special-casing, fetch `DATABASE_URL` from SSM (via the EC2 instance's IAM role) at deploy time instead of a GitHub secret

## 9. Cutover

- [ ] 9.1 Dry-run the one-time migration script against a copy of production `data/app.db` into a staging RDS database; verify row counts and spot-check data (including attachments)
- [ ] 9.2 Execute production cutover per the Migration Plan in design.md within a brief maintenance window: stop app, snapshot `data/app.db`, run migration script against production RDS, update env config, redeploy, restart, health check
- [ ] 9.3 Verify core flows in production (login, tree load/save, media upload/view, support ticket creation) against RDS
- [ ] 9.4 Retain `data/app.db` as a cold backup for a rollback window before considering it retired
