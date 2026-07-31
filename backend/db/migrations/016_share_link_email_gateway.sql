-- Email-verification gateway for share links, plus an explicit "is this gate
-- enforced" boolean pair (see design.md decision 2): link_passcode_hash being
-- non-null has meant "passcode required" since migration 015, but that
-- conflates "a passcode exists" with "the passcode is currently enforced" -
-- an owner should be able to keep a saved passcode around while toggling
-- enforcement off/on. require_email_verification has no such hash to key
-- off, so it needs an explicit column regardless. Both default to false so
-- every existing share link keeps working exactly as it does today - no
-- existing guest is locked out by this migration.
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS require_email_verification BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_passcode BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every tree that already had a passcode hash under the old
-- "hash presence means required" convention keeps behaving exactly as
-- before - without this, every existing passcode-protected link would
-- silently become unprotected the moment this migration runs.
UPDATE trees SET require_passcode = true WHERE link_passcode_hash IS NOT NULL;

-- One row per successful *email-verified* view (never for passcode-only
-- views - there's no viewer email to attribute those to). Kept indefinitely,
-- consistent with audit_logs; see design.md's Migration Plan / Open
-- Questions for that call.
CREATE TABLE IF NOT EXISTS tree_access_log (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  viewer_email TEXT NOT NULL,
  ip_address TEXT,
  share_token TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tree_access_log_tree_created ON tree_access_log(tree_id, created_at);

-- Owner-managed blocklist: an email in here can no longer complete OTP
-- verification for this tree's share link. Not a delete-from-access-log
-- action - blocking is forward-looking only (see design.md decision 5 /
-- open question 4).
CREATE TABLE IF NOT EXISTS tree_blocked_viewers (
  id SERIAL PRIMARY KEY,
  tree_id INTEGER NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tree_blocked_viewers_tree_email ON tree_blocked_viewers(tree_id, lower(email));

-- Hashed one-time codes (never the raw code - see backend/utils/otp.js,
-- same salted-scrypt approach as link_passcode_hash). consumed_at is set on
-- first successful verification and then left in place (not cleared) so the
-- same code can be resubmitted to resume a browser session without a fresh
-- email round-trip, per design.md decision 3's "sessionStorage-only, resend
-- rather than re-verify" behavior mirroring the existing passcode gate.
-- failed_attempts enforces the 5-attempts-per-code cap from design.md
-- decision 6.
CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  share_token TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_token_email ON otp_codes(share_token, lower(email));
