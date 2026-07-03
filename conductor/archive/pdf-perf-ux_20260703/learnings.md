# Track Learnings: pdf-perf-ux_20260703

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### PDF Viewer (from conductor/patterns.md, lines 378-391)
- **WXT unlisted page directory naming:** `entrypoints/foo.html` + `entrypoints/foo/` triggers "Multiple entrypoints with the same name". Use the directory-only form `entrypoints/foo/index.html` + `entrypoints/foo/index.tsx`.
- **pdfjs-dist v4 worker bundle via Vite `?url`:** `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` — Vite emits the file under `assets/` and returns a runtime URL for `pdfjs.GlobalWorkerOptions.workerSrc`.
- **PDF.js DPI-aware canvas rendering:** `page.getViewport({ scale: cssScale * devicePixelRatio })`, then set `canvas.width/height` to viewport (physical pixels) and `canvas.style.width/height` to CSS-pixel dimensions.
- **IntersectionObserver root must be the scroll pane:** When observing inside a scroll container, using the inner content wrapper as `root` makes every child appear visible. Always use the actual scroll container as the observer `root`.
- **Progressive translation via IntersectionObserver:** Observe page slots inside the scroll pane; translate only when they enter the viewport. Prevents LLM-token storms for long documents.
- **PDF paragraph grouping heuristic:** `page.getTextContent()` returns flat `TextItem`s. Group into lines by `transform[5]` (y) within `Y_TOLERANCE=1.5` PDF units, then into paragraphs by checking the vertical gap between consecutive lines is < `LINE_GAP_FACTOR * lineHeight` (use ~1.6). Rejoin hyphen-terminated line continuations without a space; otherwise insert a single space.
- **Heading detection by page-level median font height:** Compute median `TextItem.height` across all items on a page; paragraphs whose average height is >= 1.4x median are flagged `isHeading`.
- **Chunk translation requests before `chrome.runtime.sendMessage`:** The background `translate` handler forwards each message payload as one provider call. Callers must split uncached paragraphs by `settings.maxBatchChars` and send batches sequentially. Prevents provider request storms.
- **`useRef` to stabilize `useEffect` deps:** When a state value changes frequently but only needs to be read (not trigger effect re-runs), sync it to a ref via a separate `useEffect` and remove the state from the main effect's dependency array.
- **Progressive page proxy streaming:** Set `loadState: 'loaded'` as soon as the PDF document is parsed (before any page proxies are fetched), then stream proxies in small batches (e.g. 3). The pages array uses `PDFPageProxy | null` to represent pending proxies.
- **Canvas virtualization via `useVisiblePages` hook:** Use a separate `IntersectionObserver` on page placeholders with a configurable buffer (default: 2 pages) to track which canvases should be mounted. Off-screen pages use lightweight placeholder divs sized to `page.getViewport()` dimensions.
- **`createSemaphore()` factory for isolated concurrency:** Extract semaphore logic into a factory to enable multiple independent semaphores (e.g., PDF max 2 concurrent vs page/subtitle max 3). Prevents resource starvation across workloads.

### PDF Content Classification & Layout (from conductor/patterns.md, lines 193-199)
- **Rule-based vs LLM classification split:** Pure-math detection (LaTeX delimiters, Unicode-symbol ratio ≥ 0.4) is deterministic and client-side — never needs a network call. Figure/table detection needs an LLM and must fail-open (treat everything as prose on error).
- **Classification belongs inside the orchestration seam (`translateParagraphs`), not the extraction or hook layer** — atomic failure handling, atomic retry, unified source→translated cache.
- **Propagate paragraph `kind` end-to-end, don't rediscover it by text equality.** Carry `kind: prose|math|figure` on `TranslationResultItem` → `paragraphKinds` on `PageTranslations` → renderer.
- **Orthogonal view modes need orthogonal types + storage keys.** `PdfViewMode` is a distinct type living in its own `chrome.storage.local` key (`anyllm-pdf-view-mode`).
- **`useVisiblePages` container-ref switch invariant:** when the left pane unmounts (translation-only mode), the `[data-page-number]` observer must re-target to the right pane.
- **Null-ref guards make conditional pane mounting safe for scroll sync** — `useSynchronizedScroll`'s effect must early-return when `leftRef.current` or `rightRef.current` is null.

### Cache & Persistence (relevant for classification cache + progress persistence)
- `getCachedTranslation` returns `null` on miss (not `undefined`) — guard with `!== null`.
- LLM translates by piece `id` (Map key), but cache reads/writes use piece `text` — retain `text` alongside `id` in uncachedPieces[] for write-back.
- All-cached early return (`if (uncachedPieces.length === 0) return cachedResults`) avoids calling `initService()` entirely.
- `chrome.alarms` persist across MV3 service worker restarts — use them for periodic background tasks (vs `setInterval` which dies with the SW).
- Export scheduling/eviction logic from `services/background.ts`, not from WXT entrypoints — WXT's `defineBackground` is not available in the Vitest jsdom environment.
- Debounce LRU writes with a module-level Map + setTimeout: Map gives per-key dedup (latest wins), snapshot+clear before async flush prevents races.

### Semaphore & Retry (relevant for 429 backoff + look-ahead priority)
- **Semaphore queue holds SemaphoreWaiter objects, not bare resolve closures:** Queue `{ grant, settled }` records. The timeout must set `settled = true` AND remove the exact waiter. Export `__resetSemaphoreForTest` / `__getSemaphoreStateForTest` for deterministic tests.
- Background SW is stateless per-session (tab states in memory Map, recreated on SW restart). Cache is persistent via IndexedDB.

### State Management (relevant for persistence + per-paragraph status)
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged` for cross-context updates.
- Deep merge for nested settings objects — handle separately to avoid losing fields on partial updates.
- `isLoaded` flag in store prevents rendering before storage load completes — critical to avoid flash of defaults.
- Monotonically-bumped session id (captured at request issue, re-checked at response) is the simplest way to drop stale async writes after a state reset.

### Conventions (relevant throughout)
- ESLint 9+ uses flat config (eslint.config.mjs), no `--ext` flag needed.
- `@typescript-eslint/no-dynamic-delete` prohibits `delete obj[key]` — use `Object.fromEntries(Object.entries(obj).filter(...))` instead.
- Comparing objects with `undefined === undefined` evaluates to true in `findIndex` — always verify interface properties (`id`) exist before using them as keys.
- All extension identifiers use `anyllm-` prefix: CSS classes, data attributes, storage keys, postMessage channel, global window flags. Never use the old `lingua*` prefix.
- Use string union types (not enums) for discriminated unions — keeps bundle small and enables exhaustive matching.
- `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup.

---

<!-- Learnings from implementation will be appended below -->

## [2026-07-03 12:00] - Phase 1 Task 1: Page-proxy window eviction
- **Implemented:** `usePdfDocument` now accepts `{ visiblePages?, evictionWindow? }` options. Proxies outside the ±5-page window of the visible set are evicted via `.cleanup()` and re-fetched via `getPage()` on re-entry. App.tsx wires `useVisiblePages` output into `usePdfDocument` for eviction.
- **Files changed:** entrypoints/pdf-viewer/hooks/usePdfDocument.ts, entrypoints/pdf-viewer/App.tsx, entrypoints/pdf-viewer/hooks/__tests__/usePdfDocument.test.ts
- **Commit:** 643402a
- **Learnings:**
  - Pattern: **PDFPageProxy.cleanup() is SYNCHRONOUS** in pdfjs-dist v4 (returns `boolean`, not a Promise). Don't `.catch()` it — wrap in try/catch. (gotcha — wasted a tsc cycle calling `.catch()` on a boolean)
  - Pattern: **Chicken-and-egg hook wiring** — `usePdfDocument` (needs visiblePages for eviction) and `useVisiblePages` (needs numPages from usePdfDocument). Resolution: compute `useVisiblePages` FIRST using `numPagesRef` (previous render's numPages), feed result into `usePdfDocument`. First render: ref is 0 → empty visible set → eviction no-op. This is harmless because eviction only matters after the user scrolls.
  - Pattern: **Eviction is proxy-only; translations are separate.** The pdfTranslation.ts `memoryCache` (and IndexedDB) are independent of pdf.js proxy objects. Evicting a proxy does NOT lose the translation — re-entering the page serves from cache without a new LLM call. This is the key insight making eviction safe.
  - Gotcha: `renderHook` initialProps with `undefined` value narrows the inferred generic prop type to `undefined`, breaking `rerender` with a `Set`. Cast `initialProps` explicitly: `as { visible: Set<number> | undefined }`.
---

## [2026-07-03 13:55] - Phase 1 Task 2: SW keep-alive for PDF sessions
- **Implemented:** PDF viewer registers a session on mount (`REGISTER_PDF_SESSION`), deregisters on unmount. Background arms/clears the existing keep-alive alarm based on the combined subtitle+PDF session count. `chrome.tabs.onRemoved` cleans up PDF sessions.
- **Files changed:** entrypoints/pdf-viewer/lib/pdfSession.ts (new), services/background.ts, types/messages.ts, entrypoints/pdf-viewer/App.tsx, services/__tests__/background.pdfSession.test.ts (new), entrypoints/pdf-viewer/lib/__tests__/pdfSession.test.ts (new)
- **Commit:** af1f909
- **Learnings:**
  - Pattern: **keep-alive alarm is shared across session types** — `clearKeepaliveAlarm` must check ALL session sets (subtitle `activeSessions` AND `pdfSessions`), not just one. A subtitle-only check would clear the alarm while PDF viewers are still open. This is the key fix for multi-feature keep-alive coordination.
  - Pattern: **pure-helper-at-seams for session logic** — `pdfSession.ts` exposes pure `registerPdfSession(sessions, tabId) → new Set` / `unregisterPdfSession` / `shouldArmKeepalive` that operate on an injected `Set<number>`. The background owns the live `Set` + `chrome.alarms` calls; the helpers are the decision logic, fully unit-testable without chrome API mocking (mirrors `getProviderReadiness`, `shouldAutoOpenPdf`).
  - Pattern: **immutable Set updates for React-style equality** — register/unregister return a NEW `Set` (never mutate), so the consumer can detect changes. Though the background uses a mutable `Set` directly (it's not React state), the helpers are kept pure for testability and future React use.
  - Gotcha: **renderHook `result.current` staleness** — asserting `result.current.x` immediately after `await waitFor(...)` can read a stale render snapshot (between committed renders). The robust pattern is to put the assertion INSIDE the `waitFor` callback so it always evaluates against a committed render. This caused ~25% flakiness in usePdfDocument eviction tests until fixed.
  - Gotcha: **`setPages(prev => prev)` (returning same ref) inside an effect can race** with another effect's `setPages(newArray)` under React 19's concurrent rendering in tests. Prefer computing the change from the render closure and only calling `setPages(next)` when there's a real change — never queue a no-op updater from an effect.
---

## [2026-07-03 14:18] - Phase 2 Task 1: SSE streaming translation
- **Implemented:** `translateStream()` on `OpenAICompatibleService` + pool delegation. Pure SSE parser in `lib/sseStreamParser.ts`. Sends `stream:true`, consumes the ReadableStream body, emits completed pieces via callback, finalizes on `[DONE]`.
- **Files changed:** lib/sseStreamParser.ts (new), services/openaiCompatible.ts, services/providerPool.ts, services/base.ts, types/translation.ts, + tests
- **Commit:** 794c533
- **Learnings:**
  - Pattern: **pure parser + real-service integration test split.** The SSE wire-format parsing (event splitting, delta extraction, incremental JSON piece extraction) lives in a pure `lib/` module testable with plain strings. The service test then uses the REAL `OpenAICompatibleService` with a mocked `fetch` returning a `ReadableStream` — the "contract bug" test pattern from provider-pool-resilience. This split means a malformed-stream bug is caught at BOTH layers.
  - Pattern: **incremental JSON piece extraction via regex.** As streaming content accumulates into `{"id1":"partial...`, `extractCompletedPieces(buffer, knownIds)` scans for completed `"id":"value"` pairs (closing quote + comma/brace present) and unescapes them. This enables per-paragraph fill without waiting for the full object. Known IDs are passed in (we know the expected keys from the request), so no heuristic key discovery.
  - Pattern: **optional interface methods for new paradigms.** `translateStream?()` is optional on `TranslationService` — existing backends are unaffected, and the pool falls back to non-streaming `translate()` when a member lacks it (emitting all pieces at once via the callback for a best-effort incremental UX).
  - Gotcha: **test fixture JSON escaping.** A JS single-quoted string `'...\"wörld\"...'` produces `"` not `\"`, yielding invalid JSON. Use `\\"` to embed a literal escaped quote in the JSON the test sends.
  - Pattern: **partial back-fill in streaming too.** If the stream completes some pieces but not all (LLM truncated), missing pieces fall back to original text with `partial:true` — same P2 correctness contract as non-streaming `translate()`.
---

## [2026-07-03 15:38] - Phase 2 Task 3: PDF viewer incremental-fill wiring
- **Implemented:** Port-based streaming protocol (`PDF_STREAM_PORT`) via `chrome.runtime.connect`. Background `initPdfStreamPortListener()` calls `service.translateStream()` and pushes piece deltas through the port. Viewer `sendTranslationBatchStreamed()` opens the port, collects pieces via `onPiece` callback, resolves with final results. `translateParagraphs()` accepts optional `onPiece` callback — tries streaming first, falls back to non-streaming on any port error. `PdfTranslationPane` renders streaming tail spinner when translating with partial paragraphs.
- **Files changed:** types/messages.ts (port message types), services/background.ts (port listener), entrypoints/background.ts (wiring), entrypoints/pdf-viewer/lib/pdfTranslation.ts (sendTranslationBatchStreamed, translateParagraphs onPiece), entrypoints/pdf-viewer/hooks/usePdfPageTranslations.ts (onPiece incremental state updates), entrypoints/pdf-viewer/components/PdfTranslationPane.tsx (streaming tail spinner), + 3 test files (8 new tests)
- **Commit:** (this commit)
- **Learnings:**
  - Pattern: **Port-based streaming for push semantics.** `chrome.runtime.sendMessage` is request/response only — cannot push deltas. Streaming requires `chrome.runtime.connect` port with a custom message protocol (`request` → `piece`* → `done` | `error`). The viewer opens the port, posts the request, and listens for piece/done/error messages.
  - Pattern: **best-effort streaming with non-streaming fallback.** The streaming path is purely a perceived-speed optimization — correctness is guaranteed by the non-streaming fallback. On any port error or disconnect, the viewer discards partial pieces and retries via `sendTranslationBatch()`. The caller's final `setPages` overwrites any intermediate state from `onPiece`.
  - Pattern: **controlled-promise mock for intermediate state verification.** To test React hook intermediate state during async streaming, use a `new Promise(resolve => { resolveHold = resolve })` to hold the mock at the intermediate point. Capture the `onPiece` callback from the mock, call it manually inside `act()`, verify the incremental state, then resolve the hold to complete. Directly calling `onPiece` inside `act()` is more reliable than relying on `waitFor` to catch transient intermediate states.
  - Gotcha: **`mockReset()` needed before `mockImplementation` in nested describes.** The outer `beforeEach` sets `mockResolvedValue([])` on `translateParagraphs`. Simply calling `mockImplementation()` in the test does NOT override it reliably — call `mockReset()` first to clear the default, then set the new implementation. Otherwise the mock may resolve with the default value instead of holding.
  - Gotcha: **`chrome.runtime.connect` not in vitest.setup.ts.** The global chrome mock in `vitest.setup.ts` doesn't include `connect`. Tests that mock it must first check `vi.isMockFunction(chrome.runtime.connect)` and assign `chrome.runtime.connect = vi.fn()` before calling `vi.mocked(chrome.runtime.connect).mockImplementation(...)`.
  - Pattern: **fake port factory for streaming tests.** Create a fake port with `onMessage.addListener` / `onDisconnect.addListener` capturing listeners into arrays, and `postMessage` that emits simulated messages via `setTimeout(0)` when the request is received. This mirrors the real port contract without chrome API complexity.
---

## [2026-07-03 17:03] - Phase 5 Task 1: Font-metrics overlay sizing
- **Implemented:** New `lib/fontMetrics.ts` with canvas `measureText`-based per-word width measurement (`measureWord`), greedy line wrapping (`wrapTextIntoLines`), and box-height computation (`measureBoxHeight`). Per-`(fontFamily, fontSize, word)` cache. The PDF Layout overlay's `estimateBoxHeight` now delegates to `measureBoxHeight`, so translated boxes size correctly on FIRST paint (no collision flash before the reflow effect runs).
- **Files changed:** entrypoints/pdf-viewer/lib/fontMetrics.ts (new), entrypoints/pdf-viewer/lib/__tests__/fontMetrics.test.ts (new, 15 tests), entrypoints/pdf-viewer/components/PdfTranslationPane.tsx (estimateBoxHeight → measureBoxHeight delegation + LAYOUT_BOX_FONT_FAMILY constant), entrypoints/pdf-viewer/components/__tests__/PdfTranslationPane.test.tsx (2 new integration tests)
- **Commit:** 9a208ca
- **Learnings:**
  - Pattern: **canvas measureText for accurate pre-paint geometry.** The PDF Layout overlay previously used a `chars × avgCharWidth` heuristic (fontSize×0.5), which under-counted wrapped lines for wide fonts / CJK, causing first-paint collisions fixed only by the post-paint `getBoundingClientRect` reflow. Canvas `measureText` gives real per-word widths (kerning, glyph metrics) so the pre-paint estimate matches the final layout — no collision flash, no layout-thrash. The reflow effect still wins in real browsers (sub-pixel rounding + CSS the metrics helper doesn't model), but now the estimate is a genuinely accurate floor, not a crude guess.
  - Pattern: **defensive context capability check.** `getMeasureCtx` must return `null` not just when `getContext('2d')` returns null, but also when the returned context lacks `measureText`. The existing PdfCanvasRenderer test mocks `getContext → {}` (an empty object for canvas rendering), which would crash `ctx.measureText(...)`. Checking `typeof candidate.measureText !== 'function'` and falling back to the heuristic handles this robustly — production-safe (any weird environment) and test-compatible.
  - Pattern: **module-level cache reset for tests.** The word-width cache + the lazily-created canvas/context are module-level (persist across calls within a session — the hot-path optimization). `clearFontMetricsCache()` must reset ALL of them (cache + canvas + ctx + currentCtxFont), not just the word cache, so tests swapping `getContext` mocks get a fresh context on the next call.
  - Gotcha: **verbatim-paragraph filter in LayoutOverlay.** Boxes where `translatedText.trim() === para.text.trim()` are filtered out (math/figure/OCR verbatim). When writing component tests with short single-char translated text, ensure the translated text differs from the original or the box won't render. This caused a confusing "only 1 of 2 boxes rendered" failure.
  - Pattern: **font family constant must match CSS.** `LAYOUT_BOX_FONT_FAMILY` in the component must exactly mirror the inherited font stack on `.pdf-viewer-root` in style.css (`'Inter', -apple-system, ...`). If they drift, measureText uses a different font than the rendered text and the heights won't match.
---

## [2026-07-03 17:15] - Phase 5 Task 3: Download queue progress + cancel
- **Implemented:** `usePdfDownload` now reports total page count (already-translated + to-translate) in the progress message; skips `translateAllPages` entirely when nothing needs translation; withholds the abort signal from `generateTranslatedPdf` so a cancel during the generation stage lets in-flight pdf-lib work complete gracefully (no corrupted partial writes).
- **Files changed:** entrypoints/pdf-viewer/hooks/usePdfDownload.ts, entrypoints/pdf-viewer/hooks/__tests__/usePdfDownload.test.ts (5 new), entrypoints/pdf-viewer/components/__tests__/DownloadProgressModal.test.tsx (2 new)
- **Commit:** 621f26d
- **Learnings:**
  - Pattern: **graceful generation-stage cancel.** pdf-lib generation is not safely interruptible mid-page (partial writes corrupt the output PDF), so the abort signal must NOT be passed to `generateTranslatedPdf`. Instead, withhold `signal: undefined` and let in-flight generation complete; the post-generation `controller.signal.aborted` check ensures a cancelled job never triggers the browser download or shows a spurious 'done' state. This is the "queue-cancel cancels pending without aborting in-flight mid-generation" requirement.
  - Gotcha: **`vi.waitFor` inside `act(async ...)` deadlocks (confirmed again).** The generating-stage cancel test hung because `vi.waitFor` inside `act(async)` defers effect flushing until the awaited promise settles, creating a cycle. Replaced with a manual bounded poll loop (`for (let i = 0; i < 50; i++) { if (stage === 'generating') break; await new Promise(r => setTimeout(r, 10)); }`). This matches the same gotcha noted in Section 2's streaming tests.
  - Pattern: **skip-stage optimization.** When `untranslatedCount === 0`, skip the `translateAllPages` call entirely (return an inline `{translations: new Map(existing), failedPages: [], errors: new Map()}`) so the pipeline jumps straight to the font/generation stages. Avoids a needless async round-trip and lets `translateAllPages` be tested independently of the "all cached" path.
---

## [2026-07-03 17:20] - Phase 5 Task 2: Bilingual view mode
- **Implemented:** Third PDF view mode `'bilingual'` alongside split/translation-only. Single-column layout where each paragraph's original text renders directly above its translation (focused-reading equivalent of the web-page bilingual-below theme). New `BilingualView` component; persisted via the existing `anyllm-pdf-view-mode` storage key.
- **Files changed:** lib/constants.ts (PdfViewMode union + PDF_PROGRESS key), entrypoints/pdf-viewer/lib/pdfViewMode.ts (VALID list), entrypoints/pdf-viewer/components/ViewerLayout.tsx (isSingleColumn/paneLabel helpers), entrypoints/pdf-viewer/components/PdfTranslationPane.tsx (BilingualView + viewMode branch), entrypoints/pdf-viewer/App.tsx (toggle button + pane wiring), entrypoints/pdf-viewer/style.css (bilingual classes), + 3 test files (8 new tests)
- **Commit:** eca63fd
- **Learnings:**
  - Pattern: **view-mode helpers over inline conditionals.** `isSingleColumn(mode)` and `paneLabel(mode)` extract the "which modes collapse to single column" and "what label does the right pane get" decisions. Both translation-only AND bilingual are single-column; only split is two-pane. Centralizing this in helpers keeps ViewerLayout readable and makes adding a future 4th mode a one-line change.
  - Pattern: **verbatim-paragraph skip in bilingual too.** When `translatedText.trim() === para.text.trim()` (math/figure/OCR kept verbatim), the bilingual view shows ONLY the original — no redundant identical translation beneath. Same filter as LayoutOverlay, applied per-paragraph.
  - Pattern: **orphan-translation fallback.** Defensive: if `page.paragraphs` has entries with no matching `originalParagraphs` (e.g. older cached state missing originals), render them as translation-only rows rather than dropping them. `seenIds` Set tracks which paragraph ids already rendered with their original.
  - Pattern: **visibility container retarget invariant extends to bilingual.** `useVisiblePages`'s container ref must point to the RIGHT pane (not left) whenever the left pane unmounts. This was already true for translation-only; bilingual needs the same `viewMode === 'translation-only' || viewMode === 'bilingual'` guard. Missing it would leave Layout-overlay canvases un-virtualized in bilingual mode.
---

## [2026-07-03 17:30] - Phase 6 Task 1: Persist page-state Map across reloads
- **Implemented:** New `lib/pdfProgressStore.ts` persists the per-page translation state Map to `chrome.storage.local` keyed by an FNV-1a context hash (pdfUrl + source/target lang + provider id + model). `usePdfPageTranslations` hydrates on mount and write-throughs terminal states. A hydration guard prevents the write-through from racing ahead of the initial load.
- **Files changed:** lib/constants.ts (PDF_PROGRESS storage key), entrypoints/pdf-viewer/lib/pdfProgressStore.ts (new), entrypoints/pdf-viewer/lib/__tests__/pdfProgressStore.test.ts (new, 12 tests), entrypoints/pdf-viewer/hooks/usePdfPageTranslations.ts (hydrate + write-through), entrypoints/pdf-viewer/hooks/__tests__/usePdfPageTranslations.test.tsx (4 new tests)
- **Commit:** (this section)
- **Learnings:**
  - Pattern: **FNV-1a context hash for invalidation.** A simple 32-bit FNV-1a hash over `pdfUrl \u0001 sourceLang \u0001 targetLang \u0001 provider \u0001 model` is fast, dependency-free, and collision-resistant enough for the small key space a single user produces. Any provider/model/lang change produces a different hash so stale progress is never served. The dimensions mirror the translation-cache key dimensions so a context change invalidates BOTH caches together.
  - Pattern: **persist terminal states only.** Only `translated` and `error` pages are serialized — in-flight `translating` pages are incomplete and would show stale loading spinners or missing content on reload. The `serializePages` filter enforces this at the store boundary.
  - Pattern: **hydration guard for write-through.** A `hydratedRef` boolean (set in the hydrate effect's `.finally`) prevents the write-through effect from firing before hydration completes — otherwise the initial empty-pages render would clobber stored progress with an empty snapshot. The write-through also skips when `progressHashRef.current` is null (settings load failed).
  - Pattern: **defensive shape validation on load.** `isValidProgressMap` checks `state` is one of the terminal values and `paragraphs` is an array before deserializing. Malformed JSON, wrong shape, or storage failure all return `null` → caller re-translates. A corrupt entry can NEVER break the viewer.
  - Gotcha: **`PoolProvider` has no `preset` field.** The active-provider identity for the hash uses `id@baseUrl` (PoolProvider fields), NOT `preset@baseUrl` (ProviderConfig legacy field). `PoolProvider.id` is the stable unique identifier.
  - Pattern: **single storage key + nested object.** One `chrome.storage.local` key (`anyllm-pdf-progress`) holds `{ hash: serializedPages }`. Using one key (not one per document) keeps storage predictable and makes bulk invalidation trivial. `clearPdfProgress` rebuilds without the cleared hash (no-dynamic-delete compliant).
---
