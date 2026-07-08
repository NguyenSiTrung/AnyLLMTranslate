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

<!-- Learnings from implementation will be appended below -->
