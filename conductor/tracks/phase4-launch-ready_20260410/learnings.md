# Track Learnings: phase4-launch-ready_20260410

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Code Conventions
- ESLint 9 uses flat config (eslint.config.mjs), no `--ext` flag needed.
- `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup.

### Architecture
- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/).
- CSS import in content script must use `@/styles/inject.css` (not relative).
- Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart).
- WXT build produces ~346KB total for chrome-mv3 output.

### Gotchas
- WXT `init` refuses to run in non-empty directories — init in temp dir, then copy.
- `pnpm approve-builds` is interactive — must select & confirm esbuild + spawn-sync.
- `parentElement.querySelector()` only searches children — use `document.querySelector()` for sibling lookups.

### Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite).

### Type System
- Use string union types (not enums) for discriminated unions — keeps bundle small.
- Export `DEFAULT_SETTINGS` alongside types for single source of truth on initial values.
- `PROVIDER_PRESETS` array with metadata enables preset selection UX without hardcoding.

### State Management
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged`.
- Deep merge for nested settings objects — handle separately to avoid losing fields on partial updates.
- `isLoaded` flag in store prevents rendering before storage load completes.

### Theming & CSS
- Attribute scoping: `[data-lingua-theme="name"]` on `<html>` cleanly scopes themes without class conflicts.

### Options Page
- WXT auto-discovers `entrypoints/options/` as the options page — no manifest config needed.
- Vertical tabbed layout with ARIA `role="tablist"` works well at 8+ sections.

### Prompt System
- Variable injection (`{{targetLanguage}}`, `{{glossary}}`) via regex replace is backward compatible.

### Build
- pnpm not installed globally on this system — use `npx -y pnpm@latest exec` or `npx -y pnpm@latest install`.

### Subtitle & Interception
- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'`.
- postMessage bridge uses channel identifier ('lingua-lens') with origin validation and requestId correlation.
- Fetch interceptor must call `response.clone()` before `.text()`.
- Maximum z-index (2147483647) for overlay visibility over video players.

---

<!-- Learnings from implementation will be appended below -->
