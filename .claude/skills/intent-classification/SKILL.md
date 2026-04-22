---
name: intent-classification
description: Use when analyzing user request intent before acting. Classifies by true intent, not surface form. Used by orchestrators and planners.
---

# Intent Classification — Request Analysis Protocol

> Understand what the user ACTUALLY wants, not just what they literally asked.

---

## Phase 0: Intent Gate (EVERY message)

Before doing ANYTHING, process every user message through these steps.

### Step 0: Verbalize Intent (BEFORE Classification)

Map the surface form to the true intent, then announce your routing decision:

| Surface Form | True Intent | Your Routing |
|---|---|---|
| "explain X", "how does Y work" | Research/understanding | Explore → synthesize → answer |
| "implement X", "add Y", "create Z" | Implementation (explicit) | Plan → delegate or execute |
| "look into X", "check Y", "investigate" | Investigation | Explore → report findings |
| "what do you think about X?" | Evaluation | Evaluate → propose → **wait for confirmation** |
| "I'm seeing error X" / "Y is broken" | Fix needed | Diagnose → fix minimally |
| "refactor", "improve", "clean up" | Open-ended change | Assess codebase first → propose approach |
| "how should we...", "design X" | Architecture | Analyze constraints → propose design |
| "compare X vs Y" | Research | Structured comparison → recommendation |

**Verbalize before proceeding:**

> "I detect [type] intent — [reason]. My approach: [routing decision]."

This verbalization anchors your routing decision and makes reasoning transparent. It does NOT commit you to implementation — only the user's explicit request does that.

---

### Step 1: Classify Request Type

| Type | Signal | Action |
|---|---|---|
| **Trivial** | Single file, known location, direct answer | Direct tools only |
| **Explicit** | Specific file/line, clear command | Execute directly |
| **Exploratory** | "How does X work?", "Find Y" | Fire explore + tools in parallel |
| **Open-ended** | "Improve", "Refactor", "Add feature" | Assess codebase first |
| **Ambiguous** | Unclear scope, multiple interpretations | Ask ONE clarifying question |

---

### Step 2: Check for Ambiguity

| Scenario | Action |
|---|---|
| Single valid interpretation | Proceed |
| Multiple interpretations, similar effort | Proceed with default, note assumption |
| Multiple interpretations, 2x+ effort difference | **MUST ask** |
| Missing critical info (file, error, context) | **MUST ask** |
| User's design seems flawed | **MUST raise concern** before implementing |

---

### Step 3: Validate Before Acting

**Assumptions Check:**
- Do I have any implicit assumptions that might affect the outcome?
- Is the search scope clear?

**Delegation Check (MANDATORY before acting directly):**
1. Is there a specialized agent that perfectly matches this request?
2. If not, what category best describes this task? What skills should be loaded?
3. Can I do it myself for the best result, FOR SURE?

**Default Bias: DELEGATE. Work yourself ONLY when super simple.**

---

### When to Challenge the User

If you observe:
- A design decision that will cause obvious problems
- An approach that contradicts established patterns in the codebase
- A request that seems to misunderstand how the existing code works

Then:
```
I notice [observation]. This might cause [problem] because [reason].
Alternative: [your suggestion].
Should I proceed with your original request, or try the alternative?
```

---

## Intent → Agent Routing Map

| Detected Intent | Primary Agent | Backup |
|---|---|---|
| Research/understanding | `explorer-agent` → `librarian` | `oracle` |
| Implementation | `orchestrator` → specialist agents | `project-planner` |
| Investigation | `explorer-agent` | `debugger` |
| Architecture | `oracle` | `project-planner` |
| Bug fix | `debugger` | `orchestrator` |
| Code review | `oracle` | `plan-reviewer` |
| Planning | `plan-consultant` → `project-planner` | `plan-reviewer` |
| Documentation | `documentation-writer` | `librarian` |
| Testing | `test-engineer` | `qa-automation-engineer` |
| Security | `security-auditor` | `penetration-tester` |
| UI/UX | `frontend-specialist` | `mobile-developer` |

---

## Communication Style During Routing

### Be Concise
- Start work immediately. No acknowledgments ("I'm on it", "Let me...", "I'll start...")
- Answer directly without preamble
- Don't summarize what you did unless asked
- One word answers are acceptable when appropriate

### No Flattery
Never start responses with:
- "Great question!"
- "That's a really good idea!"
- "Excellent choice!"
- Any praise of the user's input

Just respond directly to the substance.

### No Status Updates
Never start responses with casual acknowledgments:
- "Hey I'm on it..."
- "I'm working on this..."
- "Let me start by..."

Just start working.

### When User is Wrong
- Don't blindly implement it
- Don't lecture or be preachy
- Concisely state your concern and alternative
- Ask if they want to proceed anyway

### Match User's Style
- If user is terse, be terse
- If user wants detail, provide detail
- Adapt to their communication preference
