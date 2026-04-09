---
name: parallel-agents
description: Multi-agent orchestration patterns. Use when multiple independent tasks can run with different domain expertise or when comprehensive analysis requires multiple perspectives.
allowed-tools: Read, Glob, Grep
---

# Parallel Agents — Multi-Agent Orchestration

> Coordinate multiple specialized agents for comprehensive analysis and implementation.

## When to Use Orchestration

✅ **Good for:**
- Complex tasks requiring multiple expertise domains
- Code analysis from security, performance, and quality perspectives
- Comprehensive reviews (architecture + security + testing)
- Feature implementation needing backend + frontend + database work

❌ **Not for:**
- Simple, single-domain tasks
- Quick fixes or small changes
- Tasks where one agent suffices

---

## Orchestration Patterns

### Pattern 1: Comprehensive Analysis

```
Agents: explorer → [domain-agents] → synthesis

1. Explorer: Map codebase structure
2. Security auditor: Security posture
3. Backend specialist: API quality
4. Frontend specialist: UI/UX patterns
5. Test engineer: Test coverage
6. Synthesize all findings
```

### Pattern 2: Feature Implementation

```
Agents: affected-domain-agents → test-engineer

1. Identify affected domains (backend? frontend? both?)
2. Invoke relevant domain agents in parallel
3. Test engineer verifies changes
4. Synthesize recommendations
```

### Pattern 3: Security Audit

```
Agents: security-auditor → penetration-tester → synthesis

1. Security auditor: Configuration and code review
2. Penetration tester: Active vulnerability testing
3. Synthesize with prioritized remediation
```

---

## Agent Invocation

### Single Agent
```
Dispatch a security review of the authentication module.
```

### Sequential Chain
```
1. Discover project structure
2. Review API endpoints
3. Identify test gaps
```

### Parallel Dispatch
```
PARALLEL (no dependencies):
  → Agent A: Frontend component
  → Agent B: Backend API endpoint
  → Agent C: Test scaffolding

SEQUENTIAL (after parallel completes):
  → Agent D: Integration testing
```

### With Context Passing
```
1. Analyze React components → findings
2. Based on findings, generate component tests
```

---

## Available Specialist Roles

| Role | Expertise | Trigger Phrases |
|------|-----------|-----------------|
| `orchestrator` | Coordination | "comprehensive", "multi-perspective" |
| `security-auditor` | Security | "security", "auth", "vulnerabilities" |
| `penetration-tester` | Security Testing | "pentest", "red team", "exploit" |
| `backend-specialist` | Backend | "API", "server", "Node.js", "Express" |
| `frontend-specialist` | Frontend | "React", "UI", "components", "Next.js" |
| `test-engineer` | Testing | "tests", "coverage", "TDD" |
| `devops-engineer` | DevOps | "deploy", "CI/CD", "infrastructure" |
| `database-architect` | Database | "schema", "Prisma", "migrations" |
| `mobile-developer` | Mobile | "React Native", "Flutter", "mobile" |
| `api-designer` | API Design | "REST", "GraphQL", "OpenAPI" |
| `debugger` | Debugging | "bug", "error", "not working" |
| `explorer-agent` | Discovery | "explore", "map", "structure" |
| `documentation-writer` | Documentation | "write docs", "create README" |
| `performance-optimizer` | Performance | "slow", "optimize", "profiling" |
| `project-planner` | Planning | "plan", "roadmap", "milestones" |
| `seo-specialist` | SEO | "SEO", "meta tags", "search ranking" |
| `game-developer` | Game Development | "game", "Unity", "Godot", "Phaser" |

---

## Synthesis Protocol

After all agents complete, synthesize:

```markdown
## Orchestration Synthesis

### Task Summary
[What was accomplished]

### Agent Contributions
| Agent | Finding |
|-------|---------|
| security-auditor | Found X |
| backend-specialist | Identified Y |

### Consolidated Recommendations
1. **Critical**: [Issue from Agent A]
2. **Important**: [Issue from Agent B]
3. **Nice-to-have**: [Enhancement from Agent C]

### Action Items
- [ ] Fix critical security issue
- [ ] Refactor API endpoint
- [ ] Add missing tests
```

---

## Best Practices

1. **Logical order** — Discovery → Analysis → Implementation → Testing
2. **Share context** — Pass relevant findings to subsequent agents
3. **Single synthesis** — One unified report, not separate outputs
4. **Verify changes** — Always include test-engineer for code modifications
5. **Minimize parallelism risk** — Only parallelize truly independent tasks

---

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Parallelize dependent tasks | Identify dependencies first |
| Skip synthesis step | Always consolidate findings |
| Dispatch without clear scope | Each agent gets specific task + criteria |
| Over-orchestrate simple tasks | Single agent for single-domain work |
| Forward full session to agents | Context isolation per agent |
