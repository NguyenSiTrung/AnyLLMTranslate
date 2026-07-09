# Plan: Selection Translate — Dictionary Mode

Sequential by default (shared `textSelection` / messaging / settings surfaces). Phase 1 pure libs may run in parallel. TDD for pure helpers first.

**Spec:** [spec.md](./spec.md)  
**Reference:** Immersive selection prompts + `.word-dictionary*` UI; existing `content/textSelection.ts`, `handleTranslateSelection`.

**Global constraint:** `translateSelection` is shared by selection, hover, and inline paths. Dictionary behavior activates only when the message requests it (e.g. `dictionaryMode: true`) and settings allow it. Hover/inline remain plain translation.

---

## Phase 1: Pure domain — classify, parse, prompts, context
<!-- execution: parallel -->

- [ ] Task 1: Word vs sentence classifier (TDD)
  <!-- files: lib/selectionClassify.ts, tests/lib/selectionClassify.test.ts -->
  - [ ] `isDictionaryModeCandidate(text): boolean` — ≤3 tokens / single CJK token; no sentence-ending punctuation
  - [ ] Unit tests: single word, multi-word phrase, long sentence, CJK, punctuation edge cases

- [ ] Task 2: Dictionary JSON parser (TDD)
  <!-- files: lib/selectionDictionary.ts, tests/lib/selectionDictionary.test.ts -->
  - [ ] Types: `SelectionDictionaryResult`, definition/example shapes
  - [ ] `parseSelectionDictionary(raw): SelectionDictionaryResult | null` — strip fences, partial fields, fail-open helpers
  - [ ] `hasDictionaryFields(result)` for UI branching
  - [ ] Unit tests: valid, partial, fenced markdown, garbage, empty

- [ ] Task 3: Dictionary selection prompts (TDD)
  <!-- files: lib/selectionDictionaryPrompt.ts, tests/lib/selectionDictionaryPrompt.test.ts -->
  - [ ] System + user prompt templates (Immersive-aligned); substitute `from`, `to`, `text`, `context_text`
  - [ ] Must not alter page/subtitle default prompts
  - [ ] Unit tests: variable substitution, isolation

- [ ] Task 4: Selection context extractor (TDD-friendly)
  <!-- files: lib/selectionContext.ts, tests/lib/selectionContext.test.ts -->
  - [ ] Extract capped surrounding text from Range/string helpers (jsdom-friendly API)
  - [ ] Empty string on failure; max length constant
  - [ ] Unit tests with synthetic DOM/range where feasible

- [ ] Task 5: Conductor — Phase 1 verification
  - [ ] `pnpm test` (new pure tests green) + `pnpm lint` on touched files

---

## Phase 2: Settings, types, cache keying
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 1: Settings flag + defaults
  <!-- files: types/config.ts, lib/config.ts, stores/settingsStore.ts (if needed) -->
  - [ ] Add `selectionDictionaryEnabled: boolean` (default `true`)
  - [ ] Deep-merge / loadDefaults / extractSettings pick it up
  - [ ] Config/store tests if existing patterns cover settings keys

- [ ] Task 2: Message contract extension
  <!-- files: types/messages.ts -->
  - [ ] Extend `TranslateSelectionMessage` with opt-in dictionary fields (e.g. `dictionaryMode?`, `contextText?`)
  - [ ] Response shape: `translatedText`, optional `dictionary`, `mode`
  - [ ] Backward compatible: missing flags → current plain behavior

- [ ] Task 3: Cache key separation for dictionary mode
  <!-- files: services/cacheManager.ts or selection handler helpers + tests -->
  - [ ] Namespace/suffix so dictionary JSON does not collide with plain string cache
  - [ ] Unit tests for key distinction

- [ ] Task 4: Conductor — Phase 2 verification
  - [ ] Tests + lint; no behavior change for hover/inline yet

---

## Phase 3: Background dictionary path
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [ ] Task 1: Wire `handleTranslateSelection` dictionary path
  <!-- files: services/background.ts, tests as appropriate -->
  - [ ] If `dictionaryMode` && settings enabled: use dictionary system prompt + context; parse JSON; return structured + `translatedText` fallback
  - [ ] Else: existing plain path
  - [ ] Cache read/write with mode-aware keys
  - [ ] Fail-open on parse failure
  - [ ] Do not enable dictionary for callers that omit the flag

- [ ] Task 2: Conductor — Phase 3 verification
  - [ ] Unit/integration tests for both modes; `pnpm test` + lint

---

## Phase 4: Content UI — dual layout tooltip
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [ ] Task 1: Content script orchestration
  <!-- files: content/textSelection.ts -->
  - [ ] Classify selection; if dictionary candidate && setting on → request with `dictionaryMode` + context
  - [ ] Preserve `selectionSession` race guard, button, context-menu entry
  - [ ] Hover/inline call sites unchanged (no dictionary flag)

- [ ] Task 2: Dictionary vs sentence tooltip rendering
  <!-- files: content/textSelection.ts, styles/tooltip.css -->
  - [ ] Dictionary layout: phonetic, POS, meanings, examples, translation, contextual analysis, copy/close
  - [ ] Sentence layout: existing plain UI
  - [ ] Loading/error states; scoped CSS; dark mode
  - [ ] Tests for render branches (DOM construction helpers if extracted)

- [ ] Task 3: Conductor — Phase 4 verification
  - [ ] Selection UI manual checklist (word / sentence / invalid JSON) + automated tests

---

## Phase 5: Options surface + polish
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [ ] Task 1: Minimal settings UI
  <!-- files: entrypoints/options/... (General or Advanced near selection toggle) -->
  - [ ] Toggle for `selectionDictionaryEnabled` with short helper text
  - [ ] Persist via settings store

- [ ] Task 2: Product/docs touch (light)
  <!-- files: README.md (feature bullet only if needed) -->
  - [ ] One-line mention of dictionary selection mode if README lists selection translate

- [ ] Task 3: Full verification + learnings
  - [ ] `pnpm test`, `pnpm lint`, smoke build if needed
  - [ ] Capture learnings; elevate reusable patterns to `patterns.md` if warranted
