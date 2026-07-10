-- Visibility permissions for media and events, layered on top of the
-- existing tree-level role check (requireTreeRole). 'tree' (default) means
-- every collaborator with any tree_permissions row can see it, matching
-- today's behavior exactly for all pre-existing rows. 'private' means only
-- the uploader/creator can see it by default, narrowed open to specific
-- collaborators via the *_shares tables below; the tree owner gets a
-- reduced "stub" view of private-and-shared items (enforced in the API
-- layer, not here), but never sees private-with-zero-shares ("only me")
-- items at all. There is no explicit "specific people" enum value:
-- visibility has exactly two states (tree | private), and whether a
-- private item has any *_shares rows is what distinguishes "only me" (zero
-- rows) from "shared with specific people" (one or more).
ALTER TABLE media
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'tree'
    CHECK (visibility IN ('tree', 'private'));

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'tree'
    CHECK (visibility IN ('tree', 'private'));

-- Specific-collaborator-account grants on a 'private' media item. Keyed on
-- user_id (a real users.id / tree_permissions account), NOT member_id --
-- unlike media_tags, which tags a person-node in the family_data JSONB
-- blob. "Share with specific people" in this feature means specific login
-- accounts, not person-nodes: there is no linkage table between the two
-- (see family_data's own comment in 001_init.sql), so this is the only
-- identity space that can actually be enforced against tree_permissions at
-- request time.
CREATE TABLE IF NOT EXISTS media_shares (
  id SERIAL PRIMARY KEY,
  media_id INTEGER NOT NULL,
  tree_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (media_id, user_id),
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Same shape as media_shares, for events.
CREATE TABLE IF NOT EXISTS event_shares (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  tree_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_visibility ON media(tree_id, visibility);
CREATE INDEX IF NOT EXISTS idx_events_visibility ON events(tree_id, visibility);
CREATE INDEX IF NOT EXISTS idx_media_shares_media_id ON media_shares(media_id);
CREATE INDEX IF NOT EXISTS idx_media_shares_user_id ON media_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_event_shares_event_id ON event_shares(event_id);
CREATE INDEX IF NOT EXISTS idx_event_shares_user_id ON event_shares(user_id);
