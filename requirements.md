Implement Google Social Login while preserving the existing Email + Password authentication and optional TOTP MFA functionality.

This is an enhancement to the existing authentication system. Do not replace or remove any current authentication features.

## Objectives

Support the following authentication methods:

1. Email + Password
2. Google Social Login

If TOTP MFA is enabled for the user, require TOTP verification regardless of the primary authentication method.

---

## Existing Functionality

The application currently supports:

* Email/password registration
* Email/password login
* Password reset
* Email verification
* Optional TOTP MFA
* Cognito authentication
* JWT/session management

All of the above must continue to work without regression.

---

## Authentication Flow

### Email + Password

1. User enters email and password.
2. Authenticate with Cognito.
3. If MFA is enabled:

   * Prompt for TOTP code.
4. Login successful.

### Google Login

1. User clicks "Continue with Google".
2. Authenticate using Google through AWS Cognito.
3. If MFA is enabled:

   * Prompt for TOTP code.
4. Login successful.

The post-login experience should be identical regardless of the authentication provider.

---

## AWS Cognito

Configure Google as a federated identity provider in Cognito.

Use the existing Cognito User Pool and App Client.

Do not create a new User Pool.

Reuse existing authentication infrastructure wherever possible.

---

## Frontend

Update the login page.

Example layout:

Continue with Google

---------------- OR ----------------

Email

Password

[ Login ]

Forgot Password?

Do not remove the existing login form.

The Google login button should follow Google's branding guidelines.

Show loading indicators and friendly error messages.

---

## Registration

Keep the existing email/password signup flow.

Do not replace signup with Google.

Google users should be able to sign in without manually registering first.

---

## Account Linking

Prevent duplicate accounts.

If a user already exists with the same verified email address:

* Link the Google identity to the existing application user.
* Do not create duplicate user records.
* Preserve:

  * Family trees
  * Permissions
  * Profile
  * Settings
  * MFA configuration

Similarly, if a Google user later creates an email/password login using the same email, associate it with the same application account.

---

## MFA

Existing TOTP functionality must remain unchanged.

Authentication flow:

Email + Password
→ Authenticate
→ If MFA enabled
→ Verify TOTP
→ Login

Google
→ Authenticate
→ If MFA enabled
→ Verify TOTP
→ Login

Do not bypass MFA for Google users.

---

## User Model

Ensure the application can support multiple authentication providers for the same user.

Track authentication provider(s) appropriately without duplicating users.

Examples:

* EMAIL
* GOOGLE

A user may have both providers linked.

---

## Backend

Update authentication services to support Google identities.

Reuse existing session and JWT generation logic.

Avoid duplicating authentication code.

Maintain clean architecture and separation of concerns.

---

## Security

Validate Google ID tokens through Cognito.

Never trust client-side identity information.

Continue enforcing:

* JWT validation
* Authorization middleware
* Existing permission checks

---

## UI Improvements

Update the login page with:

* Continue with Google button
* Existing email/password form
* Existing Forgot Password link

Maintain the application's current design language.

---

## Testing

Verify the following scenarios:

* Existing email/password login
* Existing password reset
* Existing MFA flow
* Google login for a new user
* Google login for an existing user
* Account linking
* Google login with MFA enabled
* Email/password login with MFA enabled
* Invalid Google authentication
* Logout
* Session persistence
* Refresh token flow

Ensure no regressions to the current authentication system.

---

## Deliverables

Implement a production-ready Google Social Login solution integrated with the existing Cognito authentication system while preserving all current authentication functionality.

The final authentication system should support:

* Email + Password
* Google Login
* Optional TOTP MFA
* Account linking
* Existing Cognito infrastructure
* Existing user accounts
* Existing authorization model
* Existing UI styling and architecture



### Account Linking (Critical Requirement)

The application must treat all authentication methods belonging to the same verified email address as a single application user.

#### Scenario 1 - Existing Password User

* User signs up using Email + Password with `john@example.com`.
* Later, the user clicks "Continue with Google".
* Google returns the same verified email address: `john@example.com`.

Expected behavior:

* Do NOT create a new user.
* Link the Google identity to the existing account.
* The user should continue to see:

  * The same family trees
  * The same profile
  * The same permissions
  * The same settings
  * The same MFA configuration

#### Scenario 2 - Existing Google User

* User first signs in using Google.
* An application user is created.
* Later, the user registers or logs in using Email + Password with the same verified email address.

Expected behavior:

* Do NOT create another user.
* Link the Email + Password credentials to the existing account.
* Both authentication methods should log the user into the same application account.

#### General Rules

* One verified email address should correspond to exactly one application user.
* A user may have multiple authentication providers linked to the same account.
* Authentication providers should never create duplicate application users.
* Existing family trees, permissions, settings, and MFA configuration must remain associated with the single application user regardless of the authentication method used.
* If account linking cannot be performed safely, fail gracefully and provide a clear error message instead of creating duplicate accounts.
* Reuse AWS Cognito's account-linking capabilities where appropriate rather than implementing duplicate user management logic.



Before implementing account linking, review AWS Cognito best practices for linking federated identities (Google) with existing native Cognito users. Prefer Cognito's native identity-linking capabilities over custom database logic wherever possible.