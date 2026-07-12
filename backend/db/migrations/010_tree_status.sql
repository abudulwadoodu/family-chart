-- Mirrors users.status ('active'/'suspended') so a disabled tree follows the
-- same vocabulary and enforcement shape as a suspended user (see
-- middleware/auth.js's requireAuth check) rather than introducing a
-- differently-named isActive/archived flag for the same concept.
ALTER TABLE trees ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'));
