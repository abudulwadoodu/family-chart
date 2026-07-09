-- Distinguishes a first-time "let me join this tree" request from an
-- existing member asking to be upgraded/downgraded to a different role.
-- Both share the same approve/reject lifecycle and the same table (a role
-- change is structurally identical: sender_id + role_requested + status),
-- so a type flag is cheaper than a parallel table and keeps one unique
-- index enforcing "one active request per (tree, sender)" either way.
ALTER TABLE tree_join_requests
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'join' CHECK (request_type IN ('join', 'role_change'));
