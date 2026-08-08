-- Optional free-text description a user can attach when saving a tree
-- snapshot to their private vault, alongside the existing archive_name.
ALTER TABLE user_account_archives ADD COLUMN IF NOT EXISTS description TEXT;
