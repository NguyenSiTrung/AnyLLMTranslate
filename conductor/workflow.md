# Development Workflow — AnyLLMTranslate

## Branching Strategy

- **main**: Stable, releasable code
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

- **Target**: ≥ 80% for core modules
- **Required before merge**: All tests passing
- **TDD encouraged**: Write test → implement → refine

## Phase Verification

At the end of each phase:
1. Run full test suite: `pnpm test`
2. Run lint: `pnpm lint`
3. Manual verification of new features
4. Update track learnings

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
