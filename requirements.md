Implement a scalable **Admin Panel** for my Family Tree application. The implementation should be modular, secure, and easy to extend as new administrative features are added.

## Objective

Create a complete administration area that is accessible only to authorized administrators. The architecture should support future expansion without major refactoring.

## General Requirements

* Only administrators can access the admin area.
* Non-admin users should receive an appropriate Unauthorized (403) or Not Found (404) response.
* Follow the existing project structure and coding conventions.
* Keep business logic separated from UI components.
* Design reusable tables, filters, dialogs, and forms.
* Ensure responsive layouts.
* Support both Light and Dark themes.
* Include loading, empty, error, and success states.
* Use pagination for large datasets.
* Implement searching, filtering, and sorting wherever appropriate.

---

# Admin Dashboard

Create an overview dashboard displaying cards for:

* Total Users
* Active Users (Today)
* Active Users (Last 30 Days)
* Total Family Trees
* Total Family Members
* New Registrations
* Open Support Tickets
* Closed Support Tickets
* Storage Usage
* Recent Activity

Use placeholder data if backend APIs are not yet available.

---

# User Management

Implement a User Management module.

Features:

* Search users
* Filter users
* Sort users
* View user profile
* View account details
* View registration date
* View last login
* View email verification status
* View owned family trees
* View storage usage
* Suspend account
* Activate account
* Delete account (with confirmation)
* Send password reset email (placeholder if backend unavailable)

Display appropriate confirmation dialogs before destructive actions.

---

# Support Tickets

Implement a ticket management system.

Features:

* List tickets
* Search tickets
* Filter by:

  * Status
  * Priority
  * Category
* Sort tickets
* View ticket details
* View conversation history
* Change status
* Assign administrator
* Add internal notes
* Close/Reopen ticket

Design the UI so attachments can be added later without redesign.

---

# Family Tree Management

Implement a read-only management module.

Features:

* Search family trees
* View owner
* View collaborators
* Number of members
* Last updated
* Creation date
* Storage used
* Open tree in read-only mode

Do not allow administrators to modify tree data from this module.

---

# Analytics

Create placeholder analytics pages.

Include:

* User registrations
* Active users
* Trees created
* Members added
* Photos uploaded
* Support ticket trends

Design charts/components so real backend data can be connected later.

---

# Settings

Create a system settings page.

Include placeholders for:

* Registration enabled
* Maintenance mode
* Maximum upload size
* Allowed image formats
* Session timeout
* Password policy
* Default privacy settings
* Feature flags
* AI features

Use reusable setting components.

---

# Audit Logs

Create an audit log module.

Track future administrative actions such as:

* User suspended
* User activated
* User deleted
* Ticket updated
* Settings changed

Display:

* Date
* Administrator
* Action
* Target
* Details

Backend integration can be added later.

---

# Navigation

Create an admin sidebar with:

* Dashboard
* Users
* Support Tickets
* Family Trees
* Analytics
* Settings
* Audit Logs

Highlight the current page.

Support collapsing the sidebar.

---

# Permissions

Design the permission system for future expansion.

Initially support:

* Super Admin
* Support Admin

Use route guards and permission checks so additional roles can be added later with minimal changes.

---

# Reusable Components

Create reusable components for:

* Data Table
* Search Bar
* Filter Panel
* Status Badge
* Confirmation Dialog
* Pagination
* Empty State
* Loading Indicator
* Error State
* Statistics Card

Avoid duplicate implementations.

---

# Code Quality

* Keep components small and reusable.
* Separate API calls from UI.
* Use constants/enums instead of hardcoded values.
* Document important modules.
* Avoid tight coupling between modules.
* Make future backend integration straightforward.

---

# Future-Proofing

Structure the project so these modules can be added later without refactoring:

* Content Moderation
* Media Management
* Broadcast Notifications
* Email Templates
* Role & Permission Management
* Security Monitoring
* Developer Tools
* Background Jobs
* AI Administration
* Subscription/Billing Management (future)

---

# Deliverables

1. Implement the complete admin panel UI.
2. Create placeholder services/mock data where backend APIs are unavailable.
3. Explain the folder structure.
4. Explain how new admin modules can be added.
5. Identify any areas where backend APIs will eventually be required.
6. Ensure the implementation remains maintainable, modular, and production-ready.
