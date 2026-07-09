# Track Learnings: selection-dict-mode_20260709

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Text Selection Translate
- `event.target` can be `document` (not an Element) when `mouseup` is dispatched on document directly — guard `target.closest` with `typeof target.closest !== 'function'` check.
- Async event handlers (`async function onMouseUp`) fire-and-forget — `dispatchEvent` is synchronous but the handler's promise is not awaited by the DOM.
- Module-level state (`let isEnabled = true`) persists across test cases — must reset in `beforeEach`.
- Tooltip positioning requires `window.scrollY` offset to handle scrolled pages correctly.
- `selectionSession` monotonic id drops stale LLM responses when the user re-selects quickly.

### Shared translation chokepoint
- `translateSelection` is used by selection, hover, and inline paths — dictionary mode must be **opt-in per message**, never default for all callers.
- Provider pool `initService()` covers all translation paths; do not add a separate dictionary provider.
- RPM limiter + response_format self-heal sit on `OpenAICompatibleService.fetchWithRetry` — selection dictionary calls go through the same chokepoint.

### Cache
- Web/selection cache keys must stay distinct from subtitle (`subtitle:` prefix) and from each other when response schemas differ (dictionary JSON vs plain string).

### Testing
- Always ensure `loadSettings` mocks include all properties used by the implementation.
- Prefer pure `lib/` helpers for TDD; keep DOM rendering in content script.

### Immersive reference (this track)
- Word-mode: JSON with `phonetic`, `definitions[]`, `translation`, `contextual_analysis`.
- Phrase/sentence: `{ "translation" }` only.
- UI branches on response fields (`phonetic` / `definitions`), not a perfect client phrase classifier.
- Source dump: `ImmersiveTransalteExtensionCode/1.30.3_0/default_config.json` → `generalRule.selectionTranslation.prompts`.

---

<!-- Learnings from implementation will be appended below -->

## [2026-07-09] - Phase 1 Tasks 1–4: Pure domain libs
- **Implemented:** Classifier, dictionary JSON parser, Immersive-aligned prompts, context extractor
- **Files changed:** `lib/selectionClassify.ts`, `lib/selectionDictionary.ts`, `lib/selectionDictionaryPrompt.ts`, `lib/selectionContext.ts` + tests
- **Commits:** `20ee77e`, `892f153`, `04d30a4`
- **Learnings:**
  - Patterns: Parallel pure-lib workers race on `git commit` HEAD lock — one commit may scoop another's files; still OK if tests green
  - Patterns: Reuse base.ts parse strategies (think-strip, fences, outermost braces) in selection dictionary parser
  - Gotchas: jsdom tests must avoid non-null assertions (`textContent ?? ''`) for lint
  - Context: Immersive `selectionSystemPrompt` is the source of truth for dictionary JSON schema
---

## [2026-07-09] - Phases 2–5: Settings, background, UI, options
- **Implemented:** selectionDictionaryEnabled setting; TranslateSelectionMessage opt-in fields; dict: cache keys; background dictionary path via preScanSystemPrompt + returnRawResponse + customUserPrompt; dual tooltip UI; Options Advanced toggle; README bullet
- **Files changed:** types/*, stores/settingsStore.ts, lib/selectionCacheKey.ts, services/background.ts, services/openaiCompatible.ts, content/textSelection.ts, styles/tooltip.css, AdvancedSection.tsx, README.md + tests
- **Learnings:**
  - Patterns: Shared `translateSelection` must stay opt-in dictionary — never default true for all callers
  - Patterns: Immersive dictionary JSON is not a translations map → `returnRawResponse` + `customUserPrompt` on TranslationRequest avoids breaking page/subtitle parse path
  - Patterns: Cache namespace `dict:` + `getCachedTranslationByKey` mirrors subtitle `subtitle:` isolation
  - Gotchas: Glossary omitted on dictionary path intentionally (prompt noise); fail-open always yields `translatedText`
  - Context: UI branches on `hasDictionaryFields` / response.mode, not only client classifier
---
