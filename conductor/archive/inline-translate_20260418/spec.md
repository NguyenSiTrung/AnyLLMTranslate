# Spec: Inline Input Translation via Key Gesture

## Overview

Add an inline translation feature triggered by a configurable rapid key-press gesture
(default: triple-space within 500ms) that detects text inside the currently focused
editable element, translates it to the user's configured target language, and replaces
the content in-place — enabling use cases like writing in Vietnamese and quickly
converting to English for search queries, chat messages, comments, etc.

## Functional Requirements

### FR-1: Gesture Detection Engine
- **FR-1.1**: Detect rapid consecutive key presses on the configured trigger key
  (default: Space) within a configurable time window (default: 500ms).
- **FR-1.2**: Default tap count: 3 (configurable via settings).
- **FR-1.3**: Only activate when the focused element is an editable element
  (`<input type="text">`, `<input type="search">`, `<textarea>`, `contentEditable`).
- **FR-1.4**: Remove the trailing trigger characters (e.g., extra spaces) from the
  input before sending for translation.
- **FR-1.5**: Ignore the gesture if the input field is empty or contains only whitespace.
- **FR-1.6**: Debounce to prevent re-triggering while a translation is in progress.

### FR-2: Inline Translation & Replacement
- **FR-2.1**: Extract text content from the focused editable element.
- **FR-2.2**: Send text to the background service worker via `chrome.runtime.sendMessage`
  using the existing `translateSelection` action pattern.
- **FR-2.3**: Replace the field content with the translated text upon success.
- **FR-2.4**: For `<input>` and `<textarea>`, use `document.execCommand('insertText')`
  (or `InputEvent`-based approach) to preserve the browser's native undo stack (`Ctrl+Z`).
- **FR-2.5**: For `contentEditable` elements, use `execCommand('selectAll')` +
  `execCommand('insertText')` to maintain undo history.
- **FR-2.6**: Store the original text in memory as a fallback undo mechanism
  (accessible via a custom undo shortcut or re-triggering the gesture).
- **FR-2.7**: Dispatch `input` and `change` events on the element after replacement
  so that frameworks (React, Angular, Vue) detect the value change.

### FR-3: Visual Feedback
- **FR-3.1**: While translating, apply a pulsing border/outline animation to the
  active input field (CSS class injection, non-destructive).
- **FR-3.2**: Show a small floating toast near the input: "Translating..." during
  the request, then "Translated ✓" on success or "⚠ Translation failed" on error.
- **FR-3.3**: Remove the pulsing border and auto-dismiss the toast after 2 seconds.
- **FR-3.4**: Toast must not interfere with the input's focus or cursor position.

### FR-4: Settings Integration
- **FR-4.1**: Add a new "Inline Translation" section in Options page with:
  - Enable/disable toggle (default: enabled)
  - Trigger key selector (default: Space)
  - Tap count (default: 3, range: 2–5)
  - Time window in ms (default: 500, range: 200–1000)
- **FR-4.2**: Persist settings via the existing Zustand store + chrome.storage.
- **FR-4.3**: Add a keyboard shortcut display in the Shortcuts section showing the
  configured gesture.

### FR-5: Edge Cases & Safety
- **FR-5.1**: Do not trigger inside password fields (`<input type="password">`).
- **FR-5.2**: Do not trigger inside code editors (Monaco, CodeMirror, Ace) — detect
  by common class names or `role="textbox"` with code-specific attributes.
- **FR-5.3**: Respect site rules — if the site is excluded via extension settings,
  do not activate the gesture listener.
- **FR-5.4**: Handle translation errors gracefully — restore original text on failure
  and show error toast.

## Non-Functional Requirements

- Must not add perceptible input lag (gesture detection < 5ms per keystroke).
- Must pass all existing 526+ tests without regression.
- Build must remain under 600KB.
- No new npm dependencies.
- CSS animations must respect `prefers-reduced-motion`.

## Acceptance Criteria

- [ ] Triple-space in a text input triggers translation of the field's content.
- [ ] Translated text replaces original; `Ctrl+Z` reverts to original.
- [ ] Pulsing border appears on the field during translation.
- [ ] Toast notification shows "Translating..." → "Translated ✓".
- [ ] Settings page allows configuring trigger key, tap count, and time window.
- [ ] Feature can be disabled in settings.
- [ ] Password fields and code editors are excluded.
- [ ] Translation errors restore original text and show error toast.
- [ ] No input lag or focus loss during the process.

## Out of Scope

- Translation of selected text within an input (existing text selection feature covers this).
- Rich formatting preservation in contentEditable (Phase 2 — initial version treats as plain text).
- Auto-detect source language (uses the user's configured source language setting).
- Mobile browser support.
