CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  cognito_sub TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  admin_role TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS trees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tree_permissions (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tree_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_data (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL UNIQUE,
  json_data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  attachment_filename TEXT,
  attachment_mimetype TEXT,
  attachment_size INTEGER,
  attachment_data BYTEA,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED')),
  assigned_to INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('USER', 'ADMIN')),
  sender_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  attachment_filename TEXT,
  attachment_mimetype TEXT,
  attachment_size INTEGER,
  attachment_data BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Media: photos, videos, and documents share one polymorphic table (`kind`
-- discriminates them) so albums/tags/events/timeline all join against a
-- single media_id regardless of media type, and adding a new kind later is
-- an enum value rather than a new table + new join tables.
CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'document')),
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  page_count INTEGER,
  title TEXT,
  description TEXT,
  taken_at TIMESTAMPTZ,
  uploaded_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Person tags on media. `member_id` is a Datum.id from that tree's
-- family_data.json_data blob, not a SQL row -- people aren't normalized into
-- their own table (see memberModel.js), so tags are keyed the same way
-- memberModel already addresses a person: (tree_id, member_id). AI-suggested
-- tags live in the same table as manual ones (source='ai', with a confidence
-- score and a confirmed_at/confirmed_by review step) rather than a parallel
-- schema, so AI tagging is additive columns, not a new feature surface.
CREATE TABLE IF NOT EXISTS media_tags (
  id SERIAL PRIMARY KEY,
  media_id INTEGER NOT NULL,
  tree_id INTEGER NOT NULL,
  member_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  confidence REAL,
  confirmed_at TIMESTAMPTZ,
  confirmed_by INTEGER,
  box_x REAL,
  box_y REAL,
  box_w REAL,
  box_h REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS albums (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cover_media_id INTEGER,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS album_media (
  album_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (album_id, media_id),
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

-- Events double as the anchor for the timeline view (a read query ordering
-- events by event_date, optionally joined with media.taken_at) rather than
-- the timeline being its own table.
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  event_type TEXT,
  description TEXT,
  event_date TEXT,
  date_precision TEXT NOT NULL DEFAULT 'day' CHECK (date_precision IN ('day', 'month', 'year', 'approximate')),
  location TEXT,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_participants (
  event_id INTEGER NOT NULL,
  tree_id INTEGER NOT NULL,
  member_id TEXT NOT NULL,
  role TEXT,
  PRIMARY KEY (event_id, tree_id, member_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_media (
  event_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  PRIMARY KEY (event_id, media_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trees_owner_id ON trees(owner_id);
CREATE INDEX IF NOT EXISTS idx_tree_permissions_tree_id ON tree_permissions(tree_id);
CREATE INDEX IF NOT EXISTS idx_tree_permissions_user_id ON tree_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_user_id ON contact_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);

CREATE INDEX IF NOT EXISTS idx_media_tree_id ON media(tree_id);
CREATE INDEX IF NOT EXISTS idx_media_kind ON media(kind);
CREATE INDEX IF NOT EXISTS idx_media_taken_at ON media(taken_at);
CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id);
CREATE INDEX IF NOT EXISTS idx_media_tags_tree_member ON media_tags(tree_id, member_id);
CREATE INDEX IF NOT EXISTS idx_albums_tree_id ON albums(tree_id);
CREATE INDEX IF NOT EXISTS idx_album_media_media_id ON album_media(media_id);
CREATE INDEX IF NOT EXISTS idx_events_tree_id ON events(tree_id);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_event_participants_tree_member ON event_participants(tree_id, member_id);
CREATE INDEX IF NOT EXISTS idx_event_media_media_id ON event_media(media_id);
