-- Optional passcode for the "Anyone with the link can View" share link.
-- Stores only a salted hash (see backend/utils/passcode.js), never the plain
-- value - same reasoning as share_token being unguessable, but here the
-- owner picks the secret so it must not be recoverable from the DB either.
-- NULL means "no passcode set", the existing behavior for every tree created
-- before this migration.
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS link_passcode_hash TEXT;
