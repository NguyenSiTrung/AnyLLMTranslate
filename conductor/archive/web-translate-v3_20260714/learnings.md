# Track Learnings: web-translate-v3_20260714

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md` and predecessor web tracks:

- **Settings triple:** new `ExtensionSettings` fields MUST land in (1) interface, (2) `DEFAULT_SETTINGS`, (3) `extractSettings()` — else store silently drops them. (from: web-bilingual-quality_20260707)
- **deepMerge(DEFAULT_SETTINGS, loaded)** migrates new boolean/number defaults for free; user overrides preserved. Only change *defaults* for Balanced policy carefully.
- **No `innerHTML` with dynamic/model text** — `createElement` + `textContent` / rich decode via createElement. (hardening-fixes)
- **Monotonic session id** (capture at request, re-check at response) drops stale DOM writes after stop/re-start. (bilingual-display-ux)
- **`getCachedTranslation` returns `null` on miss** — guard with `!== null`, not falsy. (cache-hardening)
- **Cache key uses piece `text`**; LLM map uses piece `id` — keep both. (cache-hardening / web-bilingual-quality)
- **Rich translate:** only attach `variables` when single piece per anchor (no sentence split) — multi-piece split currently plain-text; FR-19 of this track reopens that. (web-bilingual-quality)
- **Batch budgets:** `maxTextGroupLengthPerRequest` (4) + `maxTextLengthPerRequest` (2000); `splitPiecesIntoBatches` + `dedupPiecesByText` pure helpers. (web-bilingual-quality)
- **In-article batch split:** `inArticleContext` partitions article vs chrome batches. (web-pipeline-hardening)
- **Body-swap SPA:** second MutationObserver on `documentElement` re-inits translation. (web-pipeline-hardening)
- **Selector-match cache:** `matchesCached` WeakMap for hot-path `.matches()`. (web-pipeline-hardening)
- **Streaming:** port-based SSE with non-stream fallback; web streaming exists but defaulted off (this track flips default). (web-bilingual-quality / pdf-perf-ux)
- **`runWithConcurrency`** in `lib/concurrency.ts` — reuse for parallel sub-batches (FR-7). (providers-ux-refactor)
- **`vi.waitFor` inside `act(async ...)` deadlocks under React 19** — use bounded poll loops. (pdf-perf-ux)
- **Systemic pause:** `ViewportObserver.setPaused` + content `systemicPause` stop scroll storms on pool death; clear on retry/success.
- **Web resume matches by TEXT not piece id** — ids regenerate per extraction; FR-20 strengthens identity beyond bare text. (web-bilingual-quality)
- **Prompt untrusted data:** pageContext fields XML-delimited + length-capped; term memory must follow same pattern. (services/base.ts)
- **Aside caps / body whitelist** were default OFF; this track turns aside caps default ON under Balanced + Classic escape hatch. (web-pipeline-hardening)

## Seeded from similar tracks

- `web-bilingual-quality_20260707` — rich translate, batching, langDetect, failure cache, streaming, resume
- `web-pipeline-hardening_20260708` — body-swap, matches cache, in-article split, whitelist, aside caps

---

<!-- Learnings from implementation will be appended below -->

## [2026-07-14] - Phase 1 Task 1.1: Viewport-aware progress
- **Implemented:** Pure `lib/webTranslateStatus.ts` (compute + format helpers); StatusResponse gains `visiblePending`/`viewportComplete`; content `buildStatusResponse` uses near-viewport geometry; popup shows "Reading area ready · N more as you scroll" when strip idle with remaining work.
- **Files changed:** `lib/webTranslateStatus.ts`, `lib/__tests__/webTranslateStatus.test.ts`, `types/messages.ts`, `entrypoints/content.ts`, `entrypoints/popup/App.tsx`
- **Learnings:**
  - Patterns: Extract status math to pure lib with injectable geometry (`getRect`) for TDD without jsdom IntersectionObserver.
  - Gotchas: Do not keep `status: 'translating'` for off-screen-only remaining work — that freezes the popup spinner forever; use `done` + `viewportComplete` + remaining counts for honest copy.
  - Context: Prior computeStatus treated any untranslated piece as translating; FR-1 deliberately separates reading-strip idle from whole-page complete.
---

## [2026-07-14] - Phase 1 Tasks 1.2–1.7: Defaults, presets, cache, banner
- **Implemented:** Streaming + aside caps default ON; page-scope presets (Classic/Balanced/Main/Full); session settings cache; parallel cache lookup rehydrating original piece fields; sticky systemic-pause banner with Retry/Dismiss/Settings.
- **Files changed:** `types/config.ts`, `lib/pageScopePreset.ts`, `lib/sessionSettingsCache.ts`, `lib/parallelCacheLookup.ts`, `services/background.ts`, `content/autoTranslateNotification.ts`, `styles/inject.css`, `entrypoints/content.ts`, `entrypoints/options/sections/AdvancedSection.tsx`, tests
- **Learnings:**
  - Patterns: Preset detection via pure equality of owned fields → `'custom'` when mixed; Select shows custom option as read-only.
  - Gotchas: `partitionCacheOutcomes` MUST rehydrate from original `message.pieces` or `inArticleContext` is lost and FR-3 batch split breaks.
  - Gotchas: sticky banner Dismiss hides UI but keeps `systemicPause` so scroll does not storm a dead pool; Retry calls `clearSystemicPause`.
  - Context: deepMerge(DEFAULT, stored) migrates missing new defaults for free; explicit false Classic overrides preserved.
---

## [2026-07-14] - Phase 2: Throughput
- **Implemented:** Parallel sub-batches (`runWithConcurrency` cap 3); look-ahead prefetch (one hop, pure candidate select); reading-strip priority sort; opt-in adaptive batching with EMA latency.
- **Files changed:** `services/background.ts`, `lib/concurrency` usage, `lib/readingStripPriority.ts`, `lib/lookaheadPrefetch.ts`, `lib/adaptiveBatching.ts`, content.ts, config/store/AdvancedSection, tests
- **Learnings:**
  - Patterns: Collect per-batch outcomes from concurrent workers then merge — avoid shared mutable arrays during concurrent writes.
  - Gotchas: Look-ahead must pass `isLookahead: true` to prevent recursive whole-page prefetch storms.
  - Context: Adaptive batching stays opt-in (default off); records latency only when enabled.
---

## [2026-07-14] - Phase 3–4: Quality + reliability
- **Implemented:** Term memory, JSON salvage/repair, expanded langDetect, model-scoped cache, category snippets, quality self-check; stream parity; resume parentPath identity; rich split variables; shadow DOM walk; mini progress; dirty walked markers.
- **Learnings:**
  - Patterns: Untrusted prompt blocks always use XML delimiters + strip `<>` from user/page text.
  - Gotchas: Vietnamese unique-letter set must NOT include bare `ă` (Romanian collision); use ơ/ư/đ + tone marks.
  - Gotchas: `cacheTranslation` arity grew (optional modelId) — update test spies with `undefined` 5th arg.
  - Context: Stream port must load settings + glossary itself (content only sends pageContext/termMemory).
---

