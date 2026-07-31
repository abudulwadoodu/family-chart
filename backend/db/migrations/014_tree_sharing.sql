-- Shareable link system: an unguessable per-tree token plus an on/off switch
-- for anonymous read-only access. share_token starts NULL for every existing
-- tree (same "lazily set" pattern as default_main_id in 005) - it's only
-- generated the first time an owner turns link_access on or resets the link
-- (see backend/utils/shareToken.js). link_access defaults to 'restricted' so
-- no tree is unexpectedly link-shareable after this migration runs.
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS link_access TEXT NOT NULL DEFAULT 'restricted' CHECK (link_access IN ('restricted', 'view'));

CREATE INDEX IF NOT EXISTS idx_trees_share_token ON trees(share_token);
