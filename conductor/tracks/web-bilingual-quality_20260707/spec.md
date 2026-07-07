# Track: Bilingual Web Translation Quality & Performance

**Track ID:** `web-bilingual-quality_20260707`
**Type:** Feature (improvement)
**Priority:** High
**Depends on:** none
**Source:** Deep analysis comparing AnyLLMTranslate vs ImmersiveTranslateExtensionCode bilingual handling (7 gaps selected for action)

---

## Overview

Close the 7 highest-impact gaps between AnyLLMTranslate's web-page bilingual pipeline and Immersive Translate's, identified in the bilingual-handling analysis. The work spans translation quality (rich translate, source-lang gating), throughput/cost (batcher, concurrency, negative cache, streaming), and resilience (cross-session resume). All changes target the web-page path; subtitle and PDF paths are touched only where a shared seam is extended (streaming port, provider pool config).

## Functional Requirements

### FR-1 — Rich translate (inline markup preservation)
- **Current:** `domWalker.extractPieces` flattens child text nodes into a plain string (`content/domWalker.ts:167`); `translationDisplay.applyTranslation/applyInlineTranslation` inject via `textContent` (`content/translationDisplay.ts:338,463`). Bold, links, inline code, emphasis inside a translated paragraph are lost in the translation span.
- **Target:** Encode inline elements as numbered placeholder tokens (e.g. `<z id="0">…</z>`) before LLM call; reconstruct HTML on return. Mirrors Immersive's `variables`/`richVariables` + `aR/oR` decoders.
- **Scope:**
  - New pure lib `lib/richTranslate.ts`: `encodeInlineHtml(piece) → { flatText, variables }`, `decodeInlineHtml(translated, variables) → DocumentFragment`.
  - Encode inside `extractPieces` (or a transform applied at piece build) for elements in `INLINE_ELEMENTS` (`A, B, STRONG, I, EM, CODE, SPAN, MARK, SUB, SUP, U, S, SMALL, KBD, Q, CITE, ABBR, TIME, DEL, INS, FONT`).
  - Decode in `applyTranslation`/`applyInlineTranslation` (and inline-clone path in translation-only mode). Inject via `appendChild(DocumentFragment)`, not `textContent`.
  - Gate behind new `enableRichTranslate` setting on `ExtensionSettings` (default: `true`). When off, current plain-text behavior.
  - XSS-safety: reconstruct via `createElement` (no `innerHTML`); escape text-node content; never reconstruct `<script>`/event-handler attributes.
  - Preserve the existing system-prompt instruction to keep markup/URLs/code intact; add an explicit rule naming the placeholder tag.
- **Out of scope:** rich translate for the subtitle path (subtitle text has no inline markup); rich translate for PDF (different rendering pipeline).

### FR-2 — Wire or delete `TranslationBatcher`; add request-boundary char-budget
- **Current:** `services/batcher.ts` (`TranslationBatcher`) is never imported in production. Real web batches = whatever the viewport flushes every 100ms, with no inter-flush dedup and no char-budget split at the request boundary. The background `handleTranslate` sends the whole flushed map in one LLM call.
- **Target (delete path preferred unless wiring is trivial):**
  - Delete `services/batcher.ts` and its test file if unused, OR wire it as the dedup+split layer between `viewportObserver` and the background `translate` message.
  - Add per-request char-budget splitting in `handleTranslate` (background): split uncached pieces into sub-batches by new settings `maxTextGroupLengthPerRequest` (default 4, mirroring Immersive's LLM default) and `maxTextLengthPerRequest` (default 2000). Send one LLM call per sub-batch; merge results.
  - Inter-flush text-level dedup of identical short paragraphs that scrolled in together (Map key by text).
- **Scope:** `services/background.ts` (`handleTranslate`), `types/config.ts` (new settings + defaults), delete/wire `services/batcher.ts`.

### FR-3 — Client-side source-language gate (heuristics)
- **Current:** `sourceLanguage: 'auto'` is a hint; no client-side check. Pieces already in the target language still hit the LLM (which is told to return unchanged — wasted round-trips + tokens).
- **Target:** New pure lib `lib/langDetect.ts` with script-range + n-gram heuristics:
  - CJK Unified (Han), Hangul, Hiragana/Katakana, Cyrillic, Arabic, Hebrew, Devanagari, Thai ranges → strong signal.
  - Latin-script languages: simple vowel/consonant + common-stopword n-gram scoring for a small set (en, vi, es, fr, de, pt).
  - Returns `{ lang: string|null, confidence: number }`.
- **Behavior:** In `translatePieces`, if `sourceLanguage === 'auto'` and detected lang matches `targetLanguage` (confidence ≥ threshold), skip the LLM call and either (a) skip injection entirely, or (b) render via a new `sameLangTranslationTheme` (muted style) so the user sees why it wasn't retranslated. Default behavior: skip injection (configurable).
- **Gate:** new `enableSourceLanguageDetection` setting (default: `true`).
- **Out of scope:** WASM CLD3 (deferred — analysis chose heuristics).

### FR-4 — Negative cache (failure cache, 2h TTL)
- **Current:** `services/cacheManager.ts` only caches successful translations. Flaky providers get retried on every scroll-past.
- **Target:** Add a `negative:` namespace keyed identically to the success cache (SHA-256 of `sourceLanguage:targetLanguage:text`). On a hard translation failure (after all retries/failover exhausted), write a negative entry with TTL 2h. On lookup, a negative hit short-circuits to the error state immediately (no LLM call).
- **TTL:** new `failureCacheTtlMinutes` setting (default 120).
- **Config:** new `enableFailureCache` setting (default: `true`).
- **Clearing:** negative entries cleared by `clearCache()` and the daily eviction sweep.
- **Scope:** `services/cacheManager.ts` (new `getCachedFailure`/`cacheFailure`), `services/background.ts` (`handleTranslate` failure branch).

### FR-5 — Per-service concurrency limit + throttle interval
- **Current:** One global semaphore (max 3 for page+subtitle). No per-key concurrency tuning, no inter-request throttle.
- **Target:** Add `concurrencyLimit` (default 0 = use global semaphore cap) and `interval` (ms between requests; default 0 = off) to `PoolKey` in `types/config.ts`.
- **Behavior:** `ProviderPoolCoordinator.dispatchWithFailover` acquires a per-key concurrency slot (bounded-concurrency runner, like `lib/concurrency.ts`) before dispatch, and a per-key throttle sleep (`interval`) before the network call. Both compose with the existing global semaphore (global is the outer bound).
- **UI:** Surface in Options → Providers → per-key AdvancedDisclosure (alongside maxRpm). Defaults preserve current behavior (0 = off → no regression).
- **Out of scope:** changing the global semaphore cap.

### FR-6 — Streaming web translation (reuse PDF port path)
- **Current:** `translateStream` exists but is PDF-only. Web pages block on the full batch response with a spinner per piece.
- **Target:** Extend the existing `chrome.runtime.connect` port + SSE path (`lib/sseStreamParser`, `OpenAICompatibleService.translateStream`) to the web `translate` action. Content script opens a port; background streams JSON entries as they parse; pieces fill incrementally with the existing in-place spinner→text swap.
- **Gate:** new `enableStreamingTranslation` setting (default: `false` — opt-in until validated; existing non-streaming path remains default).
- **Fallback:** if streaming unsupported/rejected, fall back to non-streaming transparently (same pattern as PDF).
- **Scope:** `services/background.ts` (new `translateStream` port handler), `entrypoints/content.ts` (`translatePieces` streaming branch), `services/openaiCompatible.ts` (port-based variant of `translateStream`), `types/config.ts`.
- **Out of scope:** streaming for subtitles (separate chunked pipeline).

### FR-7 — Cross-session resume for web pages
- **Current:** Web pages have no cross-session resume. A refresh loses all translation state. PDF has progress snapshots (`STORAGE_KEYS.PDF_PROGRESS`).
- **Target:** Persist a per-URL snapshot of `allPieces` (id + text + translation + status + targetLanguage) to IndexedDB under a new namespace, keyed by a stable URL+content hash.
- **Behavior:** On `startTranslation`, check for a snapshot matching the current URL+content hash. If present and cache still holds the translations, restore translated state immediately (no LLM calls for already-translated pieces). Observe `beforeunload` + `pagehide` to write the snapshot.
- **TTL:** entries evicted after 7 days, capped at 50 URLs (LRU).
- **Gate:** new `enableWebResume` setting (default: `true`).
- **Scope:** new `lib/webResume.ts` (snapshot read/write/evict), `entrypoints/content.ts` (restore on start, snapshot on hide), `services/cacheManager.ts` (namespace reuse).

## Non-Functional Requirements

- **Bundle size:** ≤ +30KB gzipped total across all 7 FRs (rich-translate + lang-detect libs are the main contributors). Track via `wxt build` before/after.
- **No regression:** all 2319 existing tests pass; new tests added per FR (target ≥ 30 new tests total).
- **No bundle pollution:** rich-translate decode uses `createElement`, never `innerHTML` with dynamic content (existing XSS pattern).
- **Backward-compatible defaults:** every new setting defaults to current behavior except `enableRichTranslate` (default `true` — explicit quality win) and `enableSourceLanguageDetection` (default `true`), `enableFailureCache` (default `true`), `enableWebResume` (default `true`). Streaming defaults OFF (opt-in).
- **Performance:** rich-translate encode/decode < 5ms per piece; lang-detect < 1ms per piece; resume restore < 50ms total.

## Acceptance Criteria

- [ ] AC-1: A paragraph containing `<b>`, `<a href>`, `<code>` renders with those elements preserved in the translated output (FR-1).
- [ ] AC-2: `TranslationBatcher` is either deleted (with its test) or wired into the production path; `grep -rn "TranslationBatcher"` shows zero unused definitions (FR-2).
- [ ] AC-3: An all-target-language page (e.g. Vietnamese page with target=vi) produces zero LLM calls for clearly-target-language paragraphs (FR-3).
- [ ] AC-4: After a forced translation failure, a second scroll-past within 2h hits the negative cache and shows the error state without an LLM call (verifiable via stats/debug log) (FR-4).
- [ ] AC-5: Setting `concurrencyLimit`/`interval` on a key changes observed throughput; defaults reproduce current behavior (FR-5).
- [ ] AC-6: With `enableStreamingTranslation` on, a long article fills translations incrementally (visible pieces update before the full batch completes) (FR-6).
- [ ] AC-7: After translating a page, refreshing restores translated state without LLM calls (cache permitting) (FR-7).
- [ ] AC-8: All existing tests pass; ≥ 30 new tests added; `tsc --noEmit` clean; `pnpm lint` introduces no new errors; `wxt build` succeeds within bundle budget.

## Out of Scope

- Per-paragraph quality controls (retranslate/alternative/copy) — analysis item #8, separate track.
- Title element + same-origin iframe translation completeness audit — analysis item #9.
- MutationObserver depth cap + `mutationBlockUrls` for editors — analysis item #10.
- WASM CLD3 language detection.
- Rich translate for subtitle/PDF paths.
- Streaming for the subtitle path.
- Hover-tooltip bilingual mode (analysis item #5) — separate.
