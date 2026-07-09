-- Optional note a requester can attach when asking to join a tree (e.g. "I'm
-- your cousin on the Smith side"), shown to the owner alongside the request
-- in the Pending Requests view.
ALTER TABLE tree_join_requests ADD COLUMN IF NOT EXISTS message TEXT;
