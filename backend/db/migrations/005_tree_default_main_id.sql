-- Lets an owner pin which person the tree opens focused on (Focused mode's
-- initial main_id), instead of every viewer always landing on whoever the
-- previous viewer happened to leave focused. Not a foreign key: people are
-- entries in family_data.json_data (a JSONB blob), not rows in a SQL table
-- (see family_data's own comment in 001_init.sql), so this just stores that
-- person's string id and is validated at write time in the API layer.
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS default_main_id TEXT;
