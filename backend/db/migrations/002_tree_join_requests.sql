ALTER TABLE trees ADD COLUMN IF NOT EXISTS is_discoverable BOOLEAN NOT NULL DEFAULT true;

-- Self-service join requests, distinct from tree_permissions (the actual
-- membership table): a row here only records that a user *asked* for access
-- and what the owner decided, so approving one is "read this row, then also
-- insert into tree_permissions" rather than tree_permissions gaining a
-- pending state of its own.
CREATE TABLE IF NOT EXISTS tree_join_requests (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  role_requested TEXT NOT NULL CHECK (role_requested IN ('viewer', 'editor')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One active request per (tree, sender): re-requesting after a rejection
-- just flips the same row back to pending rather than accumulating history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tree_join_requests_tree_sender ON tree_join_requests(tree_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_tree_join_requests_status ON tree_join_requests(status);
CREATE INDEX IF NOT EXISTS idx_trees_is_discoverable ON trees(is_discoverable);
