# Plan: Inline Input Translation via Key Gesture

## Phase 1: Gesture Detection Engine & Core Module
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1: Create `content/inlineTranslate.ts` — gesture detector
  <!-- files: content/inlineTranslate.ts -->
  - [x] Implement `GestureDetector` class with configurable key, tap count, time window
  - [x] Track consecutive key presses with timestamp-based window validation
  - [x] Detect focused editable elements (input[text], input[search], textarea, contentEditable)
  - [x] Strip trailing trigger characters (extra spaces) from input value
  - [x] Guard: skip empty/whitespace-only fields, password fields
  - [x] Guard: skip code editors (Monaco, CodeMirror, Ace) via class/attribute detection
  - [x] Export `initInlineTranslate()` returning cleanup function (follows existing pattern)

- [x] Task 2: Create `content/__tests__/inlineTranslate.test.ts` — gesture detection tests
  <!-- files: content/__tests__/inlineTranslate.test.ts -->
  <!-- depends: task1 -->
  - [x] Test: triple-space within window triggers callback
  - [x] Test: triple-space exceeding window does NOT trigger
  - [x] Test: ignores non-editable focused elements
  - [x] Test: ignores password fields
  - [x] Test: ignores code editor elements
  - [x] Test: strips trailing trigger characters
  - [x] Test: skips empty/whitespace inputs
  - [x] Test: configurable key, count, and window
  - [x] Test: debounce prevents re-trigger during active translation

- [x] Task 3: Wire into content script entry point
  <!-- files: entrypoints/content.ts -->
  <!-- depends: task1 -->
  - [x] Import and call `initInlineTranslate()` in content script initialization
  - [x] Store cleanup function for teardown

## Phase 2: Translation & Text Replacement
<!-- execution: parallel -->
<!-- depends: phase1 -->

- [x] Task 1: Implement inline translation request flow
  <!-- files: content/inlineTranslate.ts -->
  - [x] Extract text from focused element (value for input/textarea, textContent for contentEditable)
  - [x] Send `translateSelection` message to background via `chrome.runtime.sendMessage`
  - [x] Use existing `loadSettings()` for source/target language config

- [x] Task 2: Implement text replacement with undo support
  <!-- files: content/inlineTranslate.ts -->
  <!-- depends: task1 -->
  - [x] For `<input>`/`<textarea>`: select all → `document.execCommand('insertText')` for native undo
  - [x] For `contentEditable`: `execCommand('selectAll')` + `execCommand('insertText')`
  - [x] Store original text in module-level map (element → original text) for fallback undo
  - [x] Dispatch synthetic `input` and `change` events for framework compatibility
  - [x] Graceful fallback for environments without execCommand (jsdom)

- [x] Task 3: Add translation & replacement tests
  <!-- files: content/__tests__/inlineTranslate.test.ts -->
  <!-- depends: task1, task2 -->
  - [x] Test: successful translation replaces input value
  - [x] Test: fallback undo map stores and retrieves original text
  - [x] Test: synthetic input/change events dispatched after replacement
  - [x] Test: error restores original text

## Phase 3: Visual Feedback System
<!-- execution: parallel -->
<!-- depends: phase2 -->

- [x] Task 1: Implement pulsing border and toast feedback
  <!-- files: content/inlineTranslate.ts, styles/inject.css -->
  - [x] Create CSS class `anyllm-inline-translating` with pulsing border animation
  - [x] Add CSS to existing `styles/inject.css` content-injected styles
  - [x] Apply/remove class on the focused element during translation lifecycle
  - [x] Create lightweight floating toast element near the input (reuse toast pattern)
  - [x] Toast states: "Translating..." (loading) → "Translated ✓" (success) → auto-dismiss 2s
  - [x] Error state: "⚠ Translation failed" toast
  - [x] Ensure toast doesn't steal focus from input (pointer-events: none)
  - [x] Respect `prefers-reduced-motion` for pulsing animation

- [x] Task 2: Visual feedback tests
  <!-- files: content/__tests__/inlineTranslate.test.ts -->
  <!-- depends: task1 -->
  - [x] Test: pulsing class added during translation, removed after
  - [x] Test: toast appears with loading state, updates to success
  - [x] Test: toast shows error message on failure
  - [x] Test: toast auto-dismisses after timeout

## Phase 4: Settings Integration
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1: Extend settings store with inline translate config
  <!-- files: lib/config.ts, types/config.ts, stores/settingsStore.ts -->
  - [x] Add `InlineTranslateSettings` interface to types/config.ts
  - [x] Add `inlineTranslate` to `ExtensionSettings` interface
  - [x] Set defaults: `{ enabled: true, triggerKey: ' ', tapCount: 3, timeWindowMs: 500 }`
  - [x] Deep-merge in loadSettings, updateSettings, and settingsStore
  - [x] Persist via existing chrome.storage sync pattern

- [x] Task 2: Create Options page section `InlineTranslateSection.tsx`
  <!-- files: entrypoints/options/sections/InlineTranslateSection.tsx, entrypoints/options/App.tsx -->
  <!-- depends: task1 -->
  - [x] Enable/disable toggle
  - [x] Tap count slider (range: 2–5)
  - [x] Time window slider (range: 200–1000ms)
  - [x] Gesture preview display
  - [x] Usage hints card
  - [x] Follow existing section design patterns (Card, Toggle, Slider, FieldGroup)
  - [x] Add "Inline" tab to SYSTEM group in App.tsx

- [x] Task 3: Wire settings to gesture detector at runtime
  <!-- files: content/inlineTranslate.ts, entrypoints/content.ts -->
  <!-- depends: task1, phase1 -->
  - [x] Load inline translate settings on content script init
  - [x] Listen for settings changes and update gesture detector config dynamically
  - [x] Disable/enable gesture listener based on toggle
  - [x] Update ShortcutsSection to display inline translate gesture

- [x] Task 4: Settings integration tests
  <!-- files: content/__tests__/inlineTranslate.test.ts -->
  <!-- depends: task2, task3 -->
  - [x] Test: settings default values loaded correctly
  - [x] Test: settings toggle enables/disables gesture listener
  - [x] Test: settings changes update gesture config dynamically

## Phase 5: Phase Verification
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4 -->

- [x] Task: Run full test suite and lint
  - [x] `npx vitest run` — 563 tests passing across 43 files (37 new)
  - [x] `npm run build` — build at 586.72 KB (under 600KB limit)
  - [x] Update track learnings
