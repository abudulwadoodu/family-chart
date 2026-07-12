-- Private vault snapshots: an instant point-in-time copy of a tree's
-- family_data JSONB graph, scoped to the tree's owner only (mirrors
-- getTreesOwnedByUser's ownership semantics used elsewhere for account-level
-- actions). Snapshotting is intentionally restricted to owned trees - a
-- collaborator with editor/viewer access to someone else's tree must not be
-- able to clone that owner's data into their own permanent archive.
CREATE TABLE IF NOT EXISTS user_account_archives (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  tree_id INTEGER,
  archive_name TEXT NOT NULL,
  family_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE SET NULL
);

-- The Vault drawer lists a user's own snapshots ordered by recency; this is
-- the hot path for that list.
CREATE INDEX IF NOT EXISTS idx_user_account_archives_user_id
  ON user_account_archives (user_id, created_at DESC);
