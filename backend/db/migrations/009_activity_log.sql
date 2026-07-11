-- Per-tree "Family Feed" activity log, powering the slide-out activity
-- panel. Discrete, insert-only rows for media uploads, event creation, and
-- newly-added members (see backend/services/activity.js). Birthdays are NOT
-- stored here - computed on read from family_data (see activityModel.js's
-- listActivityForTree), since a birthday has no natural single "created_at"
-- moment and recurs annually rather than happening once.
--
-- No visibility column: visibility is derived at read time by joining back
-- to media/events (via related_media_id/related_event_id) and reusing their
-- existing mediaAccessCaseSql/eventAccessCaseSql three-tier access logic
-- (see 007_media_event_visibility.sql) - a private-and-shared photo's
-- activity row shouldn't be visible to tree members it wasn't shared with.
-- Rows with neither FK set (member_added) have no private resource to leak
-- and are always visible to any tree_permissions holder.
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('media_added', 'event_added', 'member_added')),
  actor_id INTEGER NOT NULL,
  member_id TEXT,
  related_media_id INTEGER,
  related_event_id INTEGER,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (related_media_id) REFERENCES media(id) ON DELETE CASCADE,
  FOREIGN KEY (related_event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_log_tree_id_created_at ON activity_log(tree_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_related_media_id ON activity_log(related_media_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_related_event_id ON activity_log(related_event_id);
