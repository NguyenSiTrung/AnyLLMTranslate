---
name: delegation-patterns
description: Use when delegating tasks to specialized agents or coordinating multi-agent work. Essential for orchestrator and planner agents.
---

# Delegation Patterns — Agent Orchestration Protocol

> How to delegate work effectively to specialized agents. Teaches the protocol, not the implementation.

---

## Core Principle: DELEGATE BY DEFAULT

Default bias: **DELEGATE**. Work yourself ONLY when it is super simple.

Before acting on ANY task, run this check:

1. Is there a specialized agent that perfectly matches this request?
2. If not, what category best describes this task?
3. Can I do it myself for the best result, FOR SURE? Really?

---

## Context Isolation Principle (CRITICAL)

**Subagents MUST NEVER inherit the parent session's context or history.**

When delegating, the dispatcher constructs exactly what each subagent needs from scratch:
- The task specification
- The relevant code/files
- The review criteria
- Nothing else

### Why This Matters

Without context isolation, subagents:
- Inherit the dispatcher's internal reasoning and tone
- Act as the lead developer rather than an independent reviewer
- Reject reasonable code for matching unstated preferences
- Demand rewrites beyond scope
- Treat advisory feedback as blocking

### How to Apply

1. **Never forward session history** to a subagent
2. **Construct the prompt from scratch** with only what's needed
3. **Include the spec, the code, and the criteria** -- not your thought process
4. **Keep reviewers focused on the work product**, not the process that produced it

---

## Delegation Prompt Structure (MANDATORY — ALL 6 sections)

When delegating, your prompt MUST include:

```
1. TASK: Atomic, specific goal (one action per delegation)
2. EXPECTED OUTCOME: Concrete deliverables with success criteria
3. REQUIRED TOOLS: Explicit tool whitelist (prevents tool sprawl)
4. MUST DO: Exhaustive requirements — leave NOTHING implicit
5. MUST NOT DO: Forbidden actions — anticipate and block rogue behavior
6. CONTEXT: File paths, existing patterns, constraints
```

### Good Example

```
TASK: Fix mobile layout breaking issue in `LoginButton.tsx`
EXPECTED OUTCOME: Buttons align vertically on mobile, horizontally on desktop
REQUIRED TOOLS: File edit, LSP diagnostics
MUST DO: Change flex-direction at md: breakpoint, test on 375px viewport
MUST NOT DO: Modify existing desktop layout, change colors or typography
CONTEXT: src/components/LoginButton.tsx, uses Tailwind CSS, see pattern in Header.tsx
```

### Bad Example

```
Fix this button layout
```

**Vague prompts = bad results. Be exhaustive.**

---

## Category System — Task Routing by Type

Instead of picking a specific agent, describe the TYPE of work:

| Category | Best For | Characteristics |
|---|---|---|
| **visual-engineering** | Frontend, UI/UX, design, styling | Creative, visual feedback needed |
| **ultrabrain** | Deep reasoning, complex architecture | Heavy analysis, extended thinking |
| **deep** | Goal-oriented autonomous problem-solving | Thorough research before action |
| **quick** | Trivial tasks, single file changes | Fast, minimal context needed |
| **writing** | Documentation, prose, technical writing | Language-focused, style-aware |
| **artistry** | Highly creative/artistic tasks | Novel ideas, unconventional approaches |

### Category + Skill Combos

Combine categories with skills for powerful specialized agents:

| Combo | Category | Skills | Effect |
|---|---|---|---|
| **The Designer** | visual-engineering | frontend-design | Aesthetic UI with design principles |
| **The Architect** | ultrabrain | architecture | Deep system design analysis |
| **The Maintainer** | quick | git-master | Quick fixes with clean commits |
| **The Researcher** | deep | documentation-templates | Thorough investigation with docs |

---

## Session Continuity (MANDATORY)

When delegating multiple related tasks to the same agent, maintain context:

### ALWAYS continue when:
- Task failed/incomplete → Resume with error context
- Follow-up question on result → Resume with additional question
- Multi-turn with same agent → Continue, don't start fresh
- Verification failed → Resume with specific failure details

### Why Continuity Matters:
- Agent has FULL previous context preserved
- No repeated file reads, exploration, or setup
- Saves 70%+ tokens on follow-ups
- Agent knows what it already tried/learned

---

## Verification After Delegation (MANDATORY)

After EVERY delegated task completes, verify:

1. **Does it work as expected?** — Test the output
2. **Does it follow existing codebase patterns?** — Check consistency
3. **Expected result came out?** — Compare to success criteria
4. **Did the agent follow MUST DO and MUST NOT DO?** — Check compliance

### Evidence Requirements (task NOT complete without these)

| Change Type | Required Evidence |
|---|---|
| File edit | Lint/diagnostics clean on changed files |
| Build command | Exit code 0 |
| Test run | Pass (or explicit note of pre-existing failures) |
| Delegation | Agent result received and verified |

**NO EVIDENCE = NOT COMPLETE.**

---

## Parallel Delegation

For tasks with no dependencies, fire multiple delegations simultaneously:

```
PARALLEL:
  → Agent A: Frontend component
  → Agent B: Backend API endpoint
  → Agent C: Test scaffolding

SEQUENTIAL (after parallel completes):
  → Agent D: Integration testing
```

### Rules for Parallel Delegation:
- Tasks MUST be independent (no shared file writes)
- Each task gets its own clear context
- Collect results before starting dependent work
- If one fails, don't block others

---

## Failure Recovery

### When Delegated Task Fails:

1. **First failure**: Resume session with specific error context
2. **Second failure**: Add additional context, broaden tool access
3. **Third failure**: Escalate to Oracle agent for diagnosis

### Escalation Protocol:

After 3 consecutive failures on the same task:

1. Stop attempting the same approach
2. Consult Oracle with full failure history
3. Get architectural advice before retrying
4. Try alternative approach based on Oracle's guidance

---

## Anti-Patterns

❌ Delegating without all 6 prompt sections
❌ Starting fresh sessions when continuing would preserve context
❌ Skipping verification after delegation
❌ Delegating everything (some things are faster to do directly)
❌ Vague task descriptions ("fix this", "make it work")
❌ Not specifying MUST NOT DO (agents will over-engineer)
❌ Parallel delegation of dependent tasks
❌ Ignoring session continuity for multi-step work
