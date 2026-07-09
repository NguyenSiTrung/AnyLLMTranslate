# Track Learnings: web-pipeline-hardening_20260708

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md` (full file read at track start; key entries for this track):

- **`@typescript-eslint/no-dynamic-delete`** prohibits `delete obj[key]` — use `Object.fromEntries(Object.entries(obj).filter(...))` instead. (phase1-foundation)
- **WXT layout:** `entrypoints/` for entrypoints; other code at project root (`lib/`, `types/`, `services/`, `content/`). (phase1-foundation)
- **MutationObserver / event listener tests in Vitest/jsdom** require an async event loop tick (`await Promise.resolve()`) to allow handlers to register before asserting results. (linkedin-subtitles)
- **Module-level state persists across test cases** — reset in `beforeEach`. (phase4-launch-ready; hardening-fixes)
- **`requestIdleCallback` with `{ timeout: 2000 }`** prevents starvation while deferring non-critical mutation processing. (phase4-launch-ready)
- **`requestAnimationFrame`-based DOM write batching** via `scheduleDomWrite()`. (phase4-launch-ready)
- **Session guard (monotonic id):** capture at request issue, re-check at response — simplest way to drop stale async writes after a state reset. (bilingual-display-ux)
- **Adding fields to `ExtensionSettings`** requires updating `extractSettings()` in Zustand store AND `DEFAULT_SETTINGS` together. (theme-context; llm-category-detection)
- **Cache read returns `null` on miss** — guard with `!== null`. (cache-hardening)
- **Debounce LRU/Map writes with module-level Map + setTimeout:** Map gives per-key dedup (latest wins), snapshot+clear before async flush prevents races. (cache-hardening)
- **Within-flush text dedup** (`textBatching.ts:83-97`) keeps first occurrence's id as canonical; dup map re-hydrates after translation. (web-bilingual-quality)
- **`maxTextGroupLengthPerRequest` (default 4) / `maxTextLengthPerRequest` (default 2000)** are the two batch budgets; singleton oversized piece becomes its own batch. (web-bilingual-quality)
- **`MAX_CONCURRENT = 3`** semaphore for page/subtitle; `PDF_MAX_CONCURRENT = 2`. (background.ts)
- **Translation session guard** lives as module-level vars in `content.ts` (`translationSession`, `allPieces`, etc.) — NOT in a store. Bumped on every `startTranslation`/`stopTranslation`. (web-bilingual-quality)
- **Translation-piece DOM attribute markers:** `data-anyllm-translated` + `data-anyllm-role="original"` on original; `data-anyllm-piece-id` on translation. `domWalker.shouldSkipElement` rejects already-marked nodes so re-extraction won't pick up injected nodes. (web-bilingual-quality)
- **`MutationWatcher.start(root = document.body)`** observes `{ childList: true, subtree: true, characterData: true }`; re-extracts via `extractDynamicPieces` callback. Debounce `MUTATION_DEBOUNCE_MS = 500` then `requestIdleCallback`. (web-bilingual-quality)
- **`ViewportObserver`** uses `IntersectionObserver` with `rootMargin: '200px'` (`VIEWPORT_MARGIN`), batches pieces every 100ms. (web-bilingual-quality)
- **`isConstrainedContainer`** in `translationDisplay.ts` already caches flex/grid/table detection in a `constrainedCache` WeakMap — a precedent for caching computed-style walks. (bilingual-display-ux)

---

## Implementation Learnings

### Phase 1: FR-2 — Selector-Match Cache
- **WeakMap clear pattern:** WeakMap has no `clear()` method. Use a mutable holder object `{ map: WeakMap }` and swap the inner WeakMap in `__resetMatchCacheForTest` instead of reassigning a `const`.
- **matchesCached invalid-selector handling:** The try/catch for invalid selectors is absorbed into `matchesCached` itself, so callers no longer need their own try/catch around `.matches()`.
- **Cache verification in tests:** To verify the cache works, re-extract the same DOM tree and assert the spy call count is 0 (all cached). The first pass count isn't needed for the assertion.

### Phase 2: FR-3 — In-Article Batch Separation
- **BatchablePiece field preservation:** `dedupPiecesByText` and `splitPiecesIntoBatches` push the original piece objects, so extra fields like `inArticleContext` survive through the pipeline without any code changes in those functions.
- **Background test fetch inspection:** The user message content is `"Translate the following texts...\n\n{json}"`, not raw JSON. Extract the JSON by finding the first `{` in the content string, not by parsing the whole content.
- **Partition after dedup:** Run dedup on ALL uncached pieces first (shared dup map), then partition the deduped array by `inArticleContext`. This ensures duplicates across groups are handled correctly.

### Phase 3: FR-4/FR-5 — Whitelist & Aside Caps
- **Body-tag whitelist scope:** Only check direct children of `<body>` (via `el.parentElement === root && root.tagName === 'BODY'`). Deeper nesting inside allowed tags (e.g., `<nav>` inside `<main>`) is unaffected.
- **Aside caps placement:** Apply caps in `flushPiece` before the sentence-split check, so the per-paragraph cap checks the full text length, not each split part.
- **Per-region tracking:** Use a `Map<Element, number>` keyed by the aside region root element (found via `findAsideRegionRoot`). Reset between extractions (declared inside `extractPieces`).

### Phase 4: FR-1 — Body-Swap Observer
- **MutationObserver timing in jsdom:** Body-swap callback tests need to wait at least `debounceMs + buffer` (e.g., 150ms for a 100ms debounce) for the debounced callback to fire.
- **Body-swap detection:** The second observer on `document.documentElement` checks `addedNodes` for a `<body>` element with a different identity than `lastSeenBody`. `replaceChild` puts the new body in `addedNodes` and the old in `removedNodes`.
- **Re-init safety:** `startTranslation()` already bumps `translationSession++` and tears down old observers before creating new ones, so the body-swap handler just calls `void startTranslation()` — the session guard drops stale writes automatically.
