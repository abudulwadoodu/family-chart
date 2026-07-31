## Why

Public share links currently support only an optional passcode gate (`link_passcode_hash`, added in `015_share_link_passcode.sql`) and are otherwise anonymous and unlogged — a tree owner has no way to know who viewed a shared tree, nor to require a verified identity before granting access. Family trees often contain sensitive personal data (living relatives' names, birthdates, contact info), so owners need a stronger, auditable gate: require a verified email before a guest can view the canvas, and keep a record of who viewed what and when so access can be reviewed and revoked.

## What Changes

- Add an email-verification gateway for public share links: a guest opens a share link, and if the tree owner has enabled "Require Email Verification to View," the guest must submit their email and enter a 6-digit OTP sent to it before the canvas loads.
- Add a `TreeAccessLog` table recording every successful gated view (tree, verified viewer email, IP address, share token, timestamp).
- Add an "Access History" tab to the owner's Share/Data settings modal listing verified viewers of a tree, with a per-email **Block** action that prevents that email from completing verification (or opening the tree, if passcode-only) on future attempts.
- Make link security **BREAKING** in one respect: the public gateway route contract changes from a single passcode-only gate to a two-gate sequence (`passcode_required` and/or `email_verification_required` flags), so any external caller of `GET /:shareToken` that only handled `passcode_required` needs updating. **BREAKING**: `GET /:shareToken` response shape adds `email_verification_required` and, when a passcode is also required, the two gates must now be satisfied in a fixed order (passcode, then email) rather than a single step.
- Extend the Share Modal's existing Link Settings UI with a "Require Email Verification to View" toggle alongside the existing passcode toggle, so owners can independently enable email verification, passcode, both, or neither.
- Add rate limiting on OTP request/verify endpoints to prevent enumeration/abuse of the new anonymous email-input surface.

## Capabilities

### New Capabilities
- `share-link-email-verification`: The OTP-based email verification gateway for public share links — requesting a code, verifying it, session persistence for a verified guest, and the owner-configurable toggle that turns the gate on or off per tree.
- `tree-access-audit-log`: Recording and surfacing successful gated views of a shared tree (`TreeAccessLog`), including the owner-facing Access History UI and the ability to block a previously-verified email from further access.

### Modified Capabilities
(none — no `openspec/specs/` capabilities exist yet for this project; the pre-existing passcode gate is being extended in code but has no prior spec-tracked capability to modify. The passcode gate's sequencing behavior when combined with email verification is captured as a requirement of the new `share-link-email-verification` capability instead.)

## Impact

- **Code**:
  - Backend: `backend/db/migrations/016_*.sql` (new columns + `tree_access_log` table), `backend/routes/publicTrees.js` (two-gate sequencing, OTP request/verify endpoints), `backend/routes/trees.js` (Share Modal settings PATCH gains `requireEmailVerification`; new `GET /:id/access-log` and `POST /:id/access-log/block` owner-only endpoints), new `backend/utils/otp.js` (code generation/hashing, mirroring `backend/utils/passcode.js`), new `backend/utils/shareVerificationEmail.js` (SES sender, mirroring `backend/utils/joinRequestEmail.js`), new `backend/models/treeAccessLogModel.js` (forensic-style, mirroring `createAuditLogEvent` in `backend/models/auditLogModel.js`).
  - Frontend: `frontend/components.js` (`renderShareLinkSection` / `renderShareModalBody` gain the email-verification toggle and a new "Access History" tab), `frontend/shareLinkView.js` (new OTP-entry gate rendered after/instead of the passcode gate, per the enabled combination; verified-email session cached in `sessionStorage` alongside the existing passcode session key).
- **Dependencies**: none new — reuses the existing `@aws-sdk/client-ses` client already wired in `backend/utils/email.js`.
- **Data**: existing share links default to no email verification required (owners opt in explicitly) so no existing guest access is disrupted; see design.md for the discussion of defaults.
- **Security**: introduces a new anonymous, unauthenticated input surface (email + OTP) on `backend/routes/publicTrees.js`, which needs rate limiting and generic error responses to avoid becoming an email-enumeration or spam vector.
