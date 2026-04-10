# Track Learnings: glossary-wire_20260410

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- Variable injection (`{{targetLanguage}}`, `{{glossary}}`) via regex replace is backward compatible
  with existing `buildSystemPrompt(lang)` calls. (from: phase3-ux-polish_20260410)
- Background service worker reads settings fresh per-request via `loadSettings()` — do NOT cache
  settings at module level, they may be stale after user changes them in Options.
- Zustand + chrome.storage bidirectional sync: popup ↔ options ↔ content all stay in sync.
  The background service worker uses `loadSettings()` directly (not the Zustand store).
- `chrome.runtime.sendMessage` in content/options scripts must be wrapped in try/catch —
  can throw synchronously if the service worker is asleep on first call.
- No barrel export pattern: import directly from `@/lib/glossary`, `@/services/base`, etc.

---

<!-- Learnings from implementation will be appended below -->

## [2026-04-10 18:09] - Phase 1: Glossary Pipeline Wiring

- **Implemented:** Extended TranslationRequest with glossaryBlock/customSystemPrompt; wired all three background handlers; forwarded fields through OpenAICompatibleService to buildSystemPrompt()
- **Files changed:** `types/translation.ts`, `services/background.ts`, `services/openaiCompatible.ts`
- **Commit:** 528eefd
- **Learnings:**
  - Patterns: `buildSystemPrompt()` already accepted `(lang, template?, glossary?)` — the service layer just wasn't calling it with the right args. Always check existing function signatures before extending.
  - Gotchas: Each background handler needs its own `loadSettings()` call — they don't share a settings variable. Pass `glossaryBlock || undefined` (not empty string) to preserve "no glossary" semantics.
  - Context: `formatGlossary()` returns `''` for empty arrays — the `|| undefined` guard prevents injecting an empty glossary section into the prompt.

## [2026-04-10 18:09] - Phase 2: Test Coverage

- **Implemented:** Glossary-forwarding tests added to openaiCompatible.test.ts and background.test.ts; base.test.ts was already covered
- **Files changed:** `services/__tests__/openaiCompatible.test.ts`, `services/__tests__/background.test.ts`
- **Commit:** 528eefd
- **Learnings:**
  - Patterns: Inspect LLM request body in tests: `JSON.parse(fetchMock.mock.calls[0][1]?.body).messages[0].content`
  - Gotchas: Module-level `mockStorage` in background.test.ts is shared — add `beforeEach(() => delete mockStorage['lingua-lens-settings'])` to prevent pollution.
  - Gotchas: Test assertions must match reality — check the mock output text actually contains the expected target term before asserting it's not flagged.

## [2026-04-10 18:09] - Phase 3: Preview UI + checkGlossaryMismatches

- **Implemented:** checkGlossaryMismatches() utility; GlossaryTranslatePreview collapsible panel; ⚠️ badges in DictionarySection table rows
- **Files changed:** `lib/glossary.ts`, `lib/__tests__/glossary.test.ts`, `entrypoints/options/sections/GlossaryTranslatePreview.tsx`, `entrypoints/options/sections/DictionarySection.tsx`
- **Commit:** 528eefd
- **Learnings:**
  - Patterns: Lift mismatch state to parent (DictionarySection) and pass `onMismatchUpdate` callback — keeps table and preview in sync without a shared store.
  - Patterns: Clear badges on ANY mutation (add/delete/edit) by calling `clearMismatches()` in each handler's useCallback.
  - Context: GlossaryTranslatePreview reuses the existing `translate` action — the glossary is automatically injected because the wired background handler calls `loadSettings()` on every request.
