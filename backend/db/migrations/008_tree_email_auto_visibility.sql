-- Owner-configurable auto-grant: when enabled, any login account whose users.email
-- matches (case-insensitively, trimmed) a person-node's data.email in this tree's
-- family_data is automatically upserted into tree_permissions as 'viewer' - no join
-- request/approval needed. Matching is read-time only (see emailMatchModel.js); there
-- is still no linkage table between person-nodes and login accounts (same invariant
-- noted in 007_media_event_visibility.sql's media_shares comment). Evaluated once per
-- login session from POST /api/auth/discovery-check, not on every request.
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS email_auto_visibility BOOLEAN NOT NULL DEFAULT false;
