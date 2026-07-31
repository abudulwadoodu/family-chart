## ADDED Requirements

### Requirement: Successful email-verified views are logged
Every successful email-verification event that grants access to a shared tree SHALL create a `tree_access_log` entry recording the tree, the verified viewer email, the requesting IP address, the share token used, and a timestamp.

#### Scenario: Guest completes email verification
- **WHEN** a guest successfully verifies their email via OTP for a share token belonging to a tree
- **THEN** a `tree_access_log` row is created with `tree_id`, `viewer_email`, `ip_address`, `share_token`, and `created_at` populated

#### Scenario: Passcode-only view is not logged
- **WHEN** a guest views a tree whose share link requires only a passcode (no email verification enabled)
- **THEN** no `tree_access_log` entry is created, since there is no verified viewer email to attribute the view to

### Requirement: Owner can view access history for their tree
The tree owner SHALL be able to view a list of verified viewer emails and their most recent view timestamp for their tree, via an "Access History" tab in the Share/Data settings modal.

#### Scenario: Owner opens Access History tab
- **WHEN** the tree owner opens the "Access History" tab in the Share/Data settings modal for a tree that has logged views
- **THEN** the system displays each distinct verified viewer email along with their most recent view timestamp, ordered most-recent-first

#### Scenario: Non-owner cannot view access history
- **WHEN** a user who is not the tree's owner requests the access log for that tree
- **THEN** the system denies the request

### Requirement: Owner can block a viewer email from future access
The tree owner SHALL be able to block a specific email address from completing email verification for their tree's share link.

#### Scenario: Owner blocks an email
- **WHEN** the tree owner selects "Block" for a viewer email in the Access History tab
- **THEN** the system records that email as blocked for the tree, and future OTP-request attempts for that email against that tree's share link return the same generic response as an unblocked request without sending a code or granting access

#### Scenario: Owner revokes a block
- **WHEN** the tree owner un-blocks a previously blocked email
- **THEN** that email can once again successfully request and verify an OTP code for the tree's share link

#### Scenario: Blocking does not reveal block status to the blocked guest
- **WHEN** a blocked email attempts to request a new OTP code
- **THEN** the response is indistinguishable from a normal successful request, so the guest cannot determine from the response alone that they have been blocked
