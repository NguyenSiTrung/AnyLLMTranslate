# Antigravity Kit Architecture

> Comprehensive AI Agent Capability Expansion Toolkit

---

## 📋 Overview

Antigravity Kit is a modular system consisting of:

- **25 Specialist Agents** - Role-based AI personas
- **42 Skills** - Domain-specific knowledge modules (includes oracle & librarian)
- **32 Workflows** - Slash command procedures

---

## 🏗️ Directory Structure

```plaintext
.agent/
├── ARCHITECTURE.md          # This file
├── agents/                  # 25 Specialist Agents
├── skills/                  # 42 Skills
├── workflows/               # 32 Slash Commands
├── rules/                   # Global Rules
└── scripts/                 # Master Validation Scripts
```

---

## 🤖 Agents (25)

Specialist AI personas for different domains.

| Agent                    | Focus                      | Skills Used                                              |
| ------------------------ | -------------------------- | -------------------------------------------------------- |
| `orchestrator`           | Multi-agent coordination   | parallel-agents, behavioral-modes, delegation-patterns   |
| `project-planner`        | Discovery, task planning   | brainstorming, plan-writing, architecture                |
| `frontend-specialist`    | Web UI/UX                  | frontend-design, react-best-practices, tailwind-patterns |
| `backend-specialist`     | API, business logic        | api-patterns, nodejs-best-practices, database-design     |
| `database-architect`     | Schema, SQL                | database-design, prisma-expert                           |
| `mobile-developer`       | iOS, Android, RN           | mobile-design                                            |
| `game-developer`         | Game logic, mechanics      | game-development                                         |
| `devops-engineer`        | CI/CD, Docker              | deployment-procedures, docker-expert                     |
| `security-auditor`       | Security compliance        | vulnerability-scanner, red-team-tactics                  |
| `penetration-tester`     | Offensive security         | red-team-tactics                                         |
| `test-engineer`          | Testing strategies         | testing-patterns, tdd-workflow, webapp-testing           |
| `debugger`               | Root cause analysis        | systematic-debugging                                     |
| `performance-optimizer`  | Speed, Web Vitals          | performance-profiling                                    |
| `seo-specialist`         | Ranking, visibility        | seo-fundamentals, geo-fundamentals                       |
| `documentation-writer`   | Manuals, docs              | documentation-templates                                  |
| `product-manager`        | Requirements, user stories | plan-writing, brainstorming                              |
| `product-owner`          | Strategy, backlog, MVP     | plan-writing, brainstorming                              |
| `qa-automation-engineer` | E2E testing, CI pipelines  | webapp-testing, testing-patterns                         |
| `code-archaeologist`     | Legacy code, refactoring   | clean-code, code-review-checklist                        |
| `explorer-agent`         | Codebase analysis          | architecture, systematic-debugging                       |
| `oracle`                 | Strategic technical advisor | oracle, architecture, systematic-debugging               |
| `librarian`              | OSS docs & research        | librarian, documentation-templates                       |
| `plan-consultant`        | Pre-planning analysis      | brainstorming, architecture                              |
| `plan-reviewer`          | Plan validation            | plan-writing, code-review-checklist                      |
| `multimodal-analyst`     | Visual content analysis    | -                                                        |

---

## 🧩 Skills (42)

Modular knowledge domains that agents can load on-demand. based on task context.

### Frontend & UI

| Skill                   | Description                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| `react-best-practices`  | React & Next.js performance optimization (Vercel - 57 rules)          |
| `web-design-guidelines` | Web UI audit - 100+ rules for accessibility, UX, performance (Vercel) |
| `tailwind-patterns`     | Tailwind CSS v4 utilities                                             |
| `frontend-design`       | UI/UX patterns, design systems                                        |
| `ui-ux-pro-max`         | 50 styles, 21 palettes, 50 fonts                                      |

### Backend & API

| Skill                   | Description                    |
| ----------------------- | ------------------------------ |
| `api-patterns`          | REST, GraphQL, tRPC            |
| `nestjs-expert`         | NestJS modules, DI, decorators |
| `nodejs-best-practices` | Node.js async, modules         |
| `python-patterns`       | Python standards, FastAPI      |

### Database

| Skill             | Description                 |
| ----------------- | --------------------------- |
| `database-design` | Schema design, optimization |
| `prisma-expert`   | Prisma ORM, migrations      |

### TypeScript/JavaScript

| Skill               | Description                         |
| ------------------- | ----------------------------------- |
| `typescript-expert` | Type-level programming, performance |

### Cloud & Infrastructure

| Skill                   | Description               |
| ----------------------- | ------------------------- |
| `docker-expert`         | Containerization, Compose |
| `deployment-procedures` | CI/CD, deploy workflows   |
| `server-management`     | Infrastructure management |

### Testing & Quality

| Skill                   | Description              |
| ----------------------- | ------------------------ |
| `testing-patterns`      | Jest, Vitest, strategies |
| `webapp-testing`        | E2E, Playwright          |
| `tdd-workflow`          | Test-driven development  |
| `code-review-checklist` | Code review standards    |
| `lint-and-validate`     | Linting, validation      |

### Security

| Skill                   | Description              |
| ----------------------- | ------------------------ |
| `vulnerability-scanner` | Security auditing, OWASP |
| `red-team-tactics`      | Offensive security       |

### Architecture & Planning

| Skill                    | Description                            |
| ------------------------ | -------------------------------------- |
| `app-builder`            | Full-stack app scaffolding             |
| `architecture`           | System design patterns                 |
| `plan-writing`           | Task planning, breakdown               |
| `brainstorming`          | Socratic questioning                   |
| `intent-classification`  | Request analysis, intent routing       |
| `delegation-patterns`    | Agent delegation protocol, task routing|

### Mobile

| Skill           | Description           |
| --------------- | --------------------- |
| `mobile-design` | Mobile UI/UX patterns |

### Game Development

| Skill              | Description           |
| ------------------ | --------------------- |
| `game-development` | Game logic, mechanics |

### SEO & Growth

| Skill              | Description                   |
| ------------------ | ----------------------------- |
| `seo-fundamentals` | SEO, E-E-A-T, Core Web Vitals |
| `geo-fundamentals` | GenAI optimization            |

### Shell/CLI

| Skill                | Description               |
| -------------------- | ------------------------- |
| `bash-linux`         | Linux commands, scripting |
| `powershell-windows` | Windows PowerShell        |

### Git & DevOps

| Skill                     | Description                                  |
| ------------------------- | -------------------------------------------- |
| `git-master`              | Atomic commits, rebase, history investigation|

### Project Management

| Skill                     | Description                                                      |
| ------------------------- | ---------------------------------------------------------------- |
| `conductor`               | Context-driven development, spec-first coding, TDD tracks        |
| `beads`                   | Git-backed issue tracker, multi-session work, persistent memory  |

### Advisory & Research

| Skill                     | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `oracle`                  | Strategic technical advisor, architecture decisions    |
| `librarian`               | OSS documentation lookup, multi-repo research         |

### Other

| Skill                     | Description               |
| ------------------------- | ------------------------- |
| `clean-code`              | Coding standards (Global) |
| `behavioral-modes`        | Agent personas            |
| `parallel-agents`         | Multi-agent patterns      |
| `mcp-builder`             | Model Context Protocol    |
| `documentation-templates` | Doc formats               |
| `i18n-localization`       | Internationalization      |
| `performance-profiling`   | Web Vitals, optimization  |
| `systematic-debugging`    | Troubleshooting           |

---

## 🔄 Workflows (32)

Slash command procedures. Invoke with `/command`.

### Core Workflows

| Command          | Description                         |
| ---------------- | ----------------------------------- |
| `/brainstorm`    | Socratic discovery                  |
| `/create`        | Create new features                 |
| `/debug`         | Debug issues                        |
| `/deploy`        | Deploy application                  |
| `/enhance`       | Improve existing code               |
| `/orchestrate`   | Multi-agent coordination            |
| `/plan`          | Task breakdown                      |
| `/preview`       | Preview changes                     |
| `/status`        | Check project status                |
| `/test`          | Run tests                           |
| `/ui-ux-pro-max` | Design with 50 styles               |
| `/init-deep`     | Deep context initialization         |
| `/ralph-loop`    | Continuous dev loop until completion|
| `/start-work`    | Execute from planner-generated plan |
| `/refactor`      | Intelligent refactoring with TDD    |
| `/handoff`       | Session context transfer            |

### Conductor Workflows

| Command                | Description                              |
| ---------------------- | ---------------------------------------- |
| `/conductor-setup`     | Initialize project with Conductor        |
| `/conductor-newtrack`  | Create new feature/bug track with spec   |
| `/conductor-implement` | Execute tasks from track plan            |
| `/conductor-status`    | Display project progress                 |
| `/conductor-revert`    | Git-aware revert of tracks/phases/tasks  |
| `/conductor-validate`  | Validate project integrity               |
| `/conductor-block`     | Mark task as blocked with reason         |
| `/conductor-skip`      | Skip current task with reason            |
| `/conductor-revise`    | Update spec/plan for implementation issues|
| `/conductor-archive`   | Archive completed tracks                 |
| `/conductor-export`    | Export project summary as markdown       |
| `/conductor-handoff`   | Create context handoff for next session  |
| `/conductor-refresh`   | Sync context docs with codebase state    |
| `/conductor-formula`   | Manage track workflow templates          |
| `/conductor-distill`   | Extract reusable template from track     |
| `/conductor-wisp`      | Quick ephemeral exploration track        |

---

## 🎯 Skill Loading Protocol

```plaintext
User Request → Skill Description Match → Load SKILL.md
                                            ↓
                                    Read references/
                                            ↓
                                    Read scripts/
```

### Skill Structure

```plaintext
skill-name/
├── SKILL.md           # (Required) Metadata & instructions
├── scripts/           # (Optional) Python/Bash scripts
├── references/        # (Optional) Templates, docs
└── assets/            # (Optional) Images, logos
```

### Enhanced Skills (with scripts/references)

| Skill               | Files | Coverage                            |
| ------------------- | ----- | ----------------------------------- |
| `ui-ux-pro-max`     | 27    | 50 styles, 21 palettes, 50 fonts    |
| `app-builder`       | 20    | Full-stack scaffolding              |

---

## � Scripts (2)

Master validation scripts that orchestrate skill-level scripts.

### Master Scripts

| Script          | Purpose                                 | When to Use              |
| --------------- | --------------------------------------- | ------------------------ |
| `checklist.py`  | Priority-based validation (Core checks) | Development, pre-commit  |
| `verify_all.py` | Comprehensive verification (All checks) | Pre-deployment, releases |

### Usage

```bash
# Quick validation during development
python .agent/scripts/checklist.py .

# Full verification before deployment
python .agent/scripts/verify_all.py . --url http://localhost:3000
```

### What They Check

**checklist.py** (Core checks):

- Security (vulnerabilities, secrets)
- Code Quality (lint, types)
- Schema Validation
- Test Suite
- UX Audit
- SEO Check

**verify_all.py** (Full suite):

- Everything in checklist.py PLUS:
- Lighthouse (Core Web Vitals)
- Playwright E2E
- Bundle Analysis
- Mobile Audit
- i18n Check

For details, see [scripts/README.md](scripts/README.md)

---

## 📊 Statistics

| Metric              | Value                         |
| ------------------- | ----------------------------- |
| **Total Agents**    | 25                            |
| **Total Skills**    | 42                            |
| **Total Workflows** | 32                            |
| **Total Scripts**   | 2 (master) + 18 (skill-level) |
| **Coverage**        | ~95% web/mobile development   |

---

## 🔗 Quick Reference

| Need           | Agent                 | Skills                                |
| -------------- | --------------------- | ------------------------------------- |
| Web App        | `frontend-specialist` | react-best-practices, frontend-design |
| API            | `backend-specialist`  | api-patterns, nodejs-best-practices   |
| Mobile         | `mobile-developer`    | mobile-design                         |
| Database       | `database-architect`  | database-design, prisma-expert        |
| Security       | `security-auditor`    | vulnerability-scanner                 |
| Testing        | `test-engineer`       | testing-patterns, webapp-testing      |
| Debug          | `debugger`            | systematic-debugging                  |
| Plan           | `project-planner`     | brainstorming, plan-writing           |
| Architecture   | `oracle`              | architecture, systematic-debugging    |
| Research       | `librarian`           | documentation-templates               |
| Pre-Analysis   | `plan-consultant`     | brainstorming, architecture           |
| Plan Review    | `plan-reviewer`       | plan-writing, code-review-checklist   |
| Visual Content | `multimodal-analyst`  | -                                     |
| Git Workflow   | (any agent)           | git-master                            |
| Orchestration  | `orchestrator`        | delegation-patterns, intent-classification |
