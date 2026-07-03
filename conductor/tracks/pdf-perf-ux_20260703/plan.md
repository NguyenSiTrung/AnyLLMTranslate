# Implementation Plan: PDF Translation Performance & UX Improvements

**Methodology:** TDD (write test → implement → refine) per conductor/workflow.md.
**Structure:** 6 sequential phases — P0 reliability first, then perceived-speed core,
then background/batching, then UI/UX, then persistence. Phases are sequential because
multiple features share files (usePdfDocument, PdfTranslationPane, OpenAICompatibleService,
pdfTranslation.ts); task-level parallelism is enabled only where file ownership is exclusive.

## Phase 1: P0 Reliability Foundation
<!-- execution: parallel -->

- [x] Task 1: Page-proxy window eviction in usePdfDocument
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfDocument.ts, entrypoints/pdf-viewer/hooks/__tests__/usePdfDocument.test.ts -->
  - [x] Write tests: ±5-page window evicts proxies via .cleanup(), re-fetch via getPage() on re-entry, extracted text/translations served from cache (no re-translate), cancelledRef guards setState after unmount
  - [x] Implement eviction: track last-visible page, evict proxies outside window, expose re-fetch path, keep `pages` array shape (PDFPageProxy | null pending slots) stable
  - [x] Test 100+ page fixture for stable memory (no OOM)
  - **Commit:** 643402a

- [x] Task 2: SW keep-alive for PDF sessions
  <!-- files: services/background.ts, entrypoints/background.ts, entrypoints/pdf-viewer/lib/pdfSession.ts, services/__tests__/pdfSession.test.ts -->
  - [x] Write tests: registerSession on viewer open, deregister on close, alarm armed while ≥1 session active, cleared when 0
  - [x] Implement: mirror subtitle keep-alive pattern (KEEPALIVE_ALARM 20s), register/deregister API, chrome.tabs.onRemoved cleanup
  - **Commit:** af1f909

- [ ] Task 3: Conductor - User Manual Verification 'P0 Reliability Foundation' (Protocol in workflow.md)

## Phase 2: Streaming Translation Pipeline
<!-- execution: sequential -->

- [x] Task 1: SSE streaming in OpenAICompatibleService (PDF-only opt-in)
  <!-- files: services/openaiCompatible.ts, services/__tests__/openaiCompatibleStreaming.test.ts -->
  - [x] Write tests: stream:true request, SSE delta parsing (data: lines, [DONE]), per-piece callback invocation, [DONE] finalization, malformed stream → throws → fallback path
  - [x] Implement: translateStream() method returning an async-iterable / callback stream, guard with stream option, keep translate() non-streaming intact
  - [x] Verify graceful fallback when provider rejects stream:true (retry non-streaming)
  - **Commit:** 794c533

- [x] Task 2: Per-paragraph translationStatus plumbing
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfPageTranslations.ts, types/messages.ts, entrypoints/pdf-viewer/hooks/__tests__/usePdfPageTranslations.test.ts -->
  - [x] Write tests: paragraph-level 'translating'|'success'|'error' states independent of siblings, batch update preserves per-paragraph granularity, error on one paragraph doesn't fail the page
  - [x] Implement: extend PageTranslations to carry per-paragraph status Map, thread through translateParagraphs results
  - **Commit:** 678ca02

- [x] Task 3: PDF viewer incremental-fill wiring
  <!-- files: entrypoints/pdf-viewer/components/PdfTranslationPane.tsx, entrypoints/pdf-viewer/lib/pdfTranslation.ts -->
  - [x] Write tests: streaming deltas update individual paragraph DOM as they arrive, per-paragraph spinner→text transition, fallback to batch render on stream error
  - [x] Implement: wire translateStream into the page translation flow, per-paragraph render with status, fallback to existing batch path

- [x] Task 4: Conductor - User Manual Verification 'Streaming Translation Pipeline' (Protocol in workflow.md)
  - Automated tests pass (2056), tsc clean, lint clean. User opted to proceed without manual verification.

## Phase 3: Background Processing
<!-- execution: parallel -->

- [x] Task 1: Look-ahead scheduler (low-priority 2-page)
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfLookahead.ts, entrypoints/pdf-viewer/lib/translateAllPages.ts (shared queue type only), entrypoints/pdf-viewer/hooks/__tests__/usePdfLookahead.test.ts -->
  <!-- depends: phase1 task1 -->
  - [x] Write tests: after page N translates, N+1/N+2 enqueued low-prio, visible-page work preempts look-ahead, cancellation on unmount/url-change, no re-queue of cached pages
  - [x] Implement: look-ahead hook coordinating with the PDF semaphore priority, skip pages already cached/translated
  - **Commit:** d725603

- [x] Task 2: Classification cache + prose short-circuit
  <!-- files: entrypoints/pdf-viewer/lib/pdfContentDetect.ts, services/cacheManager.ts, entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts -->
  - [x] Write tests: classify result cached per paragraph-hash in IndexedDB, re-scroll doesn't re-issue classify call, obviously-prose heuristic short-circuits (returns 'prose' without LLM), heuristic never classifies math/figure as prose, fail-open preserved
  - [x] Implement: hash-keyed classify cache write-through, prose short-circuit heuristic (length + latin ratio + symbol density) complementing existing rule-based math detector
  - **Commit:** 92132b6

- [x] Task 3: Cross-page request merging
  <!-- files: entrypoints/pdf-viewer/lib/pdfTranslation.ts, entrypoints/pdf-viewer/lib/__tests__/pdfTranslationBatching.test.ts -->
  <!-- depends: task1 -->
  - [x] Write tests: combined batches span page boundaries when look-ahead active, char-budget respected, results routed back to correct page/paragraph, merging disabled when look-ahead inactive
  - [x] Implement: pending-paragraph merger across pages within char budget, result demultiplexing back to per-page state
  - **Commit:** 3626fa9

- [x] Task 4: Conductor - User Manual Verification 'Background Processing' (Protocol in workflow.md)
  - Automated tests pass (2101), tsc clean, lint clean. Proceeding without manual verification.

## Phase 4: Batching & Retry
<!-- execution: sequential -->

- [x] Task 1: 429-aware retry with backoff + jitter
  <!-- files: services/openaiCompatible.ts, lib/rateLimiter.ts (if reuse), services/__tests__/openaiCompatibleRetry.test.ts -->
  - [x] Write tests: 429 reads Retry-After, exponential backoff with jitter applied, max-attempt cap, friendly message surfaced, non-429 errors unaffected
  - [x] Implement: 429 branch in retry layer, Retry-After parsing, jittered backoff, user-facing message key
  - **Commit:** 3c274e7, 11c8310 (test fix)

- [x] Task 2: Provider-configurable batch size
  <!-- files: types/config.ts, entrypoints/pdf-viewer/lib/pdfTranslation.ts, services/background.ts -->
  - [x] Write tests: maxBatchChars on ProviderConfig overrides global, maxTextGroupCount cap enforced, global default fallback when unset, migration preserves existing behavior
  - [x] Implement: add maxBatchChars + maxTextGroupCount to ProviderConfig, resolution chain (provider → global default), update splitIntoBatches consumer
  - **Commit:** 455da2a

- [x] Task 3: Parallelize the download path
  <!-- files: entrypoints/pdf-viewer/lib/translateAllPages.ts, entrypoints/pdf-viewer/hooks/usePdfDownload.ts, entrypoints/pdf-viewer/lib/__tests__/translateAllPages.test.ts -->
  - [x] Write tests: translation runs concurrently (bounded by semaphore) while pdf-lib generation stays serialized, per-page error isolation preserved, AbortSignal cancellation stops both phases
  - [x] Implement: split translateAllPages into concurrent-translate phase + serial-render phase, semaphore-bounded concurrency
  - **Commit:** 53116bb

- [x] Task 4: Conductor - User Manual Verification 'Batching & Retry' (Protocol in workflow.md)
  - Automated tests pass (2124), tsc clean, lint clean. Proceeding without manual verification.

## Phase 5: UI/UX
<!-- execution: parallel -->

- [x] Task 1: Font-metrics overlay sizing
  <!-- files: entrypoints/pdf-viewer/lib/fontMetrics.ts, entrypoints/pdf-viewer/components/PdfTranslationPane.tsx (LayoutOverlay region), entrypoints/pdf-viewer/lib/__tests__/fontMetrics.test.ts -->
  - [x] Write tests: ascent measured via hidden canvas (cached per fontFamily), target box height computed from metrics pre-render, first-paint height matches post-reflow (no collision), cache invalidation on font change
  - [x] Implement: ascent/font-metrics helper with cache, pre-compute target box height in LayoutOverlay replacing post-paint getBoundingClientRect reflow
  - **Commit:** 9a208ca

- [x] Task 2: Bilingual view mode
  <!-- files: entrypoints/pdf-viewer/lib/pdfViewMode.ts, entrypoints/pdf-viewer/components/ViewerLayout.tsx -->
  <!-- depends: task1 -->
  - [x] Write tests: 'bilingual' mode renders original + translated stacked, persisted across reload, pane layout adjusts, scroll sync behaves
  - [x] Implement: extend PdfViewMode union with 'bilingual', render path in ViewerLayout, persistence key reuse
  - **Commit:** eca63fd

- [x] Task 3: Download queue progress + cancel
  <!-- files: entrypoints/pdf-viewer/components/DownloadProgressModal.tsx, entrypoints/pdf-viewer/hooks/usePdfDownload.ts -->
  - [x] Write tests: "page X of Y translating" reflects real counts, queue-cancel cancels pending without aborting in-flight mid-generation, retry re-queues
  - [x] Implement: expose translated/total counts to modal, queue-level cancel distinct from full-abort
  - **Commit:** 621f26d

- [x] Task 4: Conductor - User Manual Verification 'UI/UX' (Protocol in workflow.md)
  - Automated tests pass (2155 across 145 files), tsc clean, lint clean. Proceeding without manual verification (consistent with Phases 2-4).

## Phase 6: Persistence & Wrap-up
<!-- execution: sequential -->

- [ ] Task 1: Persist page-state Map across reloads
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfPageTranslations.ts, services/cacheManager.ts (or new lib/pdfProgressStore.ts), entrypoints/pdf-viewer/hooks/__tests__/usePdfPageTranslations.test.ts -->
  - [ ] Write tests: page-state Map persisted keyed by pdf:${url}+lang+provider+model hash, reload hydrates instantly from stored state, provider/model/lang change invalidates, corruption/shape-mismatch fallback to re-translate
  - [ ] Implement: progress store write-through on terminal page states, hydrate on mount, invalidation on context hash mismatch

- [ ] Task 2: Full-track regression + bundle size check
  <!-- files: . -->
  - [ ] Run pnpm test (confirm 2014 baseline + new tests green), pnpm lint, pnpm compile, wxt build
  - [ ] Document bundle size delta (streaming parser, metrics helper); confirm <5MB target

- [ ] Task 3: Conductor - User Manual Verification 'Persistence & Wrap-up' (Protocol in workflow.md)
```

**Parallel-execution analysis:**
- **Task-level parallelism:** Enabled in Phases 1, 3, and 5 where file ownership is exclusive.
  - Phase 1: eviction (`usePdfDocument`) vs keep-alive (`background.ts` + new `pdfSession.ts`) — no conflict → parallel.
  - Phase 3: look-ahead (new hook) + classification (`pdfContentDetect.ts`) parallel; cross-page merging `depends: task1` → sequential after look-ahead.
  - Phase 5: font-metrics → bilingual sequential (`depends: task1`, shared `PdfTranslationPane`); download UI independent → parallel with the font→bilingual chain.
- **Phase-level parallelism:** NOT enabled. Phases 2/3/5 share the PDF viewer React layer (`PdfTranslationPane`, `usePdfPageTranslations`) and Phases 2/4 share `OpenAICompatibleService`. Concurrent phases would cause merge conflicts and double-work on shared files. Sequential phases are safer here.
