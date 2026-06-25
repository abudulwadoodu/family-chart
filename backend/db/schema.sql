PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  cognito_sub TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS trees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tree_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tree_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, tree_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL UNIQUE,
  json_data TEXT NOT NULL,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trees_owner_id ON trees(owner_id);
CREATE INDEX IF NOT EXISTS idx_tree_memberships_tree_id ON tree_memberships(tree_id);
CREATE INDEX IF NOT EXISTS idx_tree_memberships_user_id ON tree_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub);
