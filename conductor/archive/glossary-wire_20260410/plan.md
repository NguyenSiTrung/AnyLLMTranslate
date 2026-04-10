# Plan: Custom Dictionary (Glossary) — Wire & Validate

Track: `glossary-wire_20260410`
Spec: [spec.md](./spec.md)

---

## Phase 1: Pipeline Wiring
<!-- execution: sequential -->

- [x] Task 1: Extend `TranslationRequest` with glossary fields
  - Add `glossaryBlock?: string` and `customSystemPrompt?: string | null` to `TranslationRequest` in `types/translation.ts`
  <!-- files: types/translation.ts -->

- [x] Task 2: Wire glossary in `background.ts` for all three handlers
  - In `handleTranslate()`, `handleTranslateSubtitle()`, `handleTranslateSelection()`: load settings, call `formatGlossary(settings.glossary)`, pass `glossaryBlock` and `customSystemPrompt` into `service.translate()`
  - Import `formatGlossary` from `@/lib/glossary`
  <!-- files: services/background.ts -->

- [x] Task 3: Forward fields in `OpenAICompatibleService.translate()`
  - Pass `request.glossaryBlock` and `request.customSystemPrompt` to `buildSystemPrompt(targetLanguage, customSystemPrompt, glossaryBlock)`
  <!-- files: services/openaiCompatible.ts -->

- [x] Task 4: Conductor — User Manual Verification 'Pipeline Wiring' (Protocol in workflow.md)
  - `pnpm test && pnpm lint`
  - Manual check: set a glossary entry and translate a page, verify term preserved

---

## Phase 2: Test Coverage
<!-- execution: parallel -->

- [x] Task 1: Tests for `buildSystemPrompt()` glossary injection
  - Verify glossary block appears in output when provided; omitted when empty/absent; custom template respected
  <!-- files: services/__tests__/base.test.ts -->

- [x] Task 2: Tests for `OpenAICompatibleService.translate()` glossary forwarding
  - Mock `fetch`; verify `messages[0].content` (system prompt) contains glossary terms when `glossaryBlock` set; absent when not set
  <!-- files: services/__tests__/openaiCompatible.test.ts -->

- [x] Task 3: Tests for `handleTranslate()` in background service
  - Mock `loadSettings()` with non-empty glossary; verify `service.translate()` call receives correct `glossaryBlock`; verify empty glossary produces absent/empty `glossaryBlock`
  <!-- files: services/__tests__/background.test.ts -->

- [x] Task 4: Conductor — User Manual Verification 'Test Coverage' (Protocol in workflow.md)
  - `pnpm test` — confirm ≥ 415 tests passing
  <!-- depends: task1, task2, task3 -->

---

## Phase 3: Glossary Translate Preview UI
<!-- execution: parallel -->

- [x] Task 1: Add `checkGlossaryMismatches()` utility to `lib/glossary.ts`
  - `checkGlossaryMismatches(entries: GlossaryEntry[], inputText: string, outputText: string): GlossaryEntry[]`
  - Case-insensitive substring match: source in input → target missing from output → flagged
  <!-- files: lib/glossary.ts -->

- [x] Task 2: Add `GlossaryTranslatePreview` React component in Options
  - Collapsible panel at the bottom of the Glossary tab
  - Textarea input, "Translate Preview" button, result display area
  - On click: `chrome.runtime.sendMessage({ action: 'translate', ... })` using current settings
  - On result: call `checkGlossaryMismatches()` and pass flagged entry IDs to parent
  <!-- files: entrypoints/options/sections/GlossaryTranslatePreview.tsx, entrypoints/options/sections/DictionarySection.tsx -->

- [x] Task 3: Integrate mismatch ⚠️ badges in glossary table
  - Glossary table row: show ⚠️ badge if entry ID is in the mismatch set from preview result
  - Clear badges when: new preview run starts, or any entry is added/removed/edited
  <!-- files: entrypoints/options/sections/DictionarySection.tsx -->
  <!-- depends: task2 -->

- [x] Task 4: Tests for `checkGlossaryMismatches()` (`lib/__tests__/glossary.test.ts`)
  - Correct entries flagged when target missing; empty result when all match; case-insensitive
  <!-- files: lib/__tests__/glossary.test.ts -->
  <!-- depends: task1 -->

- [x] Task 5: Conductor — User Manual Verification 'Translate Preview UI' (Protocol in workflow.md)
  - `pnpm build && pnpm test`
  - Manual UX verification: open Options → Glossary → type sentence → click Translate Preview → verify output and ⚠️ badges
  <!-- depends: task2, task3, task4 -->

