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
