# Track Learnings: inline-translate_20260418

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- Content script modules export `init*()` returning cleanup function (e.g., `initTextSelection`, `initKeyboardShortcuts`).
- Translation requests use `chrome.runtime.sendMessage({ action: 'translateSelection', text, sourceLanguage, targetLanguage })`.
- Settings loaded via `loadSettings()` from `@/lib/config`.
- Zustand + chrome.storage bidirectional sync for cross-context settings updates.
- CSS injected via `styles/inject.css` with `data-anyllm-*` attribute scoping.
- Keyboard shortcuts split: global (chrome.commands in background) vs page-specific (keydown listener in content).
- `document.execCommand('insertText')` preserves browser native undo stack.
- Dispatch synthetic `input`/`change` events for React/Angular/Vue framework compatibility.

---

## Implementation Discoveries

- Triple-keypress gesture detection requires the capture phase (`true` as third argument to `addEventListener`) to ensure interception before page-level key handlers (e.g., spacebar scrolling).
- Using `setTimeout(fn, 0)` after gesture detection allows the last character (e.g., the 3rd space) to land in the input buffer before the text is extracted for translation.
- `document.execCommand('insertText')` is the most reliable way to replace text in standard inputs while preserving the browser's native undo stack.
- Multi-framework compatibility (React, Vue) requires dispatching both `input` and `change` events manually after programmatically updating values.
- **Gotcha:** `loadSettings` must be carefully mocked to include all nested objects (like `inlineTranslate`) to avoid `undefined` property access errors in tests.
