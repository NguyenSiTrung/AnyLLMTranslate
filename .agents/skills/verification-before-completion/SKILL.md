---
name: verification-before-completion
description: Evidence-based verification before declaring any task complete. Use before claiming a bug is fixed, a feature works, or a task is done.
allowed-tools: Read, Glob, Grep, Bash
---

# Verification Before Completion

> Source: obra/superpowers (adapted for AGKit)

## Core Principle

**Never declare success without evidence. "It should work" is not verification.**

Before saying ANY task is complete, you must have concrete proof it works.

---

## When This Skill Activates

- After implementing a fix
- After completing a feature
- After any code change that should produce observable results
- Before responding "done" to the user

---

## Verification Checklist

### 1. Did You Actually Test It?

| Check | Required Evidence |
|-------|-------------------|
| Code compiles/builds | Exit code 0 from build command |
| Tests pass | Test runner output showing green |
| Feature works | Observable behavior matches expectation |
| Bug is fixed | Reproduction steps no longer trigger the bug |

### 2. Did You Test the Right Thing?

| Check | Question |
|-------|----------|
| Correct scope | Are you testing the change you made, not something else? |
| Correct environment | Are you testing where the bug was reported? |
| Correct input | Are you using the same data/conditions? |

### 3. Did You Check for Regressions?

| Check | Action |
|-------|--------|
| Related tests | Run the full test suite, not just new tests |
| Nearby functionality | Manually verify related features still work |
| Edge cases | Test boundary conditions |

---

## Evidence Requirements by Change Type

| Change Type | Minimum Evidence |
|-------------|-----------------|
| Bug fix | Reproduction steps now produce correct behavior |
| New feature | Feature works end-to-end with expected output |
| Refactoring | All existing tests still pass, behavior unchanged |
| Config change | Application starts and runs correctly |
| Dependency update | Build succeeds, tests pass, no new warnings |
| CSS/styling | Visual verification (or snapshot test) |
| API change | Request/response matches specification |

---

## The Verification Protocol

```
1. IDENTIFY what "done" means for this task
   → What observable behavior proves it works?

2. EXECUTE the verification
   → Run the actual command, test, or check

3. OBSERVE the result
   → Read the output. Don't assume.

4. COMPARE against expectation
   → Does observed match expected? Exactly?

5. REPORT honestly
   → If it doesn't match, it's not done.
```

---

## Common Verification Commands

```bash
# Build verification
npm run build          # Exit code 0?
npm run typecheck      # No type errors?

# Test verification
npm test               # All passing?
npm run test:e2e       # E2E passing?

# Lint verification
npm run lint           # No errors?

# Runtime verification
npm run dev            # Starts without errors?
curl localhost:3000/api/health  # Returns 200?
```

---

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|-------------|-------------|
| "I changed the code so it should work now" | No evidence. Changed code can still be wrong. |
| Running only the new test | Regressions in existing tests missed |
| Testing in wrong environment | Bug may be environment-specific |
| Assuming build success without checking | Build errors can be silent |
| Declaring done after writing code but before running it | Code that hasn't run is unverified code |
| "Tests passed" without showing which tests | May have run zero tests |

---

## Integration

| Skill | Relationship |
|-------|-------------|
| `tdd-workflow` | Tests provide verification evidence |
| `systematic-debugging` | Phase 4 (Fix & Verify) uses this skill |
| `subagent-driven-development` | Both review stages require evidence |
| `lint-and-validate` | Provides automated verification tooling |
