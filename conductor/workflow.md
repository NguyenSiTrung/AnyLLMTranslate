<!-- conductor-refresh: 2026-09-11 all (coverage target CHANGED by user decision: ≥80% → ≥70% — repo measured 78.31% statements once inject/** entered the coverage include, so the old target was no longer the governing rule; CONTRIBUTING.md aligned in the same change. Branching strategy and Conventional-Commits still match the repo; CI/CD unchanged at pages.yml + bridge-image.yml; 725 pass / 0 fail across 213 files; tsc 0 / lint 0 re-run; build 3.84 MB re-measured) -->
# Development Workflow — AnyLLMTranslate

## Branching Strategy

- **master**: Stable, releasable default branch
- **feat/<track-id>**: Feature branches per track
- **fix/<description>**: Hotfix branches

## Commit Convention

Commits follow Conventional Commits:
```
<type>(<scope>): <description>

Types: feat, fix, refactor, test, docs, chore, perf
Scope: dom-walker, translation, subtitles, popup, options, cache, etc.
```

## Task Completion

- **Commit after**: Each task completion
- **Commit message**: Include task reference from plan
- **Git Notes**: Used for task summaries

## Test Coverage

- **Target**: ≥ 70% (statements) — lowered from ≥80% on 2026-09-11 once `inject/**` was added to the coverage include and the suite measured 78.31% statements. The target governs the whole covered surface (`services/`, `lib/`, `content/`, `inject/`, `types/`), not just "core modules". `lib` runs ≈89% and `inject` ≈82%; new code should not drag the total below the floor.
- **Required before merge**: All tests passing
- **TDD encouraged**: Write test → implement → refine

## Phase Verification

At the end of each phase:
1. Run full test suite: `pnpm test`
2. Run lint: `pnpm lint`
3. Manual verification of new features
4. Update track learnings

**Platform-dependent work needs a live check.** Unit tests cannot close a finding whose trigger only exists on the real site (DRM/MSE capture, player DOM, CDN behaviour). Maintenance work that touches a platform pipeline must carry an explicit "live verification" backlog — see `docs/hbomax-subtitle-risk-audit.md` §8 for the Max example — and those items stay open until a real session confirms them. A green suite is not evidence that a capture-path fix works in production.

When a full Vitest run times out, rerun the affected file(s) in isolation and perform one clean full-suite rerun before classifying it as a regression. Record repeated load-sensitive timeouts in the refresh health snapshot; do not report the full gate as green solely because isolated files pass.

## Code Review Checklist

- [ ] TypeScript strict mode — no `any` leaks
- [ ] Named exports only
- [ ] Tests written (AAA pattern)
- [ ] No hardcoded strings (i18n-ready)
- [ ] Chrome API usage follows MV3 best practices
- [ ] No host page style pollution from extension CSS
- [ ] Run `pnpm lint` before commit

## Definition of Done

A task is "done" when:
1. Implementation complete and working
2. Tests written and passing
3. No lint errors
4. Committed with proper message
5. Learnings captured (if applicable)
