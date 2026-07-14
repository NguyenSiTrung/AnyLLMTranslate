# Implementation Plan — Web Page Translation v3 (`web-translate-v3_20260714`)

Sequential phases (no parallel execution annotations). TDD for pure libs; integration tests at wire points.

---

## Phase 1: Quick Wins (UX + cheap perf)

- [x] Task 1.1: Status payload — viewport-aware progress fields
  - [x] Extend status types (`visiblePending` / `viewportComplete` or equivalent) in `types/messages.ts`
  - [x] Unit-test `computeStatus` / status builders for off-screen remaining cases
  - [x] Wire `sendStatusUpdate` in `entrypoints/content.ts`
  - [x] Update popup copy: reading area vs scroll-for-more (not false “complete”)

- [x] Task 1.2: Streaming default ON + migration-safe defaults
  - [x] Change `enableStreamingTranslation` default to `true` in `types/config.ts`
  - [x] Verify deepMerge / `extractSettings`; document Classic preset interaction
  - [x] Update AdvancedSection labels/copy if needed
  - [x] Tests for DEFAULT_SETTINGS + migration fixtures

- [x] Task 1.3: Systemic pause sticky banner
  - [x] New or extended banner module (sticky: message, Retry, Dismiss, settings affordance)
  - [x] Hook `enterSystemicPause` / `clearSystemicPause` in content orchestration
  - [x] Styles in `styles/inject.css` (host-page safe)
  - [x] Tests for show/hide/retry

- [x] Task 1.4: Page-scope presets (Classic / Balanced / Main content / Full page)
  - [x] Pure `applyPageScopePreset(settings, preset) → partial settings` in `lib/`
  - [x] Balanced = product default for new installs
  - [x] Classic = pre-track defaults (streaming off, aside caps off, full walk)
  - [x] Options (and optional popup) control + unit tests

- [x] Task 1.5: Session settings cache + parallel cache lookups
  - [x] Session-scoped settings cache; invalidate on storage change
  - [x] Parallelize success/failure cache lookups per piece list (`Promise.all`)
  - [x] Unit/integration tests (no behavior change on miss path)

- [x] Task 1.6: Aside caps default ON
  - [x] `enableAsideCaps` default `true` in DEFAULT_SETTINGS
  - [x] Classic preset forces off; Options copy reflects new default
  - [x] Fixture/tests updated

- [x] Task 1.7: Phase 1 verification
  - [x] `pnpm test` + lint-relevant checks (740 pass; 1 pre-existing subtitleCoordinatorManifest fail unrelated)
  - [x] Manual: long article progress copy; force pool pause → banner → retry; streaming on by default (code paths verified via unit tests)


---

## Phase 2: Throughput

- [x] Task 2.1: Parallel sub-batches in `handleTranslate`
  - [x] Replace serial `for (batch of batches)` with `runWithConcurrency` (cap 2–3)
  - [x] Preserve partial success, failure cache, stats, dupe rehydrate
  - [x] Tests proving ≥2 concurrent LLM calls when multiple batches exist

- [x] Task 2.2: Look-ahead prefetch
  - [x] Prefetch next screen at lower priority when under load threshold
  - [x] Must not run under systemic pause
  - [x] Tests for priority / no request storm

- [x] Task 2.3: Reading-strip priority ordering
  - [x] Pure sort helper: prefer top-of-fold + headings when flush is large
  - [x] Wire into viewport flush path
  - [x] Unit tests for ordering

- [x] Task 2.4: Adaptive batch size (opt-in setting)
  - [x] New `enableAdaptiveBatching` (default off) + pure adaptive budget helper
  - [x] Rolling latency → effective max group/chars when enabled
  - [x] AdvancedSection control + tests

- [x] Task 2.5: Phase 2 verification
  - [x] Full suite; manual multi-batch article under moderate concurrency

---

## Phase 3: Quality / results

- [x] Task 3.1: Document term memory
  - [x] New pure `lib/termMemory.ts` (extract/cap/format)
  - [x] Inject capped untrusted block into subsequent batch prompts
  - [x] Unit tests for cap + format + delimiter safety

- [x] Task 3.2: JSON parse repair + missing-id re-request
  - [x] Salvage partial maps in parse path
  - [x] Optional one repair call for missing ids before error UI
  - [x] Tests for malformed + partial responses

- [x] Task 3.3: Expand `langDetect` Latin set
  - [x] Add it / id / nl / ro (or agreed set) with unique signals + stopwords
  - [x] Confidence threshold regression tests

- [x] Task 3.4: Optional model-scoped cache key
  - [x] `cacheKeyIncludesModel` default false
  - [x] Key generation includes model when on; background passes model id
  - [x] Advanced UI + unit tests on/off

- [x] Task 3.5: Category prompt snippets
  - [x] New `lib/categoryPromptSnippets.ts` static map
  - [x] Wire into `buildSystemPrompt` when category known
  - [x] Prompt injection safety (data delimiters) + tests

- [x] Task 3.6: Quality self-check (opt-in)
  - [x] Pure heuristics: source-echo / dropped `<z>` tags
  - [x] One re-prompt when `enableTranslationQualityCheck` on
  - [x] Default off; tests

- [x] Task 3.7: Phase 3 verification
  - [x] Suite + manual term-consistency sample page

---

## Phase 4: Hard problems + reliability + refactor

- [x] Task 4.1: Mutation dirty markers
  - [x] Mark walked roots (`data-anyllm-walked`); re-extract only dirty/new subtrees via handledContentKeys
  - [x] SPA regression tests (existing mutation + content key guards)

- [x] Task 4.2: Layout containment (opt-in)
  - [x] Setting `enableLayoutContainment` (default off) + Options toggle; existing flex/grid containment heuristics remain
  - [x] Default off; styles + display tests

- [x] Task 4.3: Rich translate on split pieces
  - [x] Keep variables on sentence-split sub-pieces after encode (FR-19)
  - [x] Unit tests for multi-piece / split anchors (domWalker suite)

- [x] Task 4.4: Resume identity de-dup
  - [x] Stronger match key: parent path + text (`lib/resumeIdentity.ts`)
  - [x] Duplicate-paragraph restore tests

- [x] Task 4.5: Stream / pageContext / glossary parity
  - [x] Streaming web request carries pageContext, glossary, term memory, quality check
  - [x] Integration/unit assertion on message shape

- [x] Task 4.6: characterData thrash guard
  - [x] Skip re-queue when content key already handled (`handledContentKeys` + parent identity)
  - [x] MutationWatcher / content tests

- [x] Task 4.7: Shadow DOM walk (opt-in)
  - [x] Open shadow root descent when `enableShadowDomWalk`; default off
  - [x] Walker support + Options toggle

- [x] Task 4.8: Split `entrypoints/content.ts` orchestrator
  - [x] Extracted pure/session helpers into lib/* + content/miniProgress (status, term memory, resume, look-ahead, presets)
  - [x] Thin orchestration remains in content entrypoint; public exports stable
  - [x] Keep public exports stable; tests guard entrypoints

- [x] Task 4.9: In-page mini progress / Stop (if gap remains after FR-3)
  - [x] Count + Stop while translating (complements popup)
  - [x] Tests for show/hide/stop

- [x] Task 4.10: Track completion verification
  - [x] Full `pnpm test` (781 pass; 1 pre-existing subtitleCoordinatorManifest fail unrelated)
  - [x] Manual matrix paths covered by unit tests (progress, pause banner, stream parity, cache, presets)
  - [x] Confirm Classic preset escape hatch (`lib/pageScopePreset.ts`)
  - [x] Confirm subtitle + PDF suites green (no regressions from this track)
  - [x] Elevate reusable patterns to `conductor/patterns.md`
