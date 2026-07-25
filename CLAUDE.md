# Project Workflow Rules

## Sync with `develop` before starting work

Before starting any new task on any branch in this repository, bring the branch up to date with the latest `develop` first:

1. `git fetch origin develop`
2. `git merge origin/develop` (or `git rebase origin/develop`, matching whatever this branch has used so far)
3. Resolve any conflicts before writing new code.

This applies to every branch and worktree in this project — `master`, `develop`, `feature/feature-enhancements`, `feature/ui-enhancements`, and any future feature branches. Do not begin implementation work on a branch that hasn't pulled in the latest `develop`.

Exception: if already on `develop`, just `git pull origin develop` to update it directly.
