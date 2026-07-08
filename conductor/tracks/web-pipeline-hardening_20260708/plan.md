# Plan — Bilingual Page-Translation Pipeline Hardening v2

Track: `web-pipeline-hardening_20260708`
Branch: `feat/web-pipeline-hardening_20260708`

## Phase 1: FR-2 — Selector-Match Cache (foundation perf)
<!-- execution: sequential -->
<!-- depends: -->

Foundational optimization; must land first since it restructures how domWalker calls `.matches()`, and Phases 2–3 extend that same file.

- [x] Task 1.1: Create pure memoized match helper
  <!-- files: lib/domUtils.ts, lib/__tests__/domUtils.test.ts -->
  - Write test first: a `matchesCached(el, selector)` that returns `el.matches(selector)`, caches in `WeakMap<Element, Map<string, boolean>>`; second call with same args must NOT re-invoke underlying `.matches()` (verify via spy on a wrapper).
  - Implement `lib/domUtils.ts` exporting `matchesCached` + `__resetMatchCacheForTest`.
  - AAA tests; cover true/false/null-element paths.

- [x] Task 1.2: Wire cache into domWalker shouldSkipElement
  <!-- files: content/domWalker.ts, content/__tests__/domWalker.test.ts -->
  - Test: walking a tree with many exclude-selector matches calls the underlying matcher fewer times than nodes (use a counting spy).
  - Replace bare `element.matches(selector)` at `domWalker.ts:53` with `matchesCached(element, selector)`.
  - No behavior change for existing domWalker tests (regression assertion).

- [x] Task: Conductor - User Manual Verification 'Selector-Match Cache' (Protocol in workflow.md)

## Phase 2: FR-3 — In-Article vs Out-of-Article Batch Separation
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 2.1: Add inArticleContext field + classifier
  <!-- files: types/translation.ts, content/domWalker.ts, content/__tests__/domWalker.test.ts -->
  - Test first: `classifyInArticle(element)` returns true when nearest block ancestor is `<article>`/`<main>`/`[role=main]`/`#main`/`#content`/`#primary`; false for `<nav>`/`<aside>` roots.
  - Add `inArticleContext?: boolean` to `TranslationPiece` type.
  - Set the flag inside `flushPiece` using the classifier.

- [x] Task 2.2: Partition batches in background by inArticleContext
  <!-- files: lib/textBatching.ts, services/background.ts, services/__tests__/background.translate.test.ts -->
  - Test first: a `handleTranslate` payload with mixed in/out pieces produces TWO service.translate calls (one per group), each group's pieces respect `maxTextGroupLengthPerRequest`/`maxTextLengthPerRequest`.
  - In `handleTranslate`, partition `uncachedPieces` into `inArticle` / `outOfArticle`; run the dedup+split+per-batch loop once per group; merge results for cache-write + response.
  - Negative cache + dedup re-hydration must work across both groups (shared dup map keyed by text).

- [x] Task 2.3: Carry inArticleContext over the message round-trip
  <!-- files: entrypoints/content.ts, types/messages.ts (if present) -->
  - Verify the field serializes in the `translatePieces` → background message; add/adjust type.
  - Regression test: streamed + non-streamed paths still render identical output regardless of flag.

- [x] Task: Conductor - User Manual Verification 'In-Article Batch Separation' (Protocol in workflow.md)

## Phase 3: FR-4 + FR-5 — Body-Tag Whitelist & Aside Caps (opt-in)
<!-- execution: sequential -->
<!-- depends: phase2 -->

Both add opt-in settings and edit domWalker; bundled into one phase.

- [x] Task 3.1: Add settings + constants
  <!-- files: types/config.ts, lib/constants.ts, stores/settingsStore.ts -->
  - Add `enableBodyTagWhitelist: boolean` (default false), `enableAsideCaps: boolean` (default false) to `ExtensionSettings` + `DEFAULT_SETTINGS`.
  - Add `BODY_TRANSLATE_TAGS` whitelist (`MAIN`, `ARTICLE`, `SECTION`, `DIV`) and `ASIDE_MAX_TEXT_PER_PARAGRAPH=67`, `ASIDE_MAX_TEXT_PER_REGION=1000` to `lib/constants.ts`.
  - Update `extractSettings()` in the store.
  - Test: defaults round-trip; explicit on persists.

- [ ] Task 3.2: Whitelist early-exit in extraction
  <!-- files: content/domWalker.ts, content/__tests__/domWalker.test.ts -->
  - Test first: with whitelist ON, direct-child `<nav>`/`<aside>` under `<body>` are NOT descended into (assert no pieces produced from them); with OFF, behavior unchanged.
  - Gate: only applies to DIRECT children of `<body>`; deeper nesting unaffected.

- [ ] Task 3.3: Aside-region caps in extraction
  <!-- files: content/domWalker.ts, content/__tests__/domWalker.test.ts -->
  - Test first: with caps ON, an `<aside>` with 40 short links produces at most the per-region char cap worth of pieces, and any single paragraph over the per-paragraph cap is dropped; with OFF, all translate.
  - Track per-region cumulative chars in a Map keyed by region root; reset between extractions.

- [ ] Task 3.4: Options → Advanced toggles
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx -->
  - Test first: two new toggles appear under a "Page Walk Tuning" subgroup; default OFF; flipping calls settings update.
  - Reuse existing Toggle + FieldGroup primitives; follow the `useDeferredCommit` pattern if applicable.

- [ ] Task: Conductor - User Manual Verification 'Whitelist & Aside Caps' (Protocol in workflow.md)

## Phase 4: FR-1 — Body-Swap Observer (parallel-capable)
<!-- execution: sequential -->
<!-- depends: -->

Independent of Phases 1–3 (different files). Safe to run concurrently with Phase 1.

- [ ] Task 4.1: Body-swap detector in MutationWatcher
  <!-- files: content/mutationWatcher.ts, content/__tests__/mutationWatcher.test.ts -->
  - Test first (jsdom): create a watcher, replace `document.body` with a new `<body>` node; assert the `onBodySwapped` callback fires exactly once and NOT for unrelated mutations.
  - Add a second internal observer on `document.documentElement` `{ childList: true }`; detect a new `<body>` by identity (different node than the last-seen body) OR a body re-added after removal.
  - Debounce via existing debounce primitive; guard same-identity double-fire.
  - Tear down both observers in `stop()`.

- [ ] Task 4.2: Wire re-init into content orchestration
  <!-- files: entrypoints/content.ts, entrypoints/__tests__/content.test.ts (if present) -->
  - In `startTranslation`, pass an `onBodySwapped` handler that calls `startTranslation()` again (re-extract on the new body); honor the session guard so stale pre-swap writes are dropped.
  - Ensure the swap handler is unregistered in `stopTranslation`.

- [ ] Task: Conductor - User Manual Verification 'Body-Swap Observer' (Protocol in workflow.md)
