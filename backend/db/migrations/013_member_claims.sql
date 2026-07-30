-- Links a login account to the specific person-node (Datum.id) that
-- represents them inside a tree. Previously there was no such link at all -
-- see emailMatchModel.js and 008_tree_email_auto_visibility.sql's comment
-- ("no linkage table between person-nodes and login accounts"). Additive
-- only: existing tree_permissions rows default to claim_status='unclaimed',
-- member_id=NULL, which is behaviorally identical to today (tree access
-- without an identity claim).
ALTER TABLE tree_permissions
  ADD COLUMN IF NOT EXISTS member_id TEXT,
  ADD COLUMN IF NOT EXISTS claim_status TEXT NOT NULL DEFAULT 'unclaimed'
    CHECK (claim_status IN ('unclaimed', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS claim_source TEXT
    CHECK (claim_source IN ('self_serve', 'owner_assigned')),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- No FK on member_id: same convention as media_tags/event_participants -
-- person nodes are Datum.id values inside family_data.json_data, not SQL
-- rows (see memberModel.js).

-- At most one APPROVED claim per node per tree (two users can't both "be"
-- the same person)...
CREATE UNIQUE INDEX IF NOT EXISTS uq_tree_permissions_approved_member
  ON tree_permissions (tree_id, member_id)
  WHERE claim_status = 'approved' AND member_id IS NOT NULL;

-- ...and at most one APPROVED claim per user per tree (one identity per
-- tree - proxy/managed profiles are a different, not-yet-built concept, not
-- a second claim by the same account).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tree_permissions_approved_user
  ON tree_permissions (tree_id, user_id)
  WHERE claim_status = 'approved' AND member_id IS NOT NULL;

-- A claim under review is a distinct lifecycle object from the access grant
-- it may eventually produce - kept separate from tree_permissions (rather
-- than overloading its 'pending' state) so competing claimants on the same
-- node can be compared side by side, and a rejected claim leaves an audit
-- trail without ever having held a granted role. Mirrors how
-- tree_join_requests already exists independently of tree_permissions.
CREATE TABLE IF NOT EXISTS member_claims (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  member_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  source TEXT NOT NULL DEFAULT 'self_serve' CHECK (source IN ('self_serve', 'owner_assigned')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by INTEGER,
  decided_at TIMESTAMPTZ,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_member_claims_tree_member ON member_claims (tree_id, member_id);
CREATE INDEX IF NOT EXISTS idx_member_claims_user ON member_claims (user_id);
CREATE INDEX IF NOT EXISTS idx_member_claims_tree_status ON member_claims (tree_id, status);
