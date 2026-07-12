-- Adds display fields to users (comments need a name/photo to render
-- against, and users had neither), plus comments + reactions tables shared
-- by Media and Timeline pages. target_type/target_id is a polymorphic pair
-- (mirrors audit_logs) rather than two nullable FK columns like
-- activity_log's related_media_id/related_event_id, since new target types
-- (albums, tree members, etc.) are expected here and per-type columns would
-- mean a migration for each. No DB-level FK on target_id since it can point
-- at either media or events; the CHECK constraint keeps target_type closed
-- to the two types the API currently supports.
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('media', 'event')),
  target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reactions (
  id SERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('media', 'event')),
  target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
