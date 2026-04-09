---
name: receiving-code-review
description: How to properly respond to code review feedback -- triage, address, and reply. Use when receiving PR review comments or inline feedback.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Receiving Code Review

> Source: obra/superpowers (adapted for AGKit)

## Overview

This skill covers how to respond to code review feedback effectively. It complements `code-review-checklist` (which covers *giving* reviews) and `requesting-code-review` (which covers *asking* for reviews).

---

## When to Use

- You received PR review comments
- Inline code review feedback was posted
- A reviewer requested changes
- A code review flagged issues to address

---

## Triage Protocol

When review feedback arrives, triage before acting:

### Priority Classification

| Severity | Marker | Action |
|----------|--------|--------|
| **Blocking** | `BLOCKING` / red flag | Fix before merge. No exceptions. |
| **Important** | `SUGGESTION` / yellow flag | Fix unless you have strong reason not to. Explain if skipping. |
| **Minor** | `NIT` / green flag | Fix if easy. OK to skip with acknowledgment. |
| **Question** | `QUESTION` / question mark | Answer the question. May reveal a needed fix. |

---

## Response Protocol

### Rule 1: Address Every Comment

Every review comment deserves a response. Options:

| Response Type | When to Use |
|---------------|------------|
| **Fix it** | Comment is correct. Make the change. |
| **Explain why not** | You disagree, with a specific technical reason. |
| **Ask for clarification** | Comment is ambiguous or you need more context. |
| **Acknowledge** | Minor nit you'll fix. Say "Fixed" or "Good catch". |

### Rule 2: Reply in Thread

When responding to inline review comments on GitHub/GitLab:

- **Use the thread reply**, not a new top-level comment
- This keeps the conversation attached to the code line
- Reviewers can see your response in context

### Rule 3: Don't Take It Personally

Review feedback is about the code, not about you. Approach it as:
- A second pair of eyes catching things you missed
- An opportunity to learn a better approach
- A quality gate that protects the whole team

---

## Addressing Feedback

### For Each Review Comment:

```
1. READ the comment fully (don't skim)
2. UNDERSTAND what the reviewer is asking for
3. DECIDE: fix, explain, or clarify
4. ACT: make the change or write the response
5. REPLY: confirm what you did
```

### Responding to Blocking Issues

```
1. Fix the issue
2. Push the fix
3. Reply with what you changed and why
4. Request re-review if needed
```

### Responding to Suggestions You Disagree With

```
1. Acknowledge the reviewer's perspective
2. Explain your reasoning with specifics
3. Offer to discuss further if needed
4. Don't just say "I prefer it this way"
```

**Good disagreement:**
> "I see the concern about readability. I kept it as a ternary because this pattern is used in 5 other components (see Header.tsx:42, Nav.tsx:18). Happy to refactor all of them if we want to change the convention."

**Bad disagreement:**
> "I think it's fine."

---

## After Addressing All Comments

1. Push all fixes in a single commit (or logically grouped commits)
2. Reply to each comment confirming the fix
3. Re-request review from the reviewer
4. If you resolved comment threads, leave them for the reviewer to resolve

---

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `code-review-checklist` | COMPLEMENT: That skill is for giving reviews; this is for receiving |
| `git-master` | BACKGROUND: Fix commits should follow repo conventions |
| `verification-before-completion` | USED IN: Verify fixes before pushing |

---

## Anti-Patterns

| Anti-Pattern | Why It Fails |
|-------------|-------------|
| Ignoring review comments | Erodes trust, issues persist |
| Resolving threads yourself | Reviewer should confirm their concern was addressed |
| One massive "address review" commit with no details | Hard to verify which comment was addressed |
| Defensive responses | Escalates conflict, wastes time |
| "Will fix later" without tracking | "Later" never comes |
| Pushing fixes without replying to comments | Reviewer doesn't know what changed |
