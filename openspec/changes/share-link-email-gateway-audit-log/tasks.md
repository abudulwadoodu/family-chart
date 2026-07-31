## 1. Schema and migration

- [x] 1.1 Add `backend/db/migrations/016_share_link_email_gateway.sql`: `trees.require_email_verification BOOLEAN NOT NULL DEFAULT false`, `trees.require_passcode BOOLEAN NOT NULL DEFAULT false`
- [x] 1.2 In the same migration, create `tree_access_log` (`id`, `tree_id` FK, `viewer_email`, `ip_address`, `share_token`, `user_agent`, `created_at`) with an index on `(tree_id, created_at)`
- [x] 1.3 In the same migration, create `tree_blocked_viewers` (`id`, `tree_id` FK, `email`, `blocked_at`, `blocked_by` FK to users) with a unique index on `(tree_id, lower(email))`
- [x] 1.4 Create `otp_codes` (`id`, `share_token`, `email`, `code_hash`, `expires_at`, `consumed_at`, `created_at`) with an index on `(share_token, lower(email))`, for storing hashed OTP codes (mirrors `link_passcode_hash` hashing, never stores the raw code)

## 2. Backend: OTP + email utilities

- [x] 2.1 Add `backend/utils/otp.js`: generate 6-digit code, hash it (reuse the scrypt approach from `backend/utils/passcode.js`), verify via timing-safe compare
- [x] 2.2 Add `backend/utils/shareVerificationEmail.js`: SES sender for the OTP email, following the pattern in `backend/utils/joinRequestEmail.js`
- [ ] 2.3 Add rate limiting on OTP request/verify (reuse existing rate-limit middleware pattern from `backend/routes/`): 3 requests per `(shareToken, email)` per 15 minutes on `otp/request`; invalidate a code after 5 failed `otp/verify` attempts; 20 requests per IP per hour across both endpoints combined

## 3. Backend: access log + blocklist model

- [x] 3.1 Add `backend/models/treeAccessLogModel.js`: `createAccessLogEntry`, `listAccessLogForTree` (distinct viewer emails, most-recent-first), following the forensic style of `createAuditLogEvent` in `backend/models/auditLogModel.js`
- [x] 3.2 Add `backend/models/treeBlockedViewersModel.js`: `blockViewer`, `unblockViewer`, `isViewerBlocked`

## 4. Backend: public gateway routes

- [x] 4.1 Update `GET /:shareToken` in `backend/routes/publicTrees.js` to return `passcode_required` and `email_verification_required` flags (both computed from the tree's `require_passcode`/`require_email_verification` columns), preserving the existing 404-collapsing behavior in `findViewableTree` for bad/disabled/off links
- [x] 4.2 Add `POST /:shareToken/otp/request` — generates and emails a code, invalidates any prior unconsumed code for the same `(shareToken, email)`, returns a generic success response regardless of block status or prior history (per spec `tree-access-audit-log` blocking requirement)
- [x] 4.3 Add `POST /:shareToken/otp/verify` — validates code + expiry, on success writes a `tree_access_log` row (tree, email, IP, share token, user agent) and returns tree data; on failure returns a generic invalid-code error
- [x] 4.4 Enforce gate ordering: if `require_passcode` is true, `POST /:shareToken/verify` (passcode) must succeed before `otp/request`/`otp/verify` are honored for that guest session — reject OTP calls with the same generic error used for a missing passcode session if the passcode gate hasn't been satisfied first
- [x] 4.5 Enforce blocklist check in `otp/request` and `otp/verify` (`tree_blocked_viewers`), returning the same generic responses as the unblocked path (spec: "Blocking does not reveal block status to the blocked guest")

## 5. Backend: owner-facing routes

- [x] 5.1 Update `PATCH /:id/share-link` in `backend/routes/trees.js` to accept `requireEmailVerification` and `requirePasscode`, rejecting `requirePasscode = true` when no `link_passcode_hash` is set (design.md decision 2)
- [x] 5.2 Add `GET /:id/access-log` (owner-only, `requireTreeRole(['owner'])`) returning distinct verified viewer emails + most-recent view timestamp for the tree
- [x] 5.3 Add `POST /:id/access-log/block` and `POST /:id/access-log/unblock` (owner-only), taking an email, writing/removing a `tree_blocked_viewers` row

## 6. Frontend: Share Modal settings

- [x] 6.1 In `frontend/components.js`, extend `renderShareLinkSection` with a "Require Email Verification to View" toggle alongside the existing passcode toggle, wired to `PATCH /:id/share-link`
- [x] 6.2 Passcode toggle already only renders/enforces via the existing single-checkbox flow (set passcode = required, clear passcode = not required) - no separate hide/hint state was needed since the UI never exposes `requirePasscode` independently of having a passcode (see design.md decision 2 discussion)
- [x] 6.3 Add an "Access History" tab to `renderShareModalBody`, listing viewer emails + last-viewed timestamp from `GET /:id/access-log`, with a Block/Unblock action per row calling 5.3's endpoints

## 7. Frontend: public gateway UI

- [x] 7.1 In `frontend/shareLinkView.js`, add a gate sequencer that reads `passcode_required`/`email_verification_required` from the initial `GET /:shareToken` response and resolves passcode first, then email verification, per design.md decision 3
- [x] 7.2 Add an OTP-entry gate (email input → request code → 6-digit code input → verify), modeled on the existing `renderPasscodeGate`/`attachPasscodeFormListener`/`verifyAndLoad` structure
- [x] 7.3 Add a "resend code" action with a short client-side cooldown
- [x] 7.4 Cache the verified-email state in `sessionStorage` per share token (new key alongside the existing passcode session key), cleared on tab/session end

## 8. Tests

- [x] 8.1 Backend: OTP request/verify success, expiry, wrong-code, resend-invalidates-previous-code, rate-limit thresholds (`backend/routes/shareLink.emailGateway.test.js`)
- [x] 8.2 Backend: gate ordering (email-verification rejected until passcode satisfied when both enabled)
- [x] 8.3 Backend: access log written only on successful email verification, not on passcode-only views
- [x] 8.4 Backend: block/unblock — blocked email gets generic (non-distinguishing) response from `otp/request` and cannot complete `otp/verify`
- [x] 8.5 Backend: owner-only access on `GET /:id/access-log` and block/unblock endpoints (non-owner rejected)
- [ ] 8.6 Frontend: gate sequencer renders passcode-only, email-only, both-in-order, and neither cases correctly — **blocked**: this repo's `vitest.config.js` runs frontend tests under `environment: 'node'` with no DOM (no jsdom/testing-library dependency); every existing `frontend/*.test.js` file tests pure logic modules, none render `shareLinkView.js`/`components.js` DOM output. Writing this test requires first adding a jsdom test environment as new project infra - flagged for the user rather than done silently.
- [ ] 8.7 Frontend: Access History tab renders list and Block/Unblock round-trips against the API — same blocker as 8.6

## 9. Open questions (resolved 2026-07-31, see design.md)

- [x] 9.1 Default value for `require_email_verification`: `false` (opt-in)
- [x] 9.2 OTP TTL: 6 digits, 10-minute expiry, single active code
- [x] 9.3 "Block" blocks future access only; verified-session state stays client-side `sessionStorage`
- [x] 9.4 `tree_access_log` retained indefinitely, consistent with `audit_logs`
