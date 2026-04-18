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

<!-- Learnings from implementation will be appended below -->
