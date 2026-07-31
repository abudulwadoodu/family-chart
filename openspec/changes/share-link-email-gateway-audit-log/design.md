## Context

Public share links are handled by `backend/routes/publicTrees.js` (anonymous, no Cognito auth) and `frontend/shareLinkView.js` (a standalone page, not the authenticated dashboard). Today the only gate is an optional passcode: `trees.link_passcode_hash` being non-null implicitly means "passcode required," checked via `backend/utils/passcode.js` (scrypt + timing-safe compare), with a verified session cached client-side in `sessionStorage` keyed per share token (`sessionKeyForToken`).

This change adds a second, independent gate — email verification via OTP — and a `tree_access_log` table so owners can see (and revoke) who has viewed their tree. Both gates are owner-configurable per tree and must compose: either alone, both together (passcode first, then email), or neither.

Constraints carried over from the existing passcode design:
- `findViewableTree` in `publicTrees.js` deliberately collapses "bad token," "sharing off," and "tree disabled" into one 404 for anonymity — the new OTP endpoints must preserve this (no distinguishing errors that leak tree existence or an email's prior verification state).
- No ORM; all queries are hand-written parameterized SQL via `backend/db/index.js`'s `query()`/`withTransaction()`.
- Email sending goes through the existing SES wrapper (`backend/utils/email.js`); no new provider.

## Goals / Non-Goals

**Goals:**
- Let a tree owner require a verified email, a passcode, both, or neither, to view a public share link.
- Record every successful gated view (email-verified or passcode-then-canvas) in an auditable log the owner can review.
- Let an owner block a specific email from passing the email-verification gate again.
- Keep the anonymous surface area (OTP request/verify) resistant to enumeration and spam.

**Non-Goals:**
- Not building a general-purpose Cognito-based login for guests — verified guests remain anonymous, session-scoped identities (an email address, not an account).
- Not logging *every* HTTP hit to the public route (e.g. failed passcode/OTP attempts) into `tree_access_log` in this change — only successful, fully-gated views. Failed-attempt logging/alerting is a possible follow-up, not required here.
- Not adding email verification to tree *membership* invites (`backend/routes/trees.js` member invite flow) — this only covers the public share-link path.
- Not supporting magic-link-only delivery in this change (see Decisions below) — OTP only.

## Decisions

**1. OTP code, not magic link.**
The proposal text offered "6-digit OTP / magic link" as alternatives. Decision: implement OTP only for this change. A magic link requires the email client to open a link that lands back on `shareLinkView.js` with a token embedded in the URL, which then has to survive email-client link-scanning/prefetching (Outlook/Defender-style scanners GET links before the user clicks, which would burn single-use magic-link tokens). A 6-digit code typed back into the same tab sidesteps that entirely and mirrors the existing passcode-entry UX pattern already in `shareLinkView.js`, minimizing new frontend surface. Magic link can be a later addition if requested.

**2. Explicit boolean columns, not implicit hash-presence.**
Today `link_passcode_hash IS NOT NULL` implicitly means "passcode required." This change adds `require_passcode BOOLEAN NOT NULL DEFAULT false` and `require_email_verification BOOLEAN NOT NULL DEFAULT false` as explicit columns (see migration `016_share_link_email_gateway.sql`), rather than continuing to infer "required" from hash-presence. Rationale: an owner should be able to set a passcode, temporarily disable the requirement without discarding the passcode hash (so re-enabling doesn't require re-entering a PIN), and the two new email-verification columns have no hash-based analog to piggyback on anyway. `link_passcode_hash IS NOT NULL` is kept as the source of truth for whether a passcode *exists*; `require_passcode` gates whether it's *enforced*. The PATCH handler must reject `require_passcode = true` when `link_passcode_hash IS NULL` (no passcode set yet).

**3. Gate ordering: passcode before email, fixed.**
Per the requirements, when both are enabled the passcode gate runs first, then email verification. Implementation: `GET /:shareToken` returns both flags (`passcode_required`, `email_verification_required`) up front; the frontend gate sequencer in `shareLinkView.js` always resolves passcode first if required, then email, before requesting tree data. This keeps the passcode check (cheap, no external I/O) as a lightweight filter before the OTP flow (which sends an email and costs an SES call), reducing spam-triggered email sends from bots that don't even have the passcode.

**4. `tree_access_log` is forensic-shaped, following `createAuditLogEvent`.**
Columns: `id, tree_id, viewer_email, ip_address, share_token, user_agent, created_at`. `user_agent` is added beyond the proposal's minimum fields because it's free (already read off `req` for every other audit-style write in this codebase) and materially helps an owner distinguish real viewers from bots when reviewing history. A successful *passcode-only* view (no email verification enabled) is not logged — there's no `viewerEmail` to attribute it to, and the proposal's Access History UI is specifically an "verified emails that viewed" list, not a raw hit counter.

**5. Blocking is enforced at OTP-request time, keyed on email, not on tree membership.**
`tree_access_log` rows aren't deleted on block; instead a new `tree_blocked_viewers (tree_id, email, blocked_at, blocked_by)` table records the block. `POST /:shareToken/otp/request` checks this table (case-insensitive email match) and returns the same generic 404 used for a bad share token, rather than a distinguishing "you are blocked" message, to avoid confirming to a blocked party that their block is specifically why they're locked out (vs. e.g. a typo).

**6. Rate limiting reuses the existing pattern, with confirmed thresholds.**
`backend/routes/publicTrees.js` and `trees.js` already sit behind whatever global rate-limit middleware the app uses (confirm exact middleware name during implementation — grep `express-rate-limit` usage). Confirmed limits:
- OTP request: 3 requests per `(shareToken, email)` per 15 minutes.
- OTP verify: 5 failed attempts per issued code (the code is invalidated after the 5th failure, forcing a fresh request).
- IP-level backstop: 20 requests per IP per hour across `otp/request` + `otp/verify` combined, to blunt a single source rotating emails.

## Risks / Trade-offs

- **[Risk] OTP emails land in spam or are delayed** → guest can't access the tree in a reasonable time. Mitigation: use a distinct, recognizable sender/subject via the existing SES sender pattern (`joinRequestEmail.js`-style), and show a "resend code" option with a short cooldown rather than a silent failure.
- **[Risk] Email-enumeration via the OTP-request endpoint** (an attacker learns whether an email has previously viewed/been blocked from a tree) → Mitigation: always return the same generic success response from `POST /:shareToken/otp/request` regardless of block status or prior history; only the OTP-verify step can fail distinguishably (wrong/expired code), which leaks nothing about the email itself.
- **[Risk] Existing share links break for real users if email verification defaults to required** → see Open Questions; recommend defaulting new column to `false` (opt-in) so existing links keep working exactly as before until an owner explicitly turns the gate on.
- **[Risk] `sessionStorage`-only verified state means a guest must re-verify every new tab/session** → acceptable trade-off, consistent with the existing passcode UX, and avoids issuing any longer-lived guest credential/cookie that would need its own revocation story.
- **[Trade-off] No magic-link option in v1** → slightly less convenient for guests than "click one link," but avoids the link-scanner false-verification problem noted in Decision 1.

## Migration Plan

1. Ship migration `016_share_link_email_gateway.sql`: adds `trees.require_email_verification`, `trees.require_passcode` (both `BOOLEAN NOT NULL DEFAULT false`); creates `tree_access_log` and `tree_blocked_viewers` tables with FKs to `trees(id)`. The migration also backfills `require_passcode = true` for every tree that already has `link_passcode_hash` set — decision 2's default-`false` column would otherwise silently unprotect every existing passcode-locked share link the moment it ships, which contradicts "every existing share link keeps working exactly as before" below.
2. Backfill: none needed — new boolean columns default `false`, so every existing share link keeps its current (passcode-only-if-set) behavior with zero owner action required.
3. Deploy backend (OTP endpoints, updated `GET/PATCH /:shareToken` and `/:id/share-link` contracts) before frontend, since the frontend gate sequencer depends on the new response flags being present; the old frontend build only ever branched on `passcode_required`, so it will safely ignore the new `email_verification_required` field until redeployed (non-breaking intermediate state).
4. Deploy frontend (`shareLinkView.js` two-gate sequencer, `components.js` toggle + Access History tab).
5. Rollback: the new columns/tables are additive; reverting the frontend/backend deploy is safe without a down-migration since no existing code path reads `require_email_verification`/`require_passcode`/`tree_access_log` until this change's own code is live.

## Open Questions

All open questions below were resolved with the user on 2026-07-31; resolutions are final for this change.

1. **Default value for `require_email_verification`.** ~~Original requirement text said "default: true."~~ **Resolved: defaults to `false`** (opt-in per tree, owner must explicitly enable it), overriding the originally stated default to avoid silently gating every existing share link.
2. **OTP TTL and code length.** **Resolved: 6 digits, 10-minute expiry, single active code per `(shareToken, email)` pair** (requesting a new code invalidates the previous one), as originally proposed.
3. **Rate limit thresholds.** **Resolved:** 3 OTP requests per email per 15 minutes; 5 failed verification attempts per issued code; 20 requests per IP per hour (see Decision 6).
4. **Does "Block" un-verify a currently-active session?** **Resolved: no — "blocks future access" is sufficient for v1.** Blocking only prevents *future* OTP verification; a guest mid-session (already holding a verified `sessionStorage` entry) keeps canvas access until that tab/session ends. Client-side `sessionStorage` remains the verified-session mechanism (no move to server-side sessions).
5. **Retention of `tree_access_log`.** **Resolved: kept indefinitely**, consistent with the existing `audit_logs` table — no purge/expiry job in this change.
