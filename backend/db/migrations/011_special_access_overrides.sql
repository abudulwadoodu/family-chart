-- Object-level permission overrides layered on top of tree_permissions' structural
-- roles (owner/editor/viewer). Lets an admin grant a specific user read/write access
-- to a single resource (a whole tree, or something narrower like one timeline_event)
-- without changing their structural role or exposing the rest of the tree.
CREATE TABLE IF NOT EXISTS special_access_overrides (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('tree', 'timeline_event')),
  target_id INTEGER NOT NULL,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('read_only', 'read_write')),
  granted_by INTEGER NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE
);

-- checkPermission's override fallback looks up by (user_id, target_type, target_id)
-- on every request that fails the structural RBAC check, so this is the hot path.
CREATE INDEX IF NOT EXISTS idx_special_access_overrides_lookup
  ON special_access_overrides (user_id, target_type, target_id);

-- Lets an expiry sweep/cron find live overrides without a full table scan.
CREATE INDEX IF NOT EXISTS idx_special_access_overrides_expires_at
  ON special_access_overrides (expires_at)
  WHERE expires_at IS NOT NULL;
