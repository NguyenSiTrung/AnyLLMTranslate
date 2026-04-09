---
name: using-git-worktrees
description: Isolated git worktree workspaces for feature development. Use after design approval, before implementation begins.
allowed-tools: Read, Glob, Grep, Bash
---

# Using Git Worktrees

> Source: obra/superpowers (adapted for AGKit)

## Overview

Git worktrees let you have multiple working directories attached to the same repository. Each worktree has its own branch, its own working files, and its own index -- but they share the same `.git` data.

This means you can work on a feature in isolation without touching the main branch's working directory.

---

## When to Use

| Scenario | Use Worktrees |
|----------|--------------|
| Starting a new feature after design approval | Yes |
| Working on multiple features simultaneously | Yes |
| Need clean baseline for testing | Yes |
| Quick one-file fix | No -- just use a branch |
| Exploratory work | No -- use a temporary branch |

---

## Worktree Setup Flow

```
1. VERIFY clean state on main/default branch
   → git status (should be clean)
   → git pull (get latest)

2. CREATE worktree with feature branch
   → git worktree add ../project-feature-name -b feature/feature-name

3. ENTER the worktree
   → cd ../project-feature-name

4. INSTALL dependencies (if needed)
   → npm install / pip install / etc.

5. VERIFY clean baseline
   → Run tests to confirm starting from green
   → Build to confirm it compiles

6. BEGIN implementation
```

---

## Naming Convention

```
Worktree directory: ../{project-name}-{feature-slug}
Branch name:        feature/{feature-slug}

Example:
  Repository:  ~/projects/my-app
  Worktree:    ~/projects/my-app-add-auth
  Branch:      feature/add-auth
```

---

## Key Commands

```bash
# Create worktree with new branch
git worktree add ../project-feature -b feature/feature-name

# Create worktree from existing branch
git worktree add ../project-feature feature/existing-branch

# List all worktrees
git worktree list

# Remove a worktree (after merging)
git worktree remove ../project-feature

# Prune stale worktree references
git worktree prune
```

---

## Rules

1. **Always verify tests pass** in the new worktree before starting work
2. **Never modify the same branch** from two worktrees simultaneously
3. **Install dependencies** in each worktree (node_modules is per-directory)
4. **Clean up worktrees** after branches are merged
5. **Don't create worktrees inside the repo** -- use sibling directories

---

## Worktree Lifecycle

```
Create → Setup → Implement → Test → Review → Merge/PR → Cleanup

                                                    ↓
                                          git worktree remove
```

---

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `brainstorming` | PRECEDES: Design must be approved before worktree creation |
| `plan-writing` | PRECEDES: Plan should exist before implementation |
| `subagent-driven-development` | COMPLEMENTARY: Subagents work within the worktree |
| `finishing-a-development-branch` | FOLLOWS: Handles merge/PR/cleanup after work is done |
| `git-master` | BACKGROUND: Commit conventions still apply in worktrees |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "fatal: is already checked out" | Branch is in use by another worktree. Use a different branch name. |
| Tests fail in worktree | Run `npm install` / dependency install. Worktrees don't share node_modules. |
| Worktree directory already exists | Remove it first or choose a different name. |
| Stale worktree after deleting directory | Run `git worktree prune` |

---

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|-------------|-------------|
| Creating worktree without pulling latest | Start from stale code |
| Skipping dependency install | Cryptic build/test failures |
| Not running tests before starting | Can't distinguish pre-existing failures from your changes |
| Leaving worktrees around forever | Disk waste, confusion |
| Working on main directly for features | No isolation, risky for main branch |
