# Track Learnings: phase3-ux-polish_20260410

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Code Conventions
- ESLint 9 uses flat config (eslint.config.mjs), no `--ext` flag needed.
- `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup.

### Architecture
- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/).
- CSS import in content script must use `@/styles/inject.css` (not relative), since entrypoint is in `entrypoints/` but CSS is in `styles/`.
- Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart). Cache is persistent via IndexedDB.

### Gotchas
- WXT `init` refuses to run in non-empty directories — init in temp dir, then copy.
- `pnpm approve-builds` is interactive — must select & confirm esbuild + spawn-sync.
- `parentElement.querySelector()` only searches children — use `document.querySelector()` for sibling lookups.

### Subtitle & Interception
- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` in wxt.config.ts.
- postMessage bridge uses channel identifier ('lingua-lens') with origin validation and requestId correlation.
- Fetch interceptor must call `response.clone()` before `.text()` — Response body can only be read once.

### Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite).

### Build
- pnpm not installed globally on this system — use `npx -y pnpm@latest exec` or `npx -y pnpm@latest install` for all pnpm commands.

---

<!-- Learnings from implementation will be appended below -->
