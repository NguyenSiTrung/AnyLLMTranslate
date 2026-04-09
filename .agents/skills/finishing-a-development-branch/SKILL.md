---
name: finishing-a-development-branch
description: Structured workflow for completing a development branch -- verify, merge/PR, and clean up. Use when all tasks on a feature branch are complete.
allowed-tools: Read, Glob, Grep, Bash
---

# Finishing a Development Branch

> Source: obra/superpowers (adapted for AGKit)

## Overview

When all planned tasks on a feature branch are complete, this skill provides a structured workflow for wrapping up: verification, merge/PR decision, and cleanup.

---

## When to Use

- All tasks in the plan are marked complete
- Implementation and review are done
- Ready to integrate changes back to main

---

## The Finish Protocol

### Step 1: Final Verification

Before any merge activity, verify everything:

```
- [ ] All tests pass (full suite, not just new tests)
- [ ] Build succeeds without errors
- [ ] Linting passes
- [ ] Type checking passes (if applicable)
- [ ] No uncommitted changes remain
- [ ] All plan tasks are marked complete
```

### Step 2: Review the Diff

Examine what's actually changing:

```bash
# Compare feature branch to base
git diff main...HEAD --stat

# Review for accidental changes
git diff main...HEAD
```

Check for:
- [ ] No debug code left behind (console.log, debugger, TODO)
- [ ] No unrelated changes sneaked in
- [ ] No secrets or sensitive data
- [ ] Commit history is clean and logical

### Step 3: Present Options to User

Ask the user which completion path they prefer:

| Option | When to Use | Action |
|--------|------------|--------|
| **Merge to main** | Small team, feature is ready | `git checkout main && git merge feature/X` |
| **Create PR** | Team review needed | `gh pr create` or push and create manually |
| **Keep branch** | Not ready yet, but work is done | Leave as-is, inform user |
| **Discard** | Experiment that didn't work out | `git branch -D feature/X` |

### Step 4: Execute Chosen Path

#### If Merge:
```bash
git checkout main
git merge --no-ff feature/branch-name
# --no-ff preserves the branch history in the merge commit
```

#### If PR:
```bash
git push -u origin feature/branch-name
gh pr create --title "feat: description" --body "Summary of changes"
```

#### If Keep:
```
Inform user: "Branch feature/X is ready but not merged. 
You can merge later with: git checkout main && git merge feature/X"
```

#### If Discard:
```bash
git checkout main
git branch -D feature/branch-name
```

### Step 5: Cleanup

After merge or discard:

```bash
# Delete local feature branch (if merged)
git branch -d feature/branch-name

# Delete remote feature branch (if merged via PR)
git push origin --delete feature/branch-name

# If using worktrees, remove the worktree
git worktree remove ../project-feature-name

# Prune stale worktree references
git worktree prune
```

---

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `using-git-worktrees` | PRECEDES: Worktree was created at start |
| `subagent-driven-development` | PRECEDES: Tasks were executed via subagents |
| `verification-before-completion` | USED IN: Step 1 final verification |
| `git-master` | BACKGROUND: Commit conventions for merge commits |
| `plan-writing` | PRECEDES: Plan should be fully checked off |

---

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|-------------|-------------|
| Merging without running tests | Broken main branch |
| Force-pushing to main | Destroys shared history |
| Leaving stale branches everywhere | Confusion, disk waste |
| Merging with unresolved TODO comments | Technical debt sneaks in |
| Not reviewing the full diff | Accidental changes get merged |
| Skipping cleanup | Worktrees and branches accumulate |
