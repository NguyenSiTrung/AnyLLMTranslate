# Track Learnings: pdf-translation_20260612

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- **Architecture:** WXT uses the `entrypoints/` directory for background.ts, content.ts, popup/. Other code lives at the project root (`lib/`, `types/`, `services/`, `content/`).
- **Options / Configuration:** WXT auto-discovers `entrypoints/options/` as the options page. Custom pages must be defined in `wxt.config.ts`.
- **State Management:** Zustand + `chrome.storage` bidirectional sync: write on mutation, listen via `chrome.storage.onChanged` for cross-context updates.
- **Gotchas:** `npx -y pnpm@latest exec` or `npx -y pnpm@latest install` must be used for pnpm commands since pnpm is not installed globally.
- **Testing:** DOM-dependent tests using MutationObserver or event listeners in Vitest/jsdom require an async event loop tick (e.g., `await Promise.resolve()`) to allow handlers to register before asserting results.

---

<!-- Learnings from implementation will be appended below -->
