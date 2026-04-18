# Plan: Inline Input Translation via Key Gesture

## Phase 1: Gesture Detection Engine & Core Module
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Create `content/inlineTranslate.ts` — gesture detector
  <!-- files: content/inlineTranslate.ts -->
  - [ ] Implement `GestureDetector` class with configurable key, tap count, time window
  - [ ] Track consecutive key presses with timestamp-based window validation
  - [ ] Detect focused editable elements (input[text], input[search], textarea, contentEditable)
  - [ ] Strip trailing trigger characters (extra spaces) from input value
  - [ ] Guard: skip empty/whitespace-only fields, password fields
  - [ ] Guard: skip code editors (Monaco, CodeMirror, Ace) via class/attribute detection
  - [ ] Export `initInlineTranslate()` returning cleanup function (follows existing pattern)
  - [ ] Commit: `feat(content): add inline translate gesture detection engine`

- [ ] Task 2: Create `content/__tests__/inlineTranslate.test.ts` — gesture detection tests
  <!-- files: content/__tests__/inlineTranslate.test.ts -->
  <!-- depends: task1 -->
  - [ ] Test: triple-space within window triggers callback
  - [ ] Test: triple-space exceeding window does NOT trigger
  - [ ] Test: ignores non-editable focused elements
  - [ ] Test: ignores password fields
  - [ ] Test: ignores code editor elements
  - [ ] Test: strips trailing trigger characters
  - [ ] Test: skips empty/whitespace inputs
  - [ ] Test: configurable key, count, and window
  - [ ] Test: debounce prevents re-trigger during active translation
  - [ ] Commit: `test(content): add gesture detection unit tests`

- [ ] Task 3: Wire into content script entry point
  <!-- files: entrypoints/content.ts -->
  <!-- depends: task1 -->
  - [ ] Import and call `initInlineTranslate()` in content script initialization
  - [ ] Store cleanup function for teardown
  - [ ] Commit: `feat(content): wire inline translate into content script`

## Phase 2: Translation & Text Replacement
<!-- execution: parallel -->
<!-- depends: phase1 -->

- [ ] Task 1: Implement inline translation request flow
  <!-- files: content/inlineTranslate.ts -->
  - [ ] Extract text from focused element (value for input/textarea, textContent for contentEditable)
  - [ ] Send `translateSelection` message to background via `chrome.runtime.sendMessage`
  - [ ] Use existing `loadSettings()` for source/target language config
  - [ ] Commit: `feat(content): add inline translation request flow`

- [ ] Task 2: Implement text replacement with undo support
  <!-- files: content/inlineTranslate.ts -->
  <!-- depends: task1 -->
  - [ ] For `<input>`/`<textarea>`: select all → `document.execCommand('insertText')` for native undo
  - [ ] For `contentEditable`: `execCommand('selectAll')` + `execCommand('insertText')`
  - [ ] Store original text in module-level map (element → original text) for fallback undo
  - [ ] Dispatch synthetic `input` and `change` events for framework compatibility
  - [ ] Restore cursor position to end of translated text
  - [ ] Commit: `feat(content): inline text replacement with native undo support`

- [ ] Task 3: Add translation & replacement tests
  <!-- files: content/__tests__/inlineTranslate.test.ts -->
  <!-- depends: task1, task2 -->
  - [ ] Test: successful translation replaces input value
  - [ ] Test: successful translation replaces textarea content
  - [ ] Test: successful translation replaces contentEditable textContent
  - [ ] Test: Ctrl+Z restores original (via execCommand path)
  - [ ] Test: fallback undo map stores and retrieves original text
  - [ ] Test: synthetic input/change events dispatched after replacement
  - [ ] Test: error restores original text
  - [ ] Commit: `test(content): add translation and replacement tests`

## Phase 3: Visual Feedback System
<!-- execution: parallel -->
<!-- depends: phase2 -->

- [ ] Task 1: Implement pulsing border and toast feedback
  <!-- files: content/inlineTranslate.ts, styles/inject.css -->
  - [ ] Create CSS class `anyllm-inline-translating` with pulsing border animation
  - [ ] Add CSS to existing `styles/inject.css` content-injected styles
  - [ ] Apply/remove class on the focused element during translation lifecycle
  - [ ] Create lightweight floating toast element near the input (reuse toast pattern)
  - [ ] Toast states: "Translating..." (loading) → "Translated ✓" (success) → auto-dismiss 2s
  - [ ] Error state: "⚠ Translation failed" toast
  - [ ] Ensure toast doesn't steal focus from input
  - [ ] Respect `prefers-reduced-motion` for pulsing animation
  - [ ] Commit: `feat(content): add inline translation visual feedback`

- [ ] Task 2: Visual feedback tests
  <!-- files: content/__tests__/inlineTranslate.test.ts -->
  <!-- depends: task1 -->
  - [ ] Test: pulsing class added during translation, removed after
  - [ ] Test: toast appears with loading state, updates to success
  - [ ] Test: toast shows error message on failure
  - [ ] Test: toast auto-dismisses after timeout
  - [ ] Test: input focus preserved during toast display
  - [ ] Commit: `test(content): add visual feedback tests`

## Phase 4: Settings Integration
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Extend settings store with inline translate config
  <!-- files: lib/config.ts, types/settings.ts -->
  - [ ] Add `inlineTranslate` settings to Zustand store type:
    `{ enabled: boolean; triggerKey: string; tapCount: number; timeWindowMs: number }`
  - [ ] Set defaults: `{ enabled: true, triggerKey: ' ', tapCount: 3, timeWindowMs: 500 }`
  - [ ] Persist via existing chrome.storage sync pattern
  - [ ] Commit: `feat(lib): add inline translate settings to config store`

- [ ] Task 2: Create Options page section `InlineTranslateSection.tsx`
  <!-- files: entrypoints/options/sections/InlineTranslateSection.tsx -->
  <!-- depends: task1 -->
  - [ ] Enable/disable toggle
  - [ ] Trigger key selector (dropdown or text input)
  - [ ] Tap count slider (range: 2–5)
  - [ ] Time window slider (range: 200–1000ms)
  - [ ] Follow existing section design patterns (Card, FieldGroup, etc.)
  - [ ] Commit: `feat(options): add Inline Translation settings section`

- [ ] Task 3: Wire settings to gesture detector at runtime
  <!-- files: content/inlineTranslate.ts, entrypoints/content.ts -->
  <!-- depends: task1, phase1 -->
  - [ ] Load inline translate settings on content script init
  - [ ] Listen for settings changes and update gesture detector config dynamically
  - [ ] Disable/enable gesture listener based on toggle
  - [ ] Update ShortcutsSection to display inline translate gesture
  - [ ] Commit: `feat(content): wire inline translate settings to runtime`

- [ ] Task 4: Settings integration tests
  <!-- files: content/__tests__/inlineTranslate.test.ts, entrypoints/options/sections/__tests__/InlineTranslateSection.test.tsx -->
  <!-- depends: task2, task3 -->
  - [ ] Test: settings default values loaded correctly
  - [ ] Test: settings toggle enables/disables gesture listener
  - [ ] Test: settings changes update gesture config dynamically
  - [ ] Test: InlineTranslateSection renders all controls
  - [ ] Commit: `test(options): add inline translate settings tests`

## Phase 5: Phase Verification
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4 -->

- [ ] Task: Run full test suite and lint
  - [ ] `pnpm test` — all tests passing
  - [ ] `pnpm lint` — no new lint errors
  - [ ] `pnpm build` — build under 600KB
  - [ ] Manual verification: test triple-space in Google search, a textarea, and a contentEditable field
  - [ ] Update track learnings
  - [ ] Commit: `chore(conductor): inline translate track verification`
