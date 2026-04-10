# Spec: Custom Dictionary (Glossary) — Wire & Validate

## Overview

The glossary system exists in types (`GlossaryEntry[]`), formatting utilities (`lib/glossary.ts`),
and the UI (Options → Glossary tab) but is **never forwarded to the LLM**. Every translation
call falls back to the generic system prompt with no term-protection applied.

This track fixes the pipeline so term-specific translations are injected into every system
prompt, adds comprehensive unit tests for the corrected pipeline, and provides a live
"Translate Preview" panel in the Glossary settings tab so users can verify their glossary
is working before translating a full page.

---

## Functional Requirements

### FR-1: Glossary Pipeline Wiring

- `TranslationRequest` (`types/translation.ts`) must carry:
  - `glossaryBlock?: string` — pre-formatted glossary string from `formatGlossary()`
  - `customSystemPrompt?: string | null` — user's custom template override
- `services/background.ts` → `handleTranslate()` must:
  - Load `settings.glossary` and `settings.customSystemPrompt` via `loadSettings()`
  - Call `formatGlossary(settings.glossary)` to produce the glossary block
  - Pass both fields into `service.translate()`
- Same wiring for `handleTranslateSubtitle()` and `handleTranslateSelection()`
- `OpenAICompatibleService.translate()` must pass `request.glossaryBlock` and
  `request.customSystemPrompt` to `buildSystemPrompt()`

### FR-2: Unit Test Coverage

- `services/__tests__/base.test.ts`:
  - `buildSystemPrompt()` injects glossary block when provided
  - `buildSystemPrompt()` omits the glossary section when glossary is empty/absent
  - `buildSystemPrompt()` uses custom template when provided
- `services/__tests__/openaiCompatible.test.ts`:
  - Mock `fetch`; verify `messages[0].content` contains glossary terms when `glossaryBlock` is set
  - Verify no glossary section in system message when `glossaryBlock` is absent
- `services/__tests__/background.test.ts`:
  - Mock `loadSettings()` returning non-empty glossary; verify `service.translate()` receives
    correct `glossaryBlock`
  - Verify empty glossary results in empty/absent `glossaryBlock`

### FR-3: Glossary Translate Preview (Options Page — Glossary Tab)

- Add a **"Translate Preview"** collapsible panel at the bottom of the Glossary section
- **Input**: Textarea (placeholder: `"Type a sentence containing your glossary terms…"`)
- **Action**: "Translate Preview" button — sends the text via `chrome.runtime.sendMessage`
  with current settings (provider, glossary, customSystemPrompt, source/target language)
- **Result**: Displays the translated text below the button
- **Mismatch detection**: After translation, for each glossary entry whose `entry.source`
  appears (case-insensitive) in the input, check if `entry.target` appears
  (case-insensitive) in the output; missing entries get a ⚠️ badge in the glossary table
- Badges are cleared on the next preview run or when any glossary entry is modified

### FR-4: Mismatch Detection Utility

- `lib/glossary.ts` → add `checkGlossaryMismatches(entries, inputText, outputText): GlossaryEntry[]`
  - Returns entries whose source term appears in input but target term is absent from output
  - Case-insensitive substring matching
- `lib/__tests__/glossary.test.ts` — tests for the new function

---

## Non-Functional Requirements

- No new npm dependencies
- Mismatch check is client-side substring only (no external NLP)
- Preview panel does not affect the main translation pipeline or any existing state
- TypeScript strict mode — no `any` leaks

---

## Acceptance Criteria

- [ ] Translating a page with glossary entries correctly injects terms into the system prompt
- [ ] `buildSystemPrompt()` tests pass with and without glossary block
- [ ] `openaiCompatible.test.ts` confirms glossary reaches the LLM request body
- [ ] `background.test.ts` confirms `handleTranslate` reads settings and forwards glossary
- [ ] Options → Glossary tab shows "Translate Preview" panel
- [ ] Typing a sentence + clicking button returns translated text
- [ ] Glossary entries missing from output are flagged with ⚠️ in the table
- [ ] Badges clear on next run or on entry edit
- [ ] All existing **403 tests** still pass; new tests added (target: ≥ 415 passing)
- [ ] `pnpm build` succeeds, bundle stays under 550KB

---

## Out of Scope

- Fuzzy / NLP mismatch detection
- Per-site glossary overrides
- Import / export changes (already implemented)
- Glossary term highlighting inside the translated page DOM
