# Family Tree App — System Context

Living architecture reference for the Family Tree application. Intended as memory-bank context for future work sessions. Ground-truthed against the codebase at `origin/master` / `develop` @ `733393e`, which includes the comments/reactions feature and audit-log forensics columns. Note: `feature/ui-enhancements` (a separate worktree) is currently behind this — it predates the comments/reactions and audit-log-forensics migrations described below.

---

## 1. Tech Stack & Environment

- **Runtime**: Node.js, single monorepo `package.json` at repo root, `"type": "module"` — ESM throughout backend and frontend.
- **Backend**: Express 5 (`express: ^5.2.1`).
- **Database**: PostgreSQL via `pg` (`pg: ^8.22.0`), connected through a `pg.Pool` in `backend/db/index.js`, configured by `DATABASE_URL`. Local dev via `docker-compose.yml` (`postgres:16` image, db `familytree`). Production via AWS RDS (see `terraform/`).
  - Note: `better-sqlite3` is also a dependency, but only powers a one-off migration script (`backend/db/migrateSqliteToPostgres.js`) — it is not the runtime datastore.
- **Auth**: AWS Cognito. JWTs verified server-side via `aws-jwt-verify` in `backend/middleware/auth.js`. Email delivery via AWS SES (`@aws-sdk/client-ses`).
- **Frontend**: Vanilla JS, ES modules, no framework (loaded via `<script type="module" src="/main.js">` in `frontend/index.html`). Rendering core uses `d3` — the app is built on top of this repo's own `family-chart` library (`src/`), with `frontend/` as the demo/consumer app.
- **Styling**: No Tailwind (no `tailwind.config.*` in the repo). A single large hand-authored stylesheet, `frontend/styles.css` (7000+ lines), using CSS custom properties as a design-token system (`--sp-*` spacing scale, `--radius-*`, `--bg-*`, `--transition-*`), with light/dark theme switching via `[data-theme='dark'|'light']` selectors toggled by `frontend/theme.js`.
- **Build/tooling**: Vite (app dev/build), Rollup (library build), Vitest (backend unit tests), Cypress (e2e tests).
- **Infra**: Terraform (`terraform/`) provisions EC2, RDS, Cognito, and a Lambda pre-signup hook.

---

## 2. Database Schema (DDL)

Schema is managed by hand-rolled migrations in `backend/db/migrations/*.sql`, applied in filename-sorted order by `backend/db/migrate.js` and tracked in a `schema_migrations(name, applied_at)` table (idempotent — already-applied filenames are skipped).

> Note: `backend/db/schema.sql` also exists in the repo but is a **stale SQLite-flavored reference file** (`PRAGMA`, `AUTOINCREMENT`) predating the Postgres migration. It is not loaded by any code path. The migrations directory below is the only ground truth.
>
> Note: three unrelated migrations landed independently as `010_*.sql` (`010_audit_logs_forensics.sql`, `010_comments_and_reactions.sql`, `010_tree_status.sql`) — a numbering collision from parallel feature branches. The migration runner tracks by full filename and sorts alphabetically, so this applies correctly with no conflict, but don't assume `010_` implies a single migration.

### `users`

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  cognito_sub TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  admin_role TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

-- Added by 010_comments_and_reactions.sql — comments need a name/photo to render against.
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

- `admin_role` ∈ `{'super_admin', 'support_admin'}` — enforced in application code (`backend/models/userModel.js`), not a SQL CHECK constraint.
- Admin promotion is env-var driven: any email in `ADMIN_EMAILS` (comma-separated) is auto-promoted to `super_admin` on login (`syncAdminFlag`). `support_admin` can only be granted by an existing admin via `setAdminRole()`. There is no self-serve UI to become the first admin.

### `trees`

```sql
CREATE TABLE trees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added by 010_tree_status.sql
ALTER TABLE trees ADD COLUMN status TEXT NOT NULL DEFAULT 'active'; -- 'active' | 'disabled'
```

### `tree_permissions` (role table — **not** named `tree_members`)

```sql
CREATE TABLE tree_permissions (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tree_id, user_id)
);
```

Roles are **owner / editor / viewer** (not "member" — correcting an earlier assumption).

### `special_access_overrides`

Added by `011_special_access_overrides.sql` — grants a specific user access to a specific tree or timeline event outside normal `tree_permissions` membership.

```sql
CREATE TABLE special_access_overrides (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('tree', 'timeline_event')),
  target_id INTEGER NOT NULL,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('read_only', 'read_write')),
  granted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX idx_special_access_overrides_lookup
  ON special_access_overrides (user_id, target_type, target_id);

-- Partial index: only expiring rows need to be found by expiry sweeps/checks.
CREATE INDEX idx_special_access_overrides_expires_at
  ON special_access_overrides (expires_at) WHERE expires_at IS NOT NULL;
```

Granting/revoking overrides is `super_admin`-only (`backend/routes/adminTrees.js`); viewing overrides and toggling tree status is shared between `super_admin`/`support_admin`.

### `audit_logs`

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX idx_audit_logs_admin_id ON audit_logs (admin_id);
```

`010_audit_logs_forensics.sql` extended this with **JSONB old/new value columns** for a forensic audit trail on role updates and admin overrides:

```sql
ALTER TABLE audit_logs ADD COLUMN old_values JSONB;
ALTER TABLE audit_logs ADD COLUMN new_values JSONB;
```

(Exact column names/indexes for this migration should be re-verified against `backend/db/migrations/010_audit_logs_forensics.sql` directly if writing code against it — confirmed to exist and add JSONB diff columns, but the full DDL wasn't re-read line-by-line for this doc.)

### `comments` and `reactions` (Media Library + Timeline)

Added by `010_comments_and_reactions.sql`. Polymorphic `target_type`/`target_id` pair (mirrors `audit_logs`'s pattern) rather than nullable per-type FK columns, since more target types (albums, tree members, etc.) are expected later.

```sql
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('media', 'event')),
  target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE reactions (
  id SERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('media', 'event')),
  target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_target ON comments (target_type, target_id, created_at);
CREATE INDEX idx_comments_user_id ON comments (user_id);
CREATE INDEX idx_reactions_target ON reactions (target_type, target_id);
```

No DB-level FK on `target_id` (it can point at either `media` or `events`); the `CHECK` on `target_type` keeps it closed to the two supported types.

### `family_data` (tree state — single row per tree, no history)

```sql
CREATE TABLE family_data (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL UNIQUE REFERENCES trees(id) ON DELETE CASCADE,
  json_data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Other tables (for completeness)

- `contact_submissions`, `support_tickets`, `support_messages`, `settings`
- `media`, `media_tags`, `albums`, `album_media`
- `events`, `event_participants`, `event_media`
- `media_shares`, `event_shares` (visibility/sharing ACLs, from `007_media_event_visibility.sql`)
- `tree_join_requests` (+ `message`, `type` columns added incrementally)
- `activity_log` — "Family Feed": system-generated notifications (media added, event added, member added), **not** user-authored content. See §3 (Comments Flow) for how this differs from `comments`.

Full migration file list (alphabetical = applied order): `001_init.sql`, `002_tree_join_requests.sql`, `003_tree_join_requests_message.sql`, `004_tree_join_requests_type.sql`, `005_tree_default_main_id.sql`, `006_tree_default_generation_depth.sql`, `007_media_event_visibility.sql`, `008_tree_email_auto_visibility.sql`, `009_activity_log.sql`, `010_audit_logs_forensics.sql`, `010_comments_and_reactions.sql`, `010_tree_status.sql`, `011_special_access_overrides.sql`.

> **Branch note**: `010_comments_and_reactions.sql`, `010_audit_logs_forensics.sql`, and the `comments`/`reactions` app code exist on `origin/master` / `origin/develop` but are **not yet present on `feature/ui-enhancements`** as of this writing. They will arrive on the next merge/rebase from `develop`.

---

## 3. Core Application Rules

### 3.1 Security / RBAC

There are **two parallel authorization mechanisms** in this codebase — only one is actually wired into live routes today. This is a real gap in the current implementation, not just a documentation nuance, and should be resolved (either finish wiring `checkPermission`, or delete it) rather than treated as settled architecture.

**What's actually enforced (`backend/middleware/authorizeTree.js` → `requireTreeRole(allowedRoles)`)**
Used by every live tree-scoped route (`trees.js`, `media.js`, `albums.js`, `events.js`, `activity.js`, `account.js`, `comments.js`/`reactions.js`, all mounted in `backend/app.js`):
- Looks up the caller's row in `tree_permissions` for `(userId, treeId)`.
- No row → 403. Row exists but `role` not in `allowedRoles` → 403.
- Also blocks everyone (owner included) if `trees.status = 'disabled'`.
- **Does not check `is_admin`/`admin_role`. Does not consult `special_access_overrides`.** A superadmin with no `tree_permissions` row is blocked exactly like a stranger. Admin-only surfaces (`adminTrees.js`, `adminUsers.js`, `adminSettings.js`) sidestep this entirely via separate `requireAdmin`/`requireRole` middleware on `/api/admin/*` routes, not `requireTreeRole`.

**The designed cascading model (`backend/middleware/checkPermission.js` → `checkPermission(requiredAction)`)**
This module implements the intended precedence order and is fully unit-tested (`checkPermission.test.js`), but as of this writing **is imported by nothing outside its own test file** — it is not mounted on any production route.

Designed precedence, in order:
1. **Superadmin bypass** — `req.user.adminRole === 'super_admin'` → `next()` immediately, no tree membership required.
2. **System role check (structural RBAC)** — role from `tree_permissions`: `owner`/`editor` → read+write, `viewer` → read-only.
3. **Special Access Override fallback** — only reached if step 2 didn't already grant access. Looks up `special_access_overrides` for the most specific target first (`timeline_event` before `tree`), scoped to whichever resource types are present in the URL (`:eventId`, `:treeId`/`:id`). An expired override (`expires_at` in the past) is treated as absent.
4. Otherwise → 403.

**Practical implication**: as the code stands, a superadmin or special-access grantee who is *not* also a `tree_permissions` member is currently **blocked** by every live tree-scoped route, because those routes use `requireTreeRole`, not `checkPermission`. Do not assume superadmin bypass or override fallback actually works end-to-end in production until `checkPermission` (or equivalent logic) is wired into `authorizeTree`/the live routers.

**Admin gating** (orthogonal to tree RBAC): `requireAdmin.js` checks `req.user.isAdmin`; `requireRole.js` checks `req.user.adminRole` against an allow-list (e.g. `requireRole('super_admin')`, `requireRole('super_admin', 'support_admin')`).

### 3.2 Comments Flow (Media Library + Timeline)

Comments are a real, shipped feature (as of `origin/master`) shared between the Media Library (`mediaLightbox.js`) and Timeline (`timelinePanel.js`) pages via a common component, `frontend/commentSection.js`, backed by `backend/routes/comments.js` / `backend/models/commentModel.js`.

- **Target model**: polymorphic — a comment attaches to `target_type ∈ {'media', 'event'}` + `target_id`.
- **Access control**: `commentsRouter` requires `requireTreeRole(['owner', 'editor', 'viewer'])` — any tree member can read/post. Deleting a comment is allowed for its author OR a tree `owner`/`editor` (moderation), enforced in the route handler, not the middleware.
- **Sort order — newest first.** The **frontend** sorts descending by `created_at` (`commentSection.js`, `sortedComments()`) before rendering, explicitly so a just-posted comment appears immediately below the input without scrolling.
  - ⚠️ Note: the backend SQL query (`commentModel.js`'s `getComments`) actually issues `ORDER BY c.created_at ASC` (oldest first) with a code comment claiming this "matches how comment threads read top to bottom" — this comment is stale/inaccurate relative to current behavior, since the frontend re-sorts to descending regardless of what the API returns. The effective, user-visible order is **newest first**. If touching this code, either fix the SQL comment or drop the redundant frontend sort — don't assume the SQL's stated intent reflects reality.
- **Input position — above the list.** The `<textarea>` + Post button render before the `<ul class="comment-list">` in `renderCommentSectionHtml()`, and newest-first ordering is precisely what makes "input on top, newest comment appears right below it" work without a scroll jump.
- **Reactions**: a sibling feature in the same migration — `reactions` table, one emoji per user per target (toggle, not multi-react), summarized via `reactionsApi`/`getReactionSummary`.
- Comments are capped at 2000 characters (`isNonEmptyString(body, 2000)` server-side validation, `maxlength="2000"` on the textarea).

The `activity_log` table ("Family Feed") is a **separate, unrelated** feature — auto-generated system notifications (uploads, event creation, new members), not user-authored text, no reply/thread concept, no input box. Sorted `created_at DESC` (`activityModel.js`). Don't conflate the two.

### 3.3 Data Versioning

**No persistent snapshot/version-history system exists.** `family_data` holds exactly one row per tree (`tree_id UNIQUE`), and every save is a full unconditional overwrite:

```sql
INSERT INTO family_data (tree_id, json_data, updated_at)
VALUES ($1, $2, NOW())
ON CONFLICT (tree_id) DO UPDATE SET json_data = excluded.json_data, updated_at = excluded.updated_at;
```

Every write path — plain save, CSV import, JSON import, GEDCOM import — funnels through this same `upsertFamilyData`. Prior states are discarded immediately; there is no history table, no version cap (a "10-version rolling limit" is **not implemented** anywhere in the code), no trigger, and no pruning job.

`json_data` **is** JSONB, consistent with treating the whole tree as a single document — that part of the original design intent holds.

The only "undo" capability that exists is **client-side, session-only, in-memory, and narrowly scoped**:
- `frontend/relationshipManager/undoStack.js` — undo/redo for edits made through the Relationship Manager panel only.
- `frontend/duplicateManager/undoStack.js` (+ `state.js`) — a near-identical, separately-implemented stack for the Duplicate Manager.

Both are plain `{ past: [], future: [] }` command stacks, cleared on tree switch or page reload, never persisted to the database, and explicitly documented in-code as *not* the "complete undo history" that a (nonexistent) `requirements.md` was meant to define later.

**If/when persistent versioning is built**, treat it as new work, not something to assume is half-present: it would need a new history table (e.g. `tree_snapshots` with `tree_id`, `json_data JSONB`, `created_at`, and an actual retention policy), a write path that inserts into it alongside `family_data`'s overwrite, and an explicit pruning strategy (trigger, application-level `DELETE ... WHERE rank > N`, or cron) if a rolling cap is desired.

---

## Open Items / Known Gaps

These are current, real gaps worth resolving rather than architectural facts to design around:

1. **RBAC**: `checkPermission.js` (superadmin bypass + override fallback) is fully built and tested but not wired into any live route. Either mount it in place of/alongside `requireTreeRole`, or remove it if the simpler model is intentional going forward.
2. **`feature/ui-enhancements` is behind `develop`/`master`** on the comments/reactions feature and the audit-log forensics columns — expect these to land on the next merge.
3. **Migration filename collision**: three `010_*.sql` files exist from parallel branches. Harmless today (filename-tracked, alphabetically applied), but the next new migration should renumber to `012_` to avoid confusion, not add a fourth `010_`.
4. **Stale code comment** in `commentModel.js` claiming ASC order is intentional, when the real user-facing order (DESC) is enforced client-side instead — worth fixing directly in the SQL query rather than leaving the sort to the frontend.
5. **No persistent tree version history** — only single-row overwrite + two unrelated, non-persisted client-side undo stacks. Flagged above in §3.3.
