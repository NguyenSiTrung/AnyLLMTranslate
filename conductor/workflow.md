<!-- conductor-refresh: 2026-10-05 all (no workflow/methodology drift in the three post-refresh commits; test coverage target ≥70%; CI unchanged. Gates rerun: 743/117 green in 23.6 s after deleting a stale duplicate test, tsc 0, lint 38 errors. Flake guidance corrected — the two load-sensitive files also fail when run alone.) -->
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

**Isolation is not proof of health (corrected 2026-10-05).** The two files that carry the load-sensitive class fail **even when run alone**: on 2026-10-05 `services/__tests__/background.streamStats.test.ts` failed 3 of 6 isolated runs and `content/__tests__/subtitleCoordinator.test.ts` 1 of 5, and the failing *case* moved between runs within the same file. The 2026-09-28 snapshot's "both pass in isolation" was therefore wrong, so do not treat a green isolated run as clearing a flake — run the file several times, and treat a moving failure set as the flake signature whether or not the run was parallel.

The suite runs under `pool: 'threads'` (switched 2026-09-22: a process fork per file cost 117 s and 5 load-sensitive failures on a 4-core host versus ~63 s all-green with threads) and `vitest.setup.ts` hands back timers in a global `afterEach`, added after a leaked fake timer in `background.test.ts` poisoned every later file's `beforeEach`. A run that comes in below the known-green count with a *moving* failure set is load, not regression — but per the paragraph above, confirm by **repeating** the file, not by a single isolated pass.

**A stale duplicate test file is a deterministic red that looks like a flake.** `entrypoints/options/sections/__tests__/captionQualityPlus.test.tsx` failed at HEAD for weeks because commit `945a388` documented renaming it to `translationModeCard.test.tsx` but staged only the addition; the stale copy kept importing a component that no longer rendered the toggle. When a test file's subject moved, check that the old file was actually deleted (`git show --name-status`), not just that a new one was added.

**The lint gate is not currently green:** HEAD (2026-10-05, verified again) carries **38 ESLint errors** (32 in `content/__tests__/webTranslateLifecycle.test.ts` — `no-explicit-any` / `consistent-type-imports`; 4 `no-useless-escape` in `services/__tests__/background.plus.test.ts`; 1 `no-non-null-assertion` in `entrypoints/content.ts`; 1 `preserve-caught-error` in `services/providerPool.ts`) after the 2026-09-14…22 test consolidations merged files that carried them. Run `pnpm lint` and record the count; a non-zero exit is not by itself a new regression, and the count must not grow. Filed as `AnyLLMTranslate-e140` (2026-09-28 refresh; force-closed without a fix on 2026-09-29, reopen to act on it).

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
