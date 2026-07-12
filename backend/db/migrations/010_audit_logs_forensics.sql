-- Extends the existing audit_logs table (001_init.sql) with the columns
-- needed for structural/role/override auditing rather than standing up a
-- second parallel audit system:
--   - actor_id: nullable alias-by-convention for admin_id. System-automated
--     rows (e.g. scheduled jobs, cascades) have no admin, so admin_id is
--     relaxed from NOT NULL here; new code should populate both admin_id
--     and actor_id with the same value until callers migrate off admin_id.
--   - old_values/new_values: JSONB before/after snapshots for delta-style
--     changes (role updates, override grants/revokes). Kept separate from
--     the existing free-form `details` column instead of replacing it, so
--     existing rows/readers (auditLogModel.js, adminAuditLogs UI) are
--     unaffected.
--   - ip_address/user_agent: request metadata for security review, captured
--     best-effort from the Express req (see services/auditLog.js).
-- action_type/target_type/target_id from the spec already exist under the
-- names action/target_type/target_id - not duplicated here.
ALTER TABLE audit_logs
  ALTER COLUMN admin_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS ip_address INET,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Backfill actor_id for pre-existing rows so historical queries by actor_id
-- don't silently miss data written before this migration.
UPDATE audit_logs SET actor_id = admin_id WHERE actor_id IS NULL AND admin_id IS NOT NULL;

-- B-tree for "history of this exact resource" (e.g. one tree's or one
-- user's timeline) and for "everything actor X did" - the two hot lookup
-- patterns for this table. idx_audit_logs_admin_id (001_init.sql) already
-- covers the legacy admin_id column and is left in place.
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- GIN indexes for ad-hoc containment queries against the delta snapshots,
-- e.g. "find every override grant that touched member X"
-- (new_values @> '{"memberId": "X"}').
CREATE INDEX IF NOT EXISTS idx_audit_logs_old_values ON audit_logs USING GIN (old_values);
CREATE INDEX IF NOT EXISTS idx_audit_logs_new_values ON audit_logs USING GIN (new_values);
