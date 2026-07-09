## Context

The backend (`backend/`) is an Express app using `better-sqlite3` synchronously against a single file, `data/app.db`. Roughly 15 model files (`backend/models/*.js`) plus several route files (`backend/routes/trees.js`, `adminTrees.js`, `adminDashboard.js`, etc.) call `getDb()` from `backend/db/index.js` and issue synchronous `db.prepare(...).get/all/run(...)` calls. Schema bootstrap and ad hoc forward migrations both live in `backend/db/index.js` (`initDb()` / `runMigrations()`), which inspects `PRAGMA table_info(...)` at boot to decide whether to `ALTER TABLE`.

The app is deployed to a single EC2 instance via rsync + pm2 (`.github/workflows/cd.yml`); `data/` is explicitly excluded from the deploy sync so the SQLite file persists across deploys on that one box. This is the core constraint driving the migration: the database cannot be separated from the app server today, so there's no way to run more than one backend instance or to fail over.

SQLite-specific surface area in use today: `datetime('now')` / `datetime('now', '-30 days')` for timestamps, `json_array_length()` on a TEXT column holding JSON, `LIKE` for substring search, `PRAGMA table_info` for introspection, `db.transaction(fn)` for atomic multi-statement writes, BLOB columns for email/ticket attachments, and `INSERT ... ON CONFLICT ... DO UPDATE` (already ANSI-ish, carries over almost unchanged).

## Goals / Non-Goals

**Goals:**
- Move all persistent data from the single SQLite file to a PostgreSQL database reachable over the network (AWS RDS in production), so the app tier can scale beyond one instance.
- Give local development a disposable, easy-to-reset PostgreSQL instance via Docker, so developers aren't required to have Postgres installed natively or to share a remote database.
- Convert the data access layer from `better-sqlite3`'s synchronous API to an async, pooled `pg` API with equivalent behavior.
- Replace the ad hoc `runMigrations()` pattern with a real numbered-migration mechanism, since Postgres has no `PRAGMA table_info`-style introspection shortcut and this was already a weak point in the SQLite implementation.
- Provide a one-time, re-run-safe script to migrate existing production data out of `data/app.db` into Postgres.
- Keep externally-observable API behavior (response shapes, status codes, pagination, sort/filter semantics) unchanged — this is an internal storage migration, not a feature change.

**Non-Goals:**
- No changes to API routes' request/response contracts.
- No introduction of an ORM (Prisma/Sequelize/Knex) — staying with hand-written SQL via `pg` to keep the diff focused on swapping the driver and dialect, not the whole data access paradigm.
- No multi-region / read-replica setup in this change — single primary Postgres instance is sufficient to unblock horizontal app scaling.
- No change to the media/attachment storage backend (`backend/services/storage/*`) beyond the `media`/`support_messages`/`contact_submissions` BLOB columns moving to `BYTEA`.
- No requirement that the local Docker Postgres version track RDS exactly to the patch level — see Decisions for the versioning approach.

## Decisions

**Driver: `pg` (node-postgres), not an ORM.**
The existing code is already raw SQL organized by model file. `pg` gives a connection pool and parameterized queries with the smallest conceptual jump from `better-sqlite3`. An ORM would force a much larger rewrite (schema-as-code, query builder idioms) for no benefit given the codebase's size and the fact every query is already hand-written and well-isolated in model files. Alternative considered: Knex (query builder, could ease `?`→`$1` conversion) — rejected to avoid adding an abstraction layer on top of `pg` when the raw SQL is already simple enough to hand-port.

**Migration mechanism: numbered `.sql` files + a `schema_migrations` tracking table, executed by a small custom runner (not a new framework dependency).**
The team already has one SQL schema file and ad hoc patch-up logic; a lightweight runner (read `migrations/NNN_name.sql` files in order, track applied filenames in a table, run unapplied ones inside a transaction) is simple enough to hand-roll in <100 lines and avoids pulling in `node-pg-migrate` or `umzug` as a new dependency for a project this size. Alternative considered: `node-pg-migrate` — reasonable, but rejected only to minimize new dependencies; revisit if migration complexity grows.

**Transactions: explicit client checkout, not a `withTransaction` abstraction (initially).**
`better-sqlite3`'s `db.transaction(fn)` wraps a synchronous function. `pg` transactions require checking out a dedicated client from the pool and issuing `BEGIN`/`COMMIT`/`ROLLBACK` on that same client (not the pool). Each of the four call sites (`ticketModel.js`, `settingsModel.js`, `permissionModel.js`, `routes/trees.js`) will be converted individually to `client = await pool.connect(); try { BEGIN; ...; COMMIT } catch { ROLLBACK } finally { client.release() }`. A shared `withTransaction(fn)` helper in `backend/db/index.js` will wrap this pattern since all four sites need identical boilerplate.

**Timestamps: `TIMESTAMPTZ` with `DEFAULT now()`, not `TEXT`.**
SQLite stored timestamps as ISO-ish text via `datetime('now')`. Postgres has a native `TIMESTAMPTZ`; using it natively (rather than continuing to store text) gets correct comparison/sorting for free and matches idiomatic Postgres usage. Call sites using `datetime('now', '-30 days')` for windowed counts become `NOW() - INTERVAL '30 days'`.

**JSON storage: `JSONB` for `family_data.json_data`, not `TEXT`.**
This column is read with `json_array_length()` for member counts and otherwise treated as an opaque blob by the app (parsed/serialized in application code). `JSONB` lets us keep the same "opaque payload" usage pattern while getting `jsonb_array_length()` for the one place that needs to peek inside it, plus indexing options later if needed.

**Boolean/flag columns: native `BOOLEAN`, not `INTEGER` 0/1.**
`users.is_admin`, `media_tags` flags, etc. move from `INTEGER NOT NULL DEFAULT 0` to `BOOLEAN NOT NULL DEFAULT false`. This is a genuine behavior-adjacent change: `db.prepare(...).run()` call sites that pass `1`/`0` literals need updating to pass `true`/`false`, and any JS code that does truthy checks on the raw DB value (e.g. `user.is_admin` used as a JS boolean) is unaffected since both `1` and `true` are truthy, but code that does `=== 1` needs updating to `=== true` (audited during model conversion).

**Attachments: `BYTEA`, not `BLOB`.**
Direct column-type rename; `pg` returns `BYTEA` columns as Node `Buffer`s, same as `better-sqlite3` does for `BLOB`, so no changes needed in code that consumes attachment bytes (email sending, download responses).

**Data cutover strategy: scripted one-time copy with a maintenance-window cutover, not dual-write/backfill.**
Given this is a small, single-instance production app, a short maintenance window (stop the app, run the copy script against a snapshot of `data/app.db`, point `DATABASE_URL` at Postgres, restart) is far simpler and lower-risk than a dual-write migration. Alternative considered: dual-write with gradual cutover — rejected as unnecessary complexity for the current traffic/scale.

**Hosting: AWS RDS for PostgreSQL in production, a local Docker container for development.**
RDS gives managed backups, point-in-time recovery, and patching without operational burden, which matches why this migration is happening in the first place (decoupling the DB from the single EC2 host). For local development, requiring every developer to install and manage a native Postgres server is unnecessary friction; a Docker container (official `postgres` image) started via `docker compose` gives a disposable, resettable instance that matches production's engine/major version. Alternative considered: SQLite-in-dev/Postgres-in-prod (two code paths) — rejected because it reintroduces exactly the dialect-divergence risk this migration is meant to eliminate, and would require maintaining two schema definitions and two sets of tests. Alternative considered: a shared remote dev database — rejected as unnecessary shared-state risk for local iteration when a local container resets cleanly.
- `docker-compose.yml` (new, repo root) defines a `postgres` service with a named volume for persistence across container restarts, exposing the standard Postgres port to localhost, with credentials sourced from a local `.env`.
- Local `DATABASE_URL` points at `localhost` (the Docker container); CI's `DATABASE_URL` points at the CI-provided Postgres service container (see Risks/Trade-offs and CI/CD tasks); production `DATABASE_URL` points at the RDS endpoint. All three are the same `pg` client code path — only the connection string differs per environment.
- Pin the Docker image tag to `postgres:16` and provision RDS on PostgreSQL 16, so schema/dialect behavior matches between local dev and production; exact minor version need not match.

## Risks / Trade-offs

- **[Risk]** Converting ~15 model files plus route-level DB calls from sync to async touches nearly every backend request path → **Mitigation**: convert and test one model file at a time, keep the Vitest suite green after each file, and rely on the existing route test coverage (there's a test file per route) to catch missed `await`s.
- **[Risk]** `INTEGER` 0/1 → `BOOLEAN` conversion could silently break a strict-equality check (`=== 1`) somewhere not caught by search → **Mitigation**: grep for all boolean-flag columns' JS usages before conversion and add/keep test assertions on the exact boolean value returned.
- **[Risk]** The one-time SQLite→Postgres data copy could lose or corrupt data (especially BLOB attachments or edge-case NULLs) → **Mitigation**: script writes row counts per table before/after and diffs them; dry-run against a copy of production data before the real cutover; keep `data/app.db` as a cold backup after cutover.
- **[Risk]** No Postgres instance currently provisioned; this change depends on infra (RDS) being available with network access from the EC2 host, and a new secret (`DATABASE_URL`) in GitHub Actions/EC2 `.env` → **Mitigation**: provisioning is called out explicitly as a prerequisite task, not assumed.
- **[Risk]** Local Docker Postgres and production RDS could drift in version/config and mask a compatibility bug until deploy → **Mitigation**: pin the Docker image to the same major version as RDS; CI runs the real test suite against a Postgres service container as the actual gate before merge, so local dev parity is a convenience, not the correctness backstop.
- **[Trade-off]** Hand-rolling the migration runner instead of using an established tool (`node-pg-migrate`) means less battle-tested edge-case handling (e.g. concurrent migration races) → acceptable given single-instance deploy today; revisit if multi-instance deploys begin running migrations concurrently.
- **[Risk]** CI currently has no database service container; `test:backend` needs a Postgres instance available in `ci.yml` → **Mitigation**: add a `postgres` service container to the CI job, matching the version used in production.

## Migration Plan

1. Provision an AWS RDS PostgreSQL instance reachable from the EC2 host; obtain a `DATABASE_URL`. Add `docker-compose.yml` for local dev Postgres in parallel (not a production dependency, can happen anytime before task 4 below).
2. Land the code changes (driver swap, schema port, migration runner, model/route conversion to async) behind the existing test suite, running against Postgres in CI and locally — this can ship to `master` and deploy without cutting over production traffic, as long as `DATABASE_URL` in production still points nowhere/is unset and a feature branch or explicit env gate keeps prod on SQLite until cutover. (Simplify: since this is a single small app, prefer merging once the whole conversion is complete rather than a long-lived dual-code-path branch — see Non-Goals.)
3. Take a maintenance window: stop the production app (pm2 stop), copy `data/app.db` off the EC2 host, run the one-time migration script against that snapshot into the provisioned Postgres instance, verify row counts match per table.
4. Set `DATABASE_URL` in the EC2 `.env` and GitHub Actions secrets; remove `DB_PATH`/SQLite references from `cd.yml` (including the `data/` rsync exclude, which becomes moot).
5. Deploy the already-merged Postgres-based code, restart the app (pm2 start), run the health check.
6. Verify core flows (login, tree load/save, media, support tickets) against production Postgres.
7. Keep `data/app.db` as a cold backup on the EC2 host (or copy it off) for a rollback window; do not delete immediately.

**Rollback strategy:** if Postgres cutover fails validation, revert `DATABASE_URL`/`DB_PATH` env config and redeploy the last SQLite-based release (the previous git tag/commit before this change merged) — `data/app.db` was untouched during cutover (only read from), so no data loss on rollback as long as no writes happened against Postgres that need to be replayed back to SQLite. Any writes that happened against Postgres during the validation window before a rollback decision would need manual reconciliation; keep the validation window short.

## Open Questions

None outstanding. Resolved:
- Postgres major version: **16**, for RDS, the local Docker image, and the CI service container.
- Cutover downtime: a brief maintenance window is acceptable; no zero-downtime/replication-based cutover is required.
