---
name: git-master
description: Git workflow expert with 3 specializations — Commit Architect (atomic commits), Rebase Surgeon (history rewriting), and History Archaeologist (blame/investigation). Automatically detects commit conventions.
---

# Git Master — Expert Git Workflow Skill

> Three specializations for mastering git workflows. Teaches principles, not scripts.

---

## 🏗️ Commit Architect — Atomic Commits

### Core Principle: Multiple Commits by Default

Changes should be split into logical, atomic commits:

| Files Changed | Minimum Commits |
|---|---|
| 3+ files | 2+ commits |
| 5+ files | 3+ commits |
| 10+ files | 5+ commits |

### Automatic Style Detection

Before creating ANY commit:

1. **Analyze the last 30 commits** in the repository
2. **Detect patterns**:
   - Language (English, Korean, Japanese, etc.)
   - Style (semantic/conventional, plain, short)
   - Scope format (parentheses, brackets, none)
   - Body structure (bullet points, prose, none)
3. **Match the repo's conventions** automatically

### Commit Splitting Strategy

```
ASK: "What changed?" → Group by logical unit

✅ GOOD:
  Commit 1: "feat(auth): add JWT token refresh"
  Commit 2: "test(auth): add token refresh tests"
  Commit 3: "docs(auth): update API documentation"

❌ BAD:
  Commit 1: "add auth stuff and tests and docs"
```

### Rules

- Each commit should compile and pass tests independently
- Separate concerns: feature, test, docs, config, deps
- Never mix refactoring with feature changes
- Never mix formatting with logic changes
- Commit message matches detected repo style

---

## 🔧 Rebase Surgeon — History Rewriting

### When to Rebase

- **Interactive rebase**: Clean up messy commit history before merge
- **Squash**: Combine WIP commits into logical units
- **Reorder**: Arrange commits in dependency order
- **Fixup**: Fold fix commits into their parents

### Rebase Strategies

#### Strategy 1: Squash-and-Split
```
20 messy commits → Interactive rebase → 3-5 clean logical commits
```

#### Strategy 2: Branch Cleanup
```
Feature branch with merge commits → Rebase onto main → Linear history
```

#### Strategy 3: Conflict Resolution Protocol
1. Identify the conflict source (which commit, which file)
2. Determine the "intended" state from both sides
3. Resolve minimally — don't refactor during conflict resolution
4. Verify build/tests pass after each resolved commit
5. Continue rebase

### Safety Rules

- **NEVER rebase shared/published branches** without team agreement
- Always create a backup branch before destructive operations
- Verify with `git log --oneline` after rebase
- Run tests on the final result

---

## 🔍 History Archaeologist — Investigation

### Finding When/Where Changes Were Introduced

#### "When was X added?"
```bash
git log --all --oneline -- path/to/file
git log -p --follow -- path/to/file  # with renames
git log --all -S "search_string"     # pickaxe search
```

#### "Who wrote this code?"
```bash
git blame path/to/file
git blame -L 10,30 path/to/file     # specific lines
git blame --follow path/to/file     # across renames
```

#### "Why was this changed?"
```bash
git log --oneline -n 20 -- path/to/file
git log --format="%h %s" --follow -- path/to/file
# Then check the commit messages and PR references
```

#### "What changed between versions?"
```bash
git diff v1.0..v2.0 -- path/to/file
git log --oneline v1.0..v2.0 -- path/to/file
```

### Investigation Protocol

1. **Start broad**: `git log --oneline` to understand the timeline
2. **Narrow down**: `git log -S "keyword"` to find specific changes
3. **Deep dive**: `git blame` + `git show <commit>` for context
4. **Cross-reference**: Check commit messages for issue/PR references
5. **Report**: File path, commit hash, author, date, and context

---

## Decision Matrix

| Situation | Specialization | Key Action |
|---|---|---|
| "Commit these changes" | Commit Architect | Detect style → split → commit |
| "Clean up my commits" | Rebase Surgeon | Interactive rebase → squash/reorder |
| "Rebase onto main" | Rebase Surgeon | Rebase → resolve conflicts → verify |
| "Who wrote this?" | History Archaeologist | Blame → log → report |
| "When was X added?" | History Archaeologist | Pickaxe search → log → report |
| "Why was this changed?" | History Archaeologist | Log → show → cross-reference |

---

## Anti-Patterns

❌ One massive commit for 20 file changes
❌ Commit messages that say "fix" or "update" with no context
❌ Rebasing shared branches without communication
❌ Mixing feature code with formatting changes in one commit
❌ Force-pushing to main/master
❌ Skipping build/test verification after rebase
