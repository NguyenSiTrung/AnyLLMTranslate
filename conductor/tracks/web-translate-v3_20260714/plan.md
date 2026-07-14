# Implementation Plan — Web Page Translation v3 (`web-translate-v3_20260714`)

Sequential phases (no parallel execution annotations). TDD for pure libs; integration tests at wire points.

---

## Phase 1: Quick Wins (UX + cheap perf)

- [x] Task 1.1: Status payload — viewport-aware progress fields
  - [x] Extend status types (`visiblePending` / `viewportComplete` or equivalent) in `types/messages.ts`
  - [x] Unit-test `computeStatus` / status builders for off-screen remaining cases
  - [x] Wire `sendStatusUpdate` in `entrypoints/content.ts`
  - [x] Update popup copy: reading area vs scroll-for-more (not false “complete”)

- [ ] Task 1.2: Streaming default ON + migration-safe defaults
  - [ ] Change `enableStreamingTranslation` default to `true` in `types/config.ts`
  - [ ] Verify deepMerge / `extractSettings`; document Classic preset interaction
  - [ ] Update AdvancedSection labels/copy if needed
  - [ ] Tests for DEFAULT_SETTINGS + migration fixtures

- [ ] Task 1.3: Systemic pause sticky banner
  - [ ] New or extended banner module (sticky: message, Retry, Dismiss, settings affordance)
  - [ ] Hook `enterSystemicPause` / `clearSystemicPause` in content orchestration
  - [ ] Styles in `styles/inject.css` (host-page safe)
  - [ ] Tests for show/hide/retry

- [ ] Task 1.4: Page-scope presets (Classic / Balanced / Main content / Full page)
  - [ ] Pure `applyPageScopePreset(settings, preset) → partial settings` in `lib/`
  - [ ] Balanced = product default for new installs
  - [ ] Classic = pre-track defaults (streaming off, aside caps off, full walk)
  - [ ] Options (and optional popup) control + unit tests

- [ ] Task 1.5: Session settings cache + parallel cache lookups
  - [ ] Session-scoped settings cache; invalidate on storage change
  - [ ] Parallelize success/failure cache lookups per piece list (`Promise.all`)
  - [ ] Unit/integration tests (no behavior change on miss path)

- [ ] Task 1.6: Aside caps default ON
  - [ ] `enableAsideCaps` default `true` in DEFAULT_SETTINGS
  - [ ] Classic preset forces off; Options copy reflects new default
  - [ ] Fixture/tests updated

- [ ] Task 1.7: Phase 1 verification
  - [ ] `pnpm test` + lint-relevant checks
  - [ ] Manual: long article progress copy; force pool pause → banner → retry; streaming on by default

---

## Phase 2: Throughput

- [ ] Task 2.1: Parallel sub-batches in `handleTranslate`
  - [ ] Replace serial `for (batch of batches)` with `runWithConcurrency` (cap 2–3)
  - [ ] Preserve partial success, failure cache, stats, dupe rehydrate
  - [ ] Tests proving ≥2 concurrent LLM calls when multiple batches exist

- [ ] Task 2.2: Look-ahead prefetch
  - [ ] Prefetch next screen at lower priority when under load threshold
  - [ ] Must not run under systemic pause
  - [ ] Tests for priority / no request storm

- [ ] Task 2.3: Reading-strip priority ordering
  - [ ] Pure sort helper: prefer top-of-fold + headings when flush is large
  - [ ] Wire into viewport flush path
  - [ ] Unit tests for ordering

- [ ] Task 2.4: Adaptive batch size (opt-in setting)
  - [ ] New `enableAdaptiveBatching` (default off) + pure adaptive budget helper
  - [ ] Rolling latency → effective max group/chars when enabled
  - [ ] AdvancedSection control + tests

- [ ] Task 2.5: Phase 2 verification
  - [ ] Full suite; manual multi-batch article under moderate concurrency

---

## Phase 3: Quality / results

- [ ] Task 3.1: Document term memory
  - [ ] New pure `lib/termMemory.ts` (extract/cap/format)
  - [ ] Inject capped untrusted block into subsequent batch prompts
  - [ ] Unit tests for cap + format + delimiter safety

- [ ] Task 3.2: JSON parse repair + missing-id re-request
  - [ ] Salvage partial maps in parse path
  - [ ] Optional one repair call for missing ids before error UI
  - [ ] Tests for malformed + partial responses

- [ ] Task 3.3: Expand `langDetect` Latin set
  - [ ] Add it / id / nl / ro (or agreed set) with unique signals + stopwords
  - [ ] Confidence threshold regression tests

- [ ] Task 3.4: Optional model-scoped cache key
  - [ ] `cacheKeyIncludesModel` default false
  - [ ] Key generation includes model when on; background passes model id
  - [ ] Advanced UI + unit tests on/off

- [ ] Task 3.5: Category prompt snippets
  - [ ] New `lib/categoryPromptSnippets.ts` static map
  - [ ] Wire into `buildSystemPrompt` when category known
  - [ ] Prompt injection safety (data delimiters) + tests

- [ ] Task 3.6: Quality self-check (opt-in)
  - [ ] Pure heuristics: source-echo / dropped `<z>` tags
  - [ ] One re-prompt when `enableTranslationQualityCheck` on
  - [ ] Default off; tests

- [ ] Task 3.7: Phase 3 verification
  - [ ] Suite + manual term-consistency sample page

---

## Phase 4: Hard problems + reliability + refactor

- [ ] Task 4.1: Mutation dirty markers
  - [ ] Mark walked roots; re-extract only dirty/new subtrees
  - [ ] SPA regression tests

- [ ] Task 4.2: Layout containment (opt-in)
  - [ ] Safer insertion for flex/grid/cards when `enableLayoutContainment`
  - [ ] Default off; styles + display tests

- [ ] Task 4.3: Rich translate on split pieces
  - [ ] Encode per sub-piece or avoid unsafe plain drop on MAX_PIECE_CHARS split
  - [ ] Unit tests for multi-piece / split anchors

- [ ] Task 4.4: Resume identity de-dup
  - [ ] Stronger match key than bare text alone (parent identity + text or local context hash)
  - [ ] Duplicate-paragraph restore tests

- [ ] Task 4.5: Stream / pageContext / glossary parity
  - [ ] Streaming web request carries same context as non-stream
  - [ ] Integration/unit assertion on message shape

- [ ] Task 4.6: characterData thrash guard
  - [ ] Skip re-queue when content key already handled
  - [ ] MutationWatcher / content tests

- [ ] Task 4.7: Shadow DOM walk (opt-in)
  - [ ] Open shadow root descent when `enableShadowDomWalk`; default off
  - [ ] Walker tests with jsdom shadow roots if supported

- [ ] Task 4.8: Split `entrypoints/content.ts` orchestrator
  - [ ] Extract session, stream, resume, status into `content/webTranslate/*` (or similar)
  - [ ] Thin entrypoint; no intentional behavior change
  - [ ] Keep public exports stable; tests guard entrypoints

- [ ] Task 4.9: In-page mini progress / Stop (if gap remains after FR-3)
  - [ ] Count + Stop while translating (complements popup)
  - [ ] Tests for stop → session bump / restore path

- [ ] Task 4.10: Track completion verification
  - [ ] Full `pnpm test`, lint-neutral check, build smoke
  - [ ] Manual matrix: long article, SPA body-swap, rate-limit pause, stream fallback, cache hit, flex/grid page
  - [ ] Confirm Classic preset escape hatch
  - [ ] Confirm subtitle + PDF suites green
  - [ ] Elevate reusable patterns to `conductor/patterns.md`
