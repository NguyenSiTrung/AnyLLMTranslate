# Track: PDF Translation Performance & UX Improvements

## Overview

Improve the PDF viewer translation pipeline across four areas — performance,
background processing, batching, and UI/UX — based on a comparative analysis of
the current implementation against the ImmersiveTranslate reference. The viewer
is already architecturally strong (local extension page, dedicated PDF semaphore,
math/classify step); this track closes concrete gaps in perceived speed, large-PDF
reliability, and reading UX.

**Approach decisions (confirmed):**
- Streaming: PDF-only first (isolated new path; non-streaming stays as fallback)
- Eviction: Window-based (±5 pages around viewport; re-fetch via getPage())
- Structure: One phased track, P0 reliability/perf first

**Look-ahead:** low-priority 2-page (best perceived-speed/complexity tradeoff vs
whole-document background which burns tokens, vs no-look-ahead which squanders
the streaming work).

**Classification:** cache + short-circuit (caching helps re-visits, short-circuit
helps first visit; together they cover both, complementing the existing rule-based
math detector pattern).

**Persistence:** persist progress (right long-term call; pairs with look-ahead
lifecycle; keyed on url+lang+provider+model hash to avoid staleness; final phase
so it can be dropped if the track runs long).

## Functional Requirements

### Performance
1. **Streaming translation (PDF-only).** The PDF viewer receives translated text
   incrementally via SSE; paragraphs fill in as deltas arrive instead of blocking
   on the full batch response. Non-streaming path remains the fallback for
   providers that don't support `stream: true`, parse errors, and SW-restart edge
   cases. Toggled via an option on the translate message, not a global default.
2. **Per-paragraph translation status.** Each paragraph tracks
   `translationStatus: 'translating' | 'success' | 'error'` (currently page-level
   only). Combined with streaming, paragraphs appear and finalize one-by-one.
3. **Page-proxy eviction for large documents.** `usePdfDocument` evicts pdf.js
   page proxies outside a window (±5 pages around the viewport) and re-fetches via
   `doc.getPage()` on demand. Extracted text + translations remain cached so
   re-entering an evicted page is cheap. Directly fixes OOM risk on 100+ page PDFs.
4. **429-aware retry with backoff + jitter.** On HTTP 429, read `Retry-After`,
   apply exponential backoff with jitter, and surface a friendly per-provider
   message via the existing per-page/per-paragraph error UI.
5. **Classification cache + short-circuit.** Cache `prose|figure|math` decisions
   per paragraph-hash in IndexedDB (alongside translations). Additionally skip the
   LLM classification call for obviously-prose paragraphs (long, latin-heavy, low
   symbol density) via a deterministic heuristic that complements the existing
   rule-based math detector. Fail-open behavior preserved.

### Background
6. **Low-priority 2-page look-ahead.** Once a page finishes translating, enqueue
   extraction + translation for pages N+1/N+2 at low priority via the existing PDF
   semaphore queue. Look-ahead never blocks visible-page work (priority yielding).
7. **SW keep-alive for PDF sessions.** Register a "pdf session" when a viewer tab
   is open (mirroring the subtitle keep-alive alarm), deregister on close. Prevents
   mid-page SW eviction on long content-heavy pages.
8. **Persist translation progress across reloads.** Persist the page-state Map
   (`pageNumber → state + paragraph translations`) keyed by `pdf:${url}` +
   `lang + provider + model` hash to IndexedDB. On reload, hydrate instantly from
   cache + stored state. Invalidate on provider/model/lang mismatch.

### Batching
9. **Cross-page request merging.** When look-ahead is active, merge pending
   paragraphs across page boundaries into combined batches up to the char budget.
   One translate call covering tail-of-page-N + head-of-page-N+1.
10. **Provider-configurable batch size.** Move `maxBatchChars` (and add
    `maxTextGroupCount`) onto provider config. Cheap local/self-hosted models get
    larger batches; rate-limited APIs get smaller ones. Global default preserved
    as fallback.
11. **Parallelize the download path.** `translateAllPages` currently translates
    one page at a time. Separate rendering (must stay serialized on the render
    semaphore) from translation (concurrent), pre-translating all text
    concurrently before serializing only the pdf-lib generation step.

### UI/UX
12. **Font-metrics-based overlay sizing.** Add an ascent/font-metrics helper
    (measure in a hidden canvas/span, cached) so translated boxes in Layout
    overlay mode are sized correctly on first paint instead of post-reflowed —
    fewer collisions, less layout thrash.
13. **Optional bilingual view mode.** Add a `bilingual` view mode alongside
    `split` / `translation-only` (persisted via the existing pdfViewMode seam).
    Render original + translated paragraphs stacked.
14. **Visible queue/cancel state for downloads.** `DownloadProgressModal` shows
    "page X of Y translating" with a real count and exposes cancel of the queue
    (not just the whole job).

## Non-Functional Requirements

- No regression to the 2014-test baseline; new tests added per feature.
- PDF streaming path must degrade gracefully to non-streaming on any error.
- Eviction must not introduce visible re-fetch latency for cached pages
  (extracted text + translations come from cache, not re-translation).
- Look-ahead must be cancellable and must never starve visible-page work.
- `tsc` clean for project source; `pnpm lint` introduces zero new errors in
  project source.
- Bundle size impact documented (streaming SSE parser, metrics helper).

## Acceptance Criteria

- [ ] Streaming: a content-heavy PDF page shows paragraphs filling in
      incrementally; non-streaming fallback verified for a provider that rejects
      `stream: true`.
- [ ] Per-paragraph status: each paragraph shows its own loading/success/error
      indicator independent of sibling paragraphs.
- [ ] Eviction: a 100+ page PDF loads without OOM; scrolling back to an evicted
      page re-translates from cache (no LLM call) and renders within ~200ms.
- [ ] 429 backoff: a rate-limited provider backs off with jitter and surfaces a
      friendly message instead of hard-failing.
- [ ] Classification cache: re-scrolling a page does not re-issue the classify
      LLM call; obviously-prose paragraphs skip classification on first pass.
- [ ] Look-ahead: after page N translates, pages N+1/N+2 are pre-translated by
      the time the user scrolls to them (verified via cache hit on scroll-in).
- [ ] SW keep-alive: a long PDF page does not lose mid-flight translation on SW
      eviction.
- [ ] Persistence: close + reopen a translated PDF → pages hydrate instantly
      from stored state; changing provider/model/lang invalidates correctly.
- [ ] Cross-page batching: combined batches observed in the translate message
      log when look-ahead is active.
- [ ] Provider-configurable batch size: a provider with a larger `maxBatchChars`
      produces fewer, larger requests.
- [ ] Download parallelization: a 50-page PDF download translates measurably
      faster than the sequential baseline.
- [ ] Font-metrics overlay: Layout overlay boxes render at correct height on
      first paint with no post-reflow collision.
- [ ] Bilingual mode: original + translated render stacked; persisted across
      reloads.
- [ ] Download queue UI: real page-count progress + queue cancel work.
- [ ] All quality gates green: `pnpm test`, `pnpm lint`, `pnpm compile`,
      `wxt build`.

## Out of Scope

- Universal streaming across web/subtitle paths (deferred — PDF-only this track).
- Offscreen-document PDF rendering (architecture unchanged).
- Translated PDF font embedding improvements (Noto Sans pipeline unchanged).
- New view modes beyond `bilingual`.
- Whole-document background translation (look-ahead is bounded to 2 pages).
