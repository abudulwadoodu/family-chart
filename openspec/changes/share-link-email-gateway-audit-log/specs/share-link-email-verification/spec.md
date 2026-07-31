## ADDED Requirements

### Requirement: Owner can toggle email verification on a share link
The tree owner SHALL be able to enable or disable "Require Email Verification to View" for a tree's public share link, independently of the passcode setting, via the Share Modal's Link Settings.

#### Scenario: Owner enables email verification
- **WHEN** the owner toggles "Require Email Verification to View" on and saves Link Settings
- **THEN** the tree's `require_email_verification` flag is set to true and subsequent public share-link views require a verified email

#### Scenario: Owner disables email verification
- **WHEN** the owner toggles "Require Email Verification to View" off and saves Link Settings
- **THEN** the tree's `require_email_verification` flag is set to false and subsequent public share-link views no longer require email verification

### Requirement: Guest must verify email via OTP before viewing a gated tree
When a tree's `require_email_verification` flag is true, the public share-link endpoint SHALL require the guest to submit an email address and a valid one-time code sent to that address before returning tree data.

#### Scenario: Guest requests a code
- **WHEN** a guest submits an email address to `POST /:shareToken/otp/request` for a tree with `require_email_verification = true`
- **THEN** the system generates a 6-digit one-time code, stores it hashed with an expiry, emails it to the submitted address via the existing SES sender, and returns a generic success response regardless of whether the email was previously seen or blocked

#### Scenario: Guest submits a valid, unexpired code
- **WHEN** a guest submits the correct 6-digit code for their email to `POST /:shareToken/otp/verify` before it expires
- **THEN** the system marks the email as verified for that share token in the guest's session, records a `tree_access_log` entry, and returns the tree data

#### Scenario: Guest submits an expired or incorrect code
- **WHEN** a guest submits a code that does not match the most recently issued code, or submits it after expiry
- **THEN** the system rejects the attempt with a generic invalid-code error and does not grant access

#### Scenario: Requesting a new code invalidates the previous one
- **WHEN** a guest requests a second code for the same email and share token before verifying the first
- **THEN** the previously issued code becomes invalid and only the newest code can succeed

### Requirement: Combined passcode and email verification run in a fixed order
When a tree has both `require_passcode` and `require_email_verification` set to true, the public share-link flow SHALL require the passcode gate to be satisfied before the email-verification gate is presented.

#### Scenario: Both gates enabled
- **WHEN** a guest opens a share link for a tree with both `require_passcode` and `require_email_verification` true
- **THEN** the guest must submit the correct passcode first, and only after that succeeds is the guest presented with the email verification step; the tree canvas is not returned until both gates succeed

#### Scenario: Only one gate enabled
- **WHEN** a guest opens a share link for a tree with exactly one of `require_passcode` or `require_email_verification` set to true
- **THEN** the guest is presented with only that corresponding gate before the tree canvas loads

### Requirement: Verified email session does not persist beyond the browser session
A guest's verified-email state for a given share token SHALL be stored client-side only for the duration of the browser session (not a durable cookie or account), consistent with the existing passcode session behavior.

#### Scenario: Guest closes and reopens the tab
- **WHEN** a guest who previously verified their email for a share link closes the browser tab and opens the same link in a new session
- **THEN** the guest must verify again (submit email and OTP) before viewing the tree

### Requirement: OTP endpoints are rate-limited
The OTP request and verify endpoints SHALL be rate-limited per share token and per submitted email to prevent abuse (email bombing, brute-force code guessing).

#### Scenario: Excessive OTP requests for one email
- **WHEN** the number of OTP requests for a given `(shareToken, email)` pair exceeds the configured threshold within the configured window
- **THEN** further requests are rejected with a rate-limit response until the window resets

#### Scenario: Excessive OTP verify attempts
- **WHEN** the number of failed verify attempts for a given `(shareToken, email)` pair exceeds the configured threshold
- **THEN** further verify attempts are rejected until the window resets, independent of whether the code itself is correct
