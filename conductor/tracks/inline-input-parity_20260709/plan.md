# Plan: Inline Input Translation — Immersive-Parity Hardening

Sequential execution (shared modules). TDD: red → green → refactor per task where logic is pure/testable.

**Reference:** Immersive Translate `content_main.js` `[input-translate]` behaviors; existing `content/inlineTranslate.ts`.

---

## Phase 1: Settings model & defaults
<!-- execution: sequential -->

- [x] Task 1: Extend `InlineTranslateSettings` + defaults
  <!-- files: types/config.ts -->
  - [x] Add fields: `idleMs`, `triggerGapMs`, `triggerToleranceCount`, `enableLanguagePrefix`, `languagePrefix`, `dualMode`, `blocklistPatterns` (string[]), `enableFallbackUndo` (or equivalent names)
  - [x] Expand `DEFAULT_INLINE_TRANSLATE_SETTINGS` with Immersive-aligned safe defaults
  - [x] Keep backward compatibility: missing nested fields deep-merged to defaults
  - [x] Document each field in JSDoc

- [x] Task 2: Ensure deep-merge / store / load paths pick up new fields
  <!-- files: lib/config.ts, stores/settingsStore.ts -->
  <!-- depends: task1 -->
  - [x] Verify `deepMerge` / `extractSettings` includes all new `inlineTranslate` keys
  - [x] Add/adjust unit tests if config helpers have existing coverage

- [x] Task 3: Language-prefix alias table (pure)
  <!-- files: lib/inlineTranslatePrefix.ts (or content/inlineTranslate/prefix.ts), tests -->
  <!-- depends: task1 -->
  - [x] Implement `parseLanguagePrefix(text, options) → { targetLang?, body, rawPrefix? }`
  - [x] Support `/en`, aliases (zh/zh-CN/中文, ja/日语, vi, etc.)
  - [x] Unit tests: match, strip, no-match, disabled, custom prefix char

---

## Phase 2: Module split + P0 gesture / race safety
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 1: Split `content/inlineTranslate.ts` into package
  <!-- files: content/inlineTranslate/**, content/inlineTranslate.ts re-export if needed -->
  - [x] Create modules: `editable.ts`, `gesture.ts`, `writeback.ts`, `feedback.ts`, `prefix.ts` (or import from lib), `blocklist.ts`, `orchestrate.ts` / `index.ts`
  - [x] Preserve public API: `initInlineTranslate`, `setInlineTranslateEnabled`, `updateInlineTranslateConfig`, test helpers as needed
  - [x] Update imports in `entrypoints/content.ts` and tests
  - [x] All existing tests still pass after move (behavior-neutral split)

- [x] Task 2: Editable guards + deep active element (TDD)
  <!-- files: content/inlineTranslate/editable.ts, tests -->
  <!-- depends: task1 -->
  - [x] `isEditableElement`: exclude `readOnly`, `disabled`, password
  - [x] `getDeepActiveElement(doc, enableDeep?)` — shadowRoot / iframe / CE caret
  - [x] Improve `isCodeEditor` coverage if cheap
  - [x] Unit tests for guards; document jsdom limits for shadow/iframe

- [x] Task 3: Gesture IME / repeat / composition (TDD)
  <!-- files: content/inlineTranslate/gesture.ts, tests -->
  <!-- depends: task1 -->
  - [x] Ignore `!isTrusted`, `isComposing`, `repeat`
  - [x] Reset on compositionend / delete inputTypes where listened
  - [x] Dual listeners: keydown + input/keyup/compositionend as needed
  - [x] Optional idle debounce after last tap (`idleMs`)
  - [x] Caret-at-end check for trailing trigger (input/textarea `selectionStart`)
  - [x] Tests: IME, repeat, empty, window, idle, caret mid-string skip

- [x] Task 4: Race-safe orchestration (TDD)
  <!-- files: content/inlineTranslate/index.ts or orchestrate.ts, tests -->
  <!-- depends: task2, task3 -->
  - [x] Snapshot rawText + element before `sendMessage`
  - [x] Abort write if text/element changed or disconnected
  - [x] Request id + cancel window when user types during in-flight
  - [x] Clear toast/pulse on abort
  - [x] Tests with delayed mock `sendMessage`

---

## Phase 3: Multi-strategy write-back + undo + dual mode
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [x] Task 1: Write-back pipeline (TDD)
  <!-- files: content/inlineTranslate/writeback.ts, tests -->
  - [x] Strategy chain: InputEvent+execCommand → insertText only → value/textContent + events
  - [x] Verify post-write text matches expected
  - [x] Dual mode join helper (input vs textarea separator)
  - [x] Default translation-only
  - [x] Tests: success, strategy fallback, dual join, restore original on total fail

- [x] Task 2: Wire write-back into orchestrator + fallback undo
  <!-- files: content/inlineTranslate/*, tests -->
  <!-- depends: task1 -->
  - [x] Replace old `replaceElementText` usage with pipeline
  - [x] Populate `undoMap`; re-trigger or affordance restores original when enabled
  - [x] Document Ctrl+Z (native) vs fallback path
  - [x] Tests for undoMap restore

- [x] Task 3: Feedback polish
  <!-- files: content/inlineTranslate/feedback.ts, styles/inject.css -->
  <!-- depends: task2 -->
  - [x] Cancel clears feedback
  - [x] Minor toast position fix if cheap (reposition or bottom fallback)

---

## Phase 4: Blocklist + prefix integration
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [x] Task 1: URL blocklist matcher (TDD)
  <!-- files: content/inlineTranslate/blocklist.ts or lib/, tests -->
  - [x] Match hostname/URL against patterns (wildcard support like Immersive seed list)
  - [x] Default patterns: Notion, Figma, Lark/Feishu-class hosts from Immersive seed
  - [x] User patterns from settings merged with defaults (or replace-with-override policy documented)

- [x] Task 2: Integrate prefix + blocklist into gesture/shortcut pipeline
  <!-- files: content/inlineTranslate/index.ts, tests -->
  <!-- depends: task1 -->
  - [x] On fire: if blocklisted → no-op (debug log)
  - [x] Parse prefix for targetLang override; strip before translate
  - [x] Gesture still required (prefix alone does not fire)
  - [x] Tests: blocked URL, `/en hello   ` → en target + stripped body

---

## Phase 5: chrome.commands Alt+I
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [x] Task 1: Manifest command + background routing
  <!-- files: wxt.config.ts, entrypoints/background.ts, types/messages.ts -->
  - [x] Add `translate-input-box` command suggested `Alt+I`
  - [x] Background `onCommand` → `sendToActiveTab({ action: 'translateInputBox' })`
  - [x] Extend `MessageAction` / message types as needed

- [x] Task 2: Content handler
  <!-- files: entrypoints/content.ts, content/inlineTranslate/*, tests -->
  <!-- depends: task1 -->
  - [x] Handle `translateInputBox`: deep active editable → same orchestrate path (no trailing-space strip unless present)
  - [x] Respect enabled flag + blocklist
  - [x] Unit/integration-style test of handler entry (mock focus + message)

---

## Phase 6: Options advanced UI + regression
<!-- execution: sequential -->
<!-- depends: phase5 -->

- [x] Task 1: Full advanced Inline Translate panel
  <!-- files: entrypoints/options/sections/InlineTranslateSection.tsx -->
  - [x] All new knobs: idle/gap/tolerance, prefix enable+char, dual mode, blocklist textarea/list editor, shortcut hint
  - [x] Use existing UI primitives (Toggle, Slider, FieldGroup, AdvancedDisclosure only if it improves density — **full advanced panel** per spec means all knobs visible, not buried)
  - [x] Persist via `updateSettings({ inlineTranslate: { ... } })`
  - [x] Accessibility: labels, keyboard

- [x] Task 2: Content wiring for live settings updates
  <!-- files: entrypoints/content.ts -->
  <!-- depends: task1 -->
  - [x] `updateInlineTranslateConfig` accepts full extended config
  - [x] Storage listener already present — verify all fields flow through

- [x] Task 3: Full regression suite
  <!-- files: content/__tests__/*, lib tests -->
  <!-- depends: task1, task2 -->
  - [x] Port/update original triple-space tests to new module layout
  - [x] Cover FR acceptance criteria from `spec.md`
  - [x] Run `pnpm test` + `pnpm lint`
  - [x] Manual smoke notes in learnings: Google Search, ChatGPT input, Vietnamese IME

---

## Notes

- Prefer pure helpers in `lib/` when reusable outside content script; keep DOM-coupled code under `content/inlineTranslate/`.
- Do not copy Immersive minified source; reimplement with clean types.
- Commit after each task (Conventional Commits, scope `inline-translate`).
