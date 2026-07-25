# Roadmap To-Do

Status legend: `[x]` done · `[/]` in progress / partial · `[ ]` not started

_Last reviewed: 2026-07-12 — verified against `origin/master`, which is ahead of the
`feature/feature-enhancements` worktree these items were originally requested from._

---

## 1. Core Canvas & Layout

- [x] Top-aligned comment block layout with descending stream ordering
  - Shared `frontend/commentSection.js` feeds both Media Library and Timeline via `renderCommentSectionHtml`.
  - Newest-first (descending) ordering implemented in `sortedComments()`; the comment form renders above the list.
  - Comment cards are top-aligned (`align-items: flex-start` in `frontend/styles.css`), each a self-contained card with the delete icon pinned to its own top-right corner.
  - Backend: `backend/db/migrations/010_comments_and_reactions.sql`, `backend/models/commentModel.js`, `backend/models/reactionModel.js`, `backend/routes/comments.js`.
- [x] Per-field context edit pencils matching both media and timeline views
  - `frontend/timelinePanel.js` was refactored into per-field edit forms (title, date, location, description, visibility), each with its own pencil — explicitly written to mirror `mediaLightbox.js`'s pattern (shared `lightbox-edit-form` / `lightbox-description-row` CSS classes, confirmed by in-code comments referencing the media pattern directly).

## 2. Access Control & Administration

- [x] Superadmin Tree Detail Overrides management card UI widget (Option 1)
  - `renderAccessOverridesSection` in `frontend/admin/trees/components.js` renders an "Access overrides" card: grant form (email, `read_only`/`read_write` permission, optional expiry) plus a list of existing overrides with per-row Revoke buttons.
  - Backend: `POST`/`DELETE` on `/:id/access-overrides` in `backend/routes/adminTrees.js` (super_admin only), backed by `backend/db/migrations/011_special_access_overrides.sql` and `backend/models/specialAccessModel.js`.
  - **Note:** tree *content* remains explicitly read-only in the admin panel by design ("Tree contents are read-only in the admin panel"). This feature governs *access/status*, not tree data edits — worth confirming that matches the original intent of "Option 1" before closing it out.
- [x] Global tree disable functionality with backend status middleware
  - `trees.status` column added via `backend/db/migrations/010_tree_status.sql`, constrained to `active` / `disabled`.
  - Enforced in `backend/middleware/authorizeTree.js` (`requireTreeRole`): a disabled tree returns 403 for every role, owner included; admin routes bypass this middleware so support/super admins can still manage it.
  - Admin toggle: `PATCH /:id/status` in `backend/routes/adminTrees.js`, logging `TREE_SUSPENDED`/`TREE_ACTIVATED` audit events.
  - **Correction:** the disabled-state literal is `disabled`, not `disabled_by_admin` — that exact string does not appear anywhere in the codebase. If `disabled_by_admin` was a hard naming requirement, this needs a follow-up rename; otherwise treat this item as complete under the `active`/`disabled` vocabulary (mirrors `users.status`'s `active`/`suspended` pattern).

## 3. Auditing & Governance

- [x] Audit Log table engine (end-to-end)
  - Shared `renderDataTable` engine (`frontend/admin/shared/components.js`) powers `frontend/admin/auditLogs/components.js`.
  - `audit_logs` table (from initial schema) extended non-destructively by `backend/db/migrations/010_audit_logs_forensics.sql` with `actor_id`, `old_values`/`new_values` (JSONB, GIN-indexed), `ip_address`, `user_agent`.
  - Write paths across admin user, support, settings, and tree routes; read via `backend/routes/adminAuditLogs.js`.
- [x] Expandable UI Log Row details diff container (Option 1)
  - `renderForensicDetail` in `frontend/admin/auditLogs/components.js` renders a `.admin-audit-diff` grid (key / before / arrow / after) per changed field, with struck-through "before" values.
  - Row click toggles `expandedLogId` state (`frontend/admin/auditLogs/logic.js`), rendering the diff inline under the clicked row (`.admin-audit-expanded`).
  - Falls back to raw `details` JSON for legacy rows predating the forensics migration.

---

## Summary

| Module | Done | In Progress | Not Started |
|---|---|---|---|
| Core Canvas & Layout | 2 | 0 | 0 |
| Access Control & Administration | 2 | 0 | 0 |
| Auditing & Governance | 2 | 0 | 0 |

**All six items are implemented on `master`.** This worktree (`feature/feature-enhancements`) is behind master and does not yet contain this work locally — merging/rebasing onto master will bring it in.

**Two things worth a quick confirmation with the team, not re-implementation:**
1. Does "Superadmin Overrides — Option 1" require tree *content* to become editable, or is access/status management (what's actually built) the intended scope?
2. Is `disabled_by_admin` a required literal (e.g. for an external integration or spec), or is `active`/`disabled` (what's actually built) acceptable?
