# Implementation Plan: web-bilingual-quality_20260707

**Phases:** 8 — designed so independent FRs run in parallel where possible.
**Parallel groups:** Phase 1 (foundation) is sequential; Phases 2/3/4/5/6 form a parallel batch (each marked `<!-- depends: -->`); Phase 7 gates on all; Phase 8 is hardening.

---

## Phase 1: Foundation — shared types, settings, defaults
<!-- execution: sequential -->

- [ ] **Task 1.1:** Add new settings fields + defaults to `types/config.ts`
  - `enableRichTranslate` (default `true`), `enableSourceLanguageDetection` (default `true`), `enableFailureCache` (default `true`), `failureCacheTtlMinutes` (default `120`), `enableStreamingTranslation` (default `false`), `enableWebResume` (default `true`), `maxTextGroupLengthPerRequest` (default `4`), `maxTextLengthPerRequest` (default `2000`).
  - Add `concurrencyLimit` (default `0`) and `interval` (default `0`) to `PoolKey`.
  - Update `DEFAULT_SETTINGS`, `extractSettings()` in `stores/settingsStore.ts`.
  - Files: `types/config.ts`, `stores/settingsStore.ts`
  <!-- files: types/config.ts, stores/settingsStore.ts -->

- [ ] **Task 1.2:** Conductor - User Manual Verification 'Foundation' (Protocol in workflow.md)

---

## Phase 2: Rich translate (FR-1) — inline markup preservation
<!-- execution: sequential -->
<!-- depends: -->

- [ ] **Task 2.1:** New pure lib `lib/richTranslate.ts` — `encodeInlineHtml` + `decodeInlineHtml`
  - Encode inline elements (`A,B,STRONG,I,EM,CODE,SPAN,MARK,SUB,SUP,U,S,SMALL,KBD,Q,CITE,ABBR,TIME,DEL,INS,FONT`) as `<z id="N">` placeholders. Return `{ flatText, variables }`.
  - Decode via `createElement` (never `innerHTML`); escape text; reject `<script>`/on-handler attributes.
  - TDD: write `lib/__tests__/richTranslate.test.ts` first (encode/decode round-trips, nested inline, XSS rejection, empty/edge cases).
  - Files: `lib/richTranslate.ts`, `lib/__tests__/richTranslate.test.ts`
  <!-- files: lib/richTranslate.ts, lib/__tests__/richTranslate.test.ts -->

- [ ] **Task 2.2:** Wire rich translate into domWalker + translationDisplay
  - In `extractPieces`: when `enableRichTranslate`, build `variables` + flat text instead of plain join.
  - Extend `TranslationPiece` with optional `variables` field.
  - In `applyTranslation`/`applyInlineTranslation` (and inline-clone path): decode to `DocumentFragment`, `appendChild` instead of `textContent`.
  - Update system prompt (`services/base.ts buildSystemPrompt`) to name the `<z id="N">` placeholder rule.
  - Files: `content/domWalker.ts`, `content/translationDisplay.ts`, `services/base.ts`, `types` (TranslationPiece)
  <!-- files: content/domWalker.ts, content/translationDisplay.ts, services/base.ts -->

- [ ] **Task 2.3:** Conductor - User Manual Verification 'Rich translate' (Protocol in workflow.md)

---

## Phase 3: Batcher + char-budget (FR-2) — delete dead code, add request splitting
<!-- execution: sequential -->
<!-- depends: -->

- [ ] **Task 3.1:** Delete `services/batcher.ts` + its test
  - Verify zero prod imports (grep `TranslationBatcher`); delete `services/batcher.ts` and any test reference.
  - Files: `services/batcher.ts` (delete)
  <!-- files: services/batcher.ts -->

- [ ] **Task 3.2:** Add request-boundary splitting + inter-flush dedup in `handleTranslate`
  - Split uncached pieces by `maxTextGroupLengthPerRequest`/`maxTextLengthPerRequest`; one LLM call per sub-batch; merge.
  - Dedup identical short paragraphs across a single flush (Map by text).
  - TDD: extend `services/__tests__/background.test.ts` for sub-batching + dedup.
  - Files: `services/background.ts`, `services/__tests__/background.test.ts`
  <!-- files: services/background.ts -->

- [ ] **Task 3.3:** Conductor - User Manual Verification 'Batcher + char-budget' (Protocol in workflow.md)

---

## Phase 4: Source-language gate (FR-3) — heuristics
<!-- execution: sequential -->
<!-- depends: -->

- [ ] **Task 4.1:** New pure lib `lib/langDetect.ts` — script-range + n-gram heuristics
  - CJK/Hangul/Kana/Cyrillic/Arabic/Hebrew/Devanagari/Thai range detection; Latin-stopword n-gram scoring for en/vi/es/fr/de/pt.
  - Return `{ lang, confidence }`. TDD first.
  - Files: `lib/langDetect.ts`, `lib/__tests__/langDetect.test.ts`
  <!-- files: lib/langDetect.ts, lib/__tests__/langDetect.test.ts -->

- [ ] **Task 4.2:** Wire source-lang gate into `translatePieces`
  - In `entrypoints/content.ts translatePieces`: if `enableSourceLanguageDetection && sourceLanguage==='auto'` and detected matches target (confidence ≥ threshold), skip injection (default) or render muted `sameLangTranslationTheme`.
  - Files: `entrypoints/content.ts`
  <!-- files: entrypoints/content.ts -->

- [ ] **Task 4.3:** Conductor - User Manual Verification 'Source-language gate' (Protocol in workflow.md)

---

## Phase 5: Negative cache (FR-4) + Per-service concurrency (FR-5) + Resume (FR-7) — independent seams
<!-- execution: parallel -->
<!-- depends: -->

- [ ] **Task 5.1:** Negative cache in `cacheManager` + `handleTranslate` failure branch
  - New `negative:` namespace; `getCachedFailure`/`cacheFailure` with `failureCacheTtlMinutes` TTL; clear + eviction integration.
  - In `handleTranslate`: on hard failure (after failover), write negative; on lookup, negative hit → skip LLM, surface error state.
  - TDD: extend `cacheManager` tests + `background` failure-path tests.
  - Files: `services/cacheManager.ts`, `services/background.ts`, tests for both
  <!-- files: services/cacheManager.ts, services/background.ts -->

- [ ] **Task 5.2:** Per-key `concurrencyLimit` + `interval` in `ProviderPoolCoordinator`
  - Acquire per-key concurrency slot (bounded runner) before dispatch; per-key throttle sleep before network call. Defaults (0) = no-op (preserves current behavior).
  - TDD: extend pool tests for per-key limiting + throttle.
  - Files: `services/providerPool.ts`, tests
  <!-- files: services/providerPool.ts -->

- [ ] **Task 5.3:** Cross-session web resume — new `lib/webResume.ts` + content wiring
  - Snapshot `allPieces` (id+text+translation+status+targetLang) per URL+content hash to IndexedDB; 7-day TTL, 50-URL LRU cap.
  - Restore on `startTranslation` if cache holds; write on `beforeunload`/`pagehide`.
  - TDD first for snapshot/evict/restore helpers.
  - Files: `lib/webResume.ts`, `lib/__tests__/webResume.test.ts`, `entrypoints/content.ts`
  <!-- files: lib/webResume.ts, entrypoints/content.ts -->

- [ ] **Task 5.4:** Conductor - User Manual Verification 'Negative cache + Concurrency + Resume' (Protocol in workflow.md)

---

## Phase 6: Streaming web translation (FR-6) — depends only on Phase 1 types
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] **Task 6.1:** Port-based `translateStream` handler in background
  - New `translateStream` port action in `services/background.ts` reusing `lib/sseStreamParser` + `OpenAICompatibleService.translateStream`. Emit parsed JSON entries as port messages.
  - Files: `services/background.ts`
  <!-- files: services/background.ts -->

- [ ] **Task 6.2:** Content-side streaming branch in `translatePieces`
  - When `enableStreamingTranslation`, open port; on each streamed entry, in-place swap the matching piece's spinner → translation (reuse existing in-place update pattern).
  - Fallback to non-streaming on rejection/unsupported.
  - Files: `entrypoints/content.ts`
  <!-- files: entrypoints/content.ts -->

- [ ] **Task 6.3:** Conductor - User Manual Verification 'Streaming web translation' (Protocol in workflow.md)

---

## Phase 7: Settings UI surfacing
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4, phase5, phase6 -->

- [ ] **Task 7.1:** Expose all new settings in Options + popup where applicable
  - Options → Advanced: rich translate toggle, source-lang detection toggle, failure cache toggle + TTL, web resume toggle, maxTextGroupLength/Length, streaming toggle.
  - Options → Providers → per-key AdvancedDisclosure: `concurrencyLimit` + `interval` inputs (defaults 0).
  - Files: `entrypoints/options/sections/AdvancedSection.tsx`, `entrypoints/options` (ProviderKeyRow or equivalent), popup (lang detection quick toggle if desired)
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options -->

- [ ] **Task 7.2:** Conductor - User Manual Verification 'Settings UI' (Protocol in workflow.md)

---

## Phase 8: Hardening — full test sweep, bundle audit, lint, build
<!-- execution: sequential -->
<!-- depends: phase7 -->

- [ ] **Task 8.1:** Full `pnpm test`, `tsc --noEmit`, `pnpm lint`, `wxt build`; fix any regressions
  - Target ≥ 30 new tests total across FRs; bundle delta ≤ +30KB gzipped.
  - Update `conductor/patterns.md` with new learnings.
  - Files: (cross-cutting)
  <!-- files: (cross-cutting) -->

- [ ] **Task 8.2:** Conductor - User Manual Verification 'Hardening' (Protocol in workflow.md)
