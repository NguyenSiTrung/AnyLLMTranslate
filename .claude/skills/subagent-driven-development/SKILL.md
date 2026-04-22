---
name: subagent-driven-development
description: Dispatches fresh subagent per task with two-stage review and context isolation. Use when implementing multi-task plans where each task benefits from a clean agent context.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Subagent-Driven Development

> Source: obra/superpowers (adapted for AGKit)

## Overview

Subagent-driven development dispatches a **fresh subagent per task** with a two-stage review process. The controller agent coordinates, never implements. Each subagent gets exactly the context it needs -- nothing more.

---

## Core Principle: Context Isolation

**Subagents NEVER inherit the parent session's context or history.**

The dispatcher constructs exactly what each subagent needs:
- The spec/plan for this specific task
- The relevant code files
- The review criteria

This prevents:
- Reviewers acting as if they were the developer
- Subagents inheriting the dispatcher's tone and reasoning
- Context window pollution from prior conversation
- Reviewers rejecting code for unstated preferences

---

## When to Use

| Scenario | Use This Skill |
|----------|---------------|
| Implementing a plan with 3+ tasks | Yes |
| Tasks are independent enough for fresh context | Yes |
| Need high-quality review on each task | Yes |
| Single quick fix | No -- just do it directly |
| Exploratory/uncertain work | No -- use brainstorming first |

---

## The Dispatch Loop

```
For each task in plan:

  1. DISPATCH: Launch subagent with isolated context
     - Task description (from plan)
     - Relevant file paths and patterns
     - Success criteria
     - MUST DO / MUST NOT DO constraints

  2. REVIEW STAGE 1: Spec Compliance
     - Does the implementation match the plan?
     - Are all acceptance criteria met?
     - Were MUST NOT DO constraints respected?
     → If fail: Resume subagent with specific feedback

  3. REVIEW STAGE 2: Code Quality
     - Does it follow existing codebase patterns?
     - Are tests included (if TDD is active)?
     - Is there unnecessary complexity?
     - Are there security concerns?
     → If fail: Resume subagent with specific feedback

  4. COMMIT: If both reviews pass
     - Commit with descriptive message
     - Update plan progress
     - Move to next task
```

---

## Dispatch Prompt Template

When launching a subagent, construct this prompt from scratch:

```
TASK: [Specific task from plan]

CONTEXT:
- Project: [Brief project description]
- Relevant files: [List exact paths]
- Existing patterns: [Key patterns to follow]
- Tech stack: [Relevant technologies]

REQUIREMENTS:
- [Acceptance criterion 1]
- [Acceptance criterion 2]

MUST DO:
- Follow existing code style in [reference file]
- Write tests for new functionality
- Handle error cases

MUST NOT DO:
- Modify files outside task scope
- Add new dependencies without justification
- Change existing test behavior
- Over-engineer beyond requirements

VERIFICATION:
- [How to verify this task is complete]
```

---

## Two-Stage Review Protocol

### Stage 1: Spec Compliance Review

Ask these questions about the subagent's output:

| Check | Question |
|-------|----------|
| Completeness | Does it implement ALL requirements from the task? |
| Scope | Did it stay within the task boundaries? |
| Constraints | Were MUST NOT DO items respected? |
| Acceptance | Do all acceptance criteria pass? |

**Verdict:** PASS (proceed to Stage 2) or FAIL (resume with feedback)

### Stage 2: Code Quality Review

| Check | Question |
|-------|----------|
| Patterns | Does it match existing codebase conventions? |
| Tests | Are tests present and meaningful? |
| Complexity | Is the solution appropriately simple? |
| Security | Any exposed secrets, injection risks, or unsafe operations? |
| Performance | Any obvious N+1, unbounded loops, or memory leaks? |

**Verdict:** PASS (commit) or FAIL (resume with feedback)

---

## Failure Recovery

| Failure Count | Action |
|---------------|--------|
| 1st failure | Resume subagent with specific feedback |
| 2nd failure | Add more context, broaden approach |
| 3rd failure | Stop. Re-evaluate the task breakdown. Task may need splitting or the plan may need revision. |

---

## Controller Responsibilities

The controller (you, the orchestrator) does NOT implement. It:

1. **Reads the plan** and identifies the next task
2. **Constructs the dispatch prompt** with fresh context
3. **Reviews subagent output** in two stages
4. **Provides feedback** if review fails
5. **Commits and advances** when review passes
6. **Tracks progress** across all tasks

---

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `plan-writing` | REQUIRED BEFORE: Must have a plan to execute |
| `tdd-workflow` | COMPLEMENTARY: Include TDD requirements in dispatch |
| `code-review-checklist` | USED IN: Stage 2 review criteria |
| `verification-before-completion` | REQUIRED AFTER: Verify before declaring done |
| `using-git-worktrees` | COMPLEMENTARY: Each subagent works in isolated worktree |
| `delegation-patterns` | BACKGROUND: Follows delegation prompt structure |

---

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|-------------|-------------|
| Forwarding full session history to subagent | Subagent inherits biases and reasoning |
| Skipping Stage 1 review | Implementation may not match spec |
| Controller implementing tasks itself | Defeats the purpose; context gets polluted |
| Dispatching vague tasks | Subagent guesses; quality drops |
| Not tracking progress | Lose track of what's done vs pending |
| Continuing after 3 failures without re-evaluating | Indicates a plan problem, not an execution problem |
