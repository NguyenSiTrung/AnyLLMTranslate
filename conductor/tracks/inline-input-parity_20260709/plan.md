# Plan: Inline Input Translation — Immersive-Parity Hardening

Sequential execution (shared modules). TDD: red → green → refactor per task where logic is pure/testable.

**Reference:** Immersive Translate `content_main.js` `[input-translate]` behaviors; existing `content/inlineTranslate.ts`.

---

## Phase 1: Settings model & defaults
<!-- execution: sequential -->

- [ ] Task 1: Extend `InlineTranslateSettings` + defaults
  <!-- files: types/config.ts -->
  - [ ] Add fields: `idleMs`, `triggerGapMs`, `triggerToleranceCount`, `enableLanguagePrefix`, `languagePrefix`, `dualMode`, `blocklistPatterns` (string[]), `enableFallbackUndo` (or equivalent names)
  - [ ] Expand `DEFAULT_INLINE_TRANSLATE_SETTINGS` with Immersive-aligned safe defaults
  - [ ] Keep backward compatibility: missing nested fields deep-merged to defaults
  - [ ] Document each field in JSDoc

- [ ] Task 2: Ensure deep-merge / store / load paths pick up new fields
  <!-- files: lib/config.ts, stores/settingsStore.ts -->
  <!-- depends: task1 -->
  - [ ] Verify `deepMerge` / `extractSettings` includes all new `inlineTranslate` keys
  - [ ] Add/adjust unit tests if config helpers have existing coverage

- [ ] Task 3: Language-prefix alias table (pure)
  <!-- files: lib/inlineTranslatePrefix.ts (or content/inlineTranslate/prefix.ts), tests -->
  <!-- depends: task1 -->
  - [ ] Implement `parseLanguagePrefix(text, options) → { targetLang?, body, rawPrefix? }`
  - [ ] Support `/en`, aliases (zh/zh-CN/中文, ja/日语, vi, etc.)
  - [ ] Unit tests: match, strip, no-match, disabled, custom prefix char

---

## Phase 2: Module split + P0 gesture / race safety
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 1: Split `content/inlineTranslate.ts` into package
  <!-- files: content/inlineTranslate/**, content/inlineTranslate.ts re-export if needed -->
  - [ ] Create modules: `editable.ts`, `gesture.ts`, `writeback.ts`, `feedback.ts`, `prefix.ts` (or import from lib), `blocklist.ts`, `orchestrate.ts` / `index.ts`
  - [ ] Preserve public API: `initInlineTranslate`, `setInlineTranslateEnabled`, `updateInlineTranslateConfig`, test helpers as needed
  - [ ] Update imports in `entrypoints/content.ts` and tests
  - [ ] All existing tests still pass after move (behavior-neutral split)

- [ ] Task 2: Editable guards + deep active element (TDD)
  <!-- files: content/inlineTranslate/editable.ts, tests -->
  <!-- depends: task1 -->
  - [ ] `isEditableElement`: exclude `readOnly`, `disabled`, password
  - [ ] `getDeepActiveElement(doc, enableDeep?)` — shadowRoot / iframe / CE caret
  - [ ] Improve `isCodeEditor` coverage if cheap
  - [ ] Unit tests for guards; document jsdom limits for shadow/iframe

- [ ] Task 3: Gesture IME / repeat / composition (TDD)
  <!-- files: content/inlineTranslate/gesture.ts, tests -->
  <!-- depends: task1 -->
  - [ ] Ignore `!isTrusted`, `isComposing`, `repeat`
  - [ ] Reset on compositionend / delete inputTypes where listened
  - [ ] Dual listeners: keydown + input/keyup/compositionend as needed
  - [ ] Optional idle debounce after last tap (`idleMs`)
  - [ ] Caret-at-end check for trailing trigger (input/textarea `selectionStart`)
  - [ ] Tests: IME, repeat, empty, window, idle, caret mid-string skip

- [ ] Task 4: Race-safe orchestration (TDD)
  <!-- files: content/inlineTranslate/index.ts or orchestrate.ts, tests -->
  <!-- depends: task2, task3 -->
  - [ ] Snapshot rawText + element before `sendMessage`
  - [ ] Abort write if text/element changed or disconnected
  - [ ] Request id + cancel window when user types during in-flight
  - [ ] Clear toast/pulse on abort
  - [ ] Tests with delayed mock `sendMessage`

---

## Phase 3: Multi-strategy write-back + undo + dual mode
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [ ] Task 1: Write-back pipeline (TDD)
  <!-- files: content/inlineTranslate/writeback.ts, tests -->
  - [ ] Strategy chain: InputEvent+execCommand → insertText only → value/textContent + events
  - [ ] Verify post-write text matches expected
  - [ ] Dual mode join helper (input vs textarea separator)
  - [ ] Default translation-only
  - [ ] Tests: success, strategy fallback, dual join, restore original on total fail

- [ ] Task 2: Wire write-back into orchestrator + fallback undo
  <!-- files: content/inlineTranslate/*, tests -->
  <!-- depends: task1 -->
  - [ ] Replace old `replaceElementText` usage with pipeline
  - [ ] Populate `undoMap`; re-trigger or affordance restores original when enabled
  - [ ] Document Ctrl+Z (native) vs fallback path
  - [ ] Tests for undoMap restore

- [ ] Task 3: Feedback polish
  <!-- files: content/inlineTranslate/feedback.ts, styles/inject.css -->
  <!-- depends: task2 -->
  - [ ] Cancel clears feedback
  - [ ] Minor toast position fix if cheap (reposition or bottom fallback)

---

## Phase 4: Blocklist + prefix integration
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [ ] Task 1: URL blocklist matcher (TDD)
  <!-- files: content/inlineTranslate/blocklist.ts or lib/, tests -->
  - [ ] Match hostname/URL against patterns (wildcard support like Immersive seed list)
  - [ ] Default patterns: Notion, Figma, Lark/Feishu-class hosts from Immersive seed
  - [ ] User patterns from settings merged with defaults (or replace-with-override policy documented)

- [ ] Task 2: Integrate prefix + blocklist into gesture/shortcut pipeline
  <!-- files: content/inlineTranslate/index.ts, tests -->
  <!-- depends: task1 -->
  - [ ] On fire: if blocklisted → no-op (debug log)
  - [ ] Parse prefix for targetLang override; strip before translate
  - [ ] Gesture still required (prefix alone does not fire)
  - [ ] Tests: blocked URL, `/en hello   ` → en target + stripped body

---

## Phase 5: chrome.commands Alt+I
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [ ] Task 1: Manifest command + background routing
  <!-- files: wxt.config.ts, entrypoints/background.ts, types/messages.ts -->
  - [ ] Add `translate-input-box` command suggested `Alt+I`
  - [ ] Background `onCommand` → `sendToActiveTab({ action: 'translateInputBox' })`
  - [ ] Extend `MessageAction` / message types as needed

- [ ] Task 2: Content handler
  <!-- files: entrypoints/content.ts, content/inlineTranslate/*, tests -->
  <!-- depends: task1 -->
  - [ ] Handle `translateInputBox`: deep active editable → same orchestrate path (no trailing-space strip unless present)
  - [ ] Respect enabled flag + blocklist
  - [ ] Unit/integration-style test of handler entry (mock focus + message)

---

## Phase 6: Options advanced UI + regression
<!-- execution: sequential -->
<!-- depends: phase5 -->

- [ ] Task 1: Full advanced Inline Translate panel
  <!-- files: entrypoints/options/sections/InlineTranslateSection.tsx -->
  - [ ] All new knobs: idle/gap/tolerance, prefix enable+char, dual mode, blocklist textarea/list editor, shortcut hint
  - [ ] Use existing UI primitives (Toggle, Slider, FieldGroup, AdvancedDisclosure only if it improves density — **full advanced panel** per spec means all knobs visible, not buried)
  - [ ] Persist via `updateSettings({ inlineTranslate: { ... } })`
  - [ ] Accessibility: labels, keyboard

- [ ] Task 2: Content wiring for live settings updates
  <!-- files: entrypoints/content.ts -->
  <!-- depends: task1 -->
  - [ ] `updateInlineTranslateConfig` accepts full extended config
  - [ ] Storage listener already present — verify all fields flow through

- [ ] Task 3: Full regression suite
  <!-- files: content/__tests__/*, lib tests -->
  <!-- depends: task1, task2 -->
  - [ ] Port/update original triple-space tests to new module layout
  - [ ] Cover FR acceptance criteria from `spec.md`
  - [ ] Run `pnpm test` + `pnpm lint`
  - [ ] Manual smoke notes in learnings: Google Search, ChatGPT input, Vietnamese IME

---

## Notes

- Prefer pure helpers in `lib/` when reusable outside content script; keep DOM-coupled code under `content/inlineTranslate/`.
- Do not copy Immersive minified source; reimplement with clean types.
- Commit after each task (Conventional Commits, scope `inline-translate`).
