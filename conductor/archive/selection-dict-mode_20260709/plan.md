# Plan: Selection Translate — Dictionary Mode

Sequential by default (shared `textSelection` / messaging / settings surfaces). Phase 1 pure libs may run in parallel. TDD for pure helpers first.

**Spec:** [spec.md](./spec.md)  
**Reference:** Immersive selection prompts + `.word-dictionary*` UI; existing `content/textSelection.ts`, `handleTranslateSelection`.

**Global constraint:** `translateSelection` is shared by selection, hover, and inline paths. Dictionary behavior activates only when the message requests it (e.g. `dictionaryMode: true`) and settings allow it. Hover/inline remain plain translation.

---

## Phase 1: Pure domain — classify, parse, prompts, context
<!-- execution: parallel -->

- [x] Task 1: Word vs sentence classifier (TDD)
  <!-- files: lib/selectionClassify.ts, tests/lib/selectionClassify.test.ts -->
  - [x] `isDictionaryModeCandidate(text): boolean` — ≤3 tokens / single CJK token; no sentence-ending punctuation
  - [x] Unit tests: single word, multi-word phrase, long sentence, CJK, punctuation edge cases
  - Commit: `20ee77e`

- [x] Task 2: Dictionary JSON parser (TDD)
  <!-- files: lib/selectionDictionary.ts, tests/lib/selectionDictionary.test.ts -->
  - [x] Types: `SelectionDictionaryResult`, definition/example shapes
  - [x] `parseSelectionDictionary(raw): SelectionDictionaryResult | null` — strip fences, partial fields, fail-open helpers
  - [x] `hasDictionaryFields(result)` for UI branching
  - [x] Unit tests: valid, partial, fenced markdown, garbage, empty
  - Commit: `892f153`

- [x] Task 3: Dictionary selection prompts (TDD)
  <!-- files: lib/selectionDictionaryPrompt.ts, tests/lib/selectionDictionaryPrompt.test.ts -->
  - [x] System + user prompt templates (Immersive-aligned); substitute `from`, `to`, `text`, `context_text`
  - [x] Must not alter page/subtitle default prompts
  - [x] Unit tests: variable substitution, isolation
  - Commit: `04d30a4`

- [x] Task 4: Selection context extractor (TDD-friendly)
  <!-- files: lib/selectionContext.ts, tests/lib/selectionContext.test.ts -->
  - [x] Extract capped surrounding text from Range/string helpers (jsdom-friendly API)
  - [x] Empty string on failure; max length constant
  - [x] Unit tests with synthetic DOM/range where feasible
  - Commit: `892f153`

- [x] Task 5: Conductor — Phase 1 verification
  - [x] `pnpm test` (new pure tests green) + `pnpm lint` on touched files

---

## Phase 2: Settings, types, cache keying
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 1: Settings flag + defaults
  <!-- files: types/config.ts, lib/config.ts, stores/settingsStore.ts (if needed) -->
  - [x] Add `selectionDictionaryEnabled: boolean` (default `true`)
  - [x] Deep-merge / loadDefaults / extractSettings pick it up
  - [x] Config/store tests if existing patterns cover settings keys

- [x] Task 2: Message contract extension
  <!-- files: types/messages.ts -->
  - [x] Extend `TranslateSelectionMessage` with opt-in dictionary fields (e.g. `dictionaryMode?`, `contextText?`)
  - [x] Response shape: `translatedText`, optional `dictionary`, `mode`
  - [x] Backward compatible: missing flags → current plain behavior

- [x] Task 3: Cache key separation for dictionary mode
  <!-- files: services/cacheManager.ts or selection handler helpers + tests -->
  - [x] Namespace/suffix so dictionary JSON does not collide with plain string cache
  - [x] Unit tests for key distinction

- [x] Task 4: Conductor — Phase 2 verification
  - [x] Tests + lint; no behavior change for hover/inline yet

---

## Phase 3: Background dictionary path
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [x] Task 1: Wire `handleTranslateSelection` dictionary path
  <!-- files: services/background.ts, tests as appropriate -->
  - [x] If `dictionaryMode` && settings enabled: use dictionary system prompt + context; parse JSON; return structured + `translatedText` fallback
  - [x] Else: existing plain path
  - [x] Cache read/write with mode-aware keys
  - [x] Fail-open on parse failure
  - [x] Do not enable dictionary for callers that omit the flag

- [x] Task 2: Conductor — Phase 3 verification
  - [x] Unit/integration tests for both modes; `pnpm test` + lint

---

## Phase 4: Content UI — dual layout tooltip
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [x] Task 1: Content script orchestration
  <!-- files: content/textSelection.ts -->
  - [x] Classify selection; if dictionary candidate && setting on → request with `dictionaryMode` + context
  - [x] Preserve `selectionSession` race guard, button, context-menu entry
  - [x] Hover/inline call sites unchanged (no dictionary flag)

- [x] Task 2: Dictionary vs sentence tooltip rendering
  <!-- files: content/textSelection.ts, styles/tooltip.css -->
  - [x] Dictionary layout: phonetic, POS, meanings, examples, translation, contextual analysis, copy/close
  - [x] Sentence layout: existing plain UI
  - [x] Loading/error states; scoped CSS; dark mode
  - [x] Tests for render branches (DOM construction helpers if extracted)

- [x] Task 3: Conductor — Phase 4 verification
  - [x] Selection UI manual checklist (word / sentence / invalid JSON) + automated tests

---

## Phase 5: Options surface + finalize
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [x] Task 1: Minimal settings UI
  <!-- files: entrypoints/options/... (General or Advanced near selection toggle) -->
  - [x] Toggle for `selectionDictionaryEnabled` with short helper text
  - [x] Persist via settings store

- [x] Task 2: Product/docs touch (light)
  <!-- files: README.md (feature bullet only if needed) -->
  - [x] One-line mention of dictionary selection mode if README lists selection translate

- [x] Task 3: Full verification + learnings
  - [x] `pnpm test`, `pnpm lint`, smoke build if needed
  - [x] Capture learnings; elevate reusable patterns to `patterns.md` if warranted
