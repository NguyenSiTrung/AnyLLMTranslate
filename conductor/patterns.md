# Codebase Patterns

Reusable patterns discovered during development. Read this before starting new work.

## Code Conventions
- ESLint 9 uses flat config (eslint.config.mjs), no `--ext` flag needed. (from: phase1-foundation_20260409, archived 2026-04-09)
- `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup. (from: phase1-foundation_20260409, archived 2026-04-09)

## Architecture
- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/). (from: phase1-foundation_20260409, archived 2026-04-09)
- CSS import in content script must use `@/styles/inject.css` (not relative), since entrypoint is in `entrypoints/` but CSS is in `styles/`. (from: phase1-foundation_20260409, archived 2026-04-09)
- Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart). Cache is persistent via IndexedDB. (from: phase1-foundation_20260409, archived 2026-04-09)
- WXT build produces 252KB total for chrome-mv3 output. (from: phase1-foundation_20260409, archived 2026-04-09)

## Gotchas
- WXT `init` refuses to run in non-empty directories — init in temp dir, then copy. (from: phase1-foundation_20260409, archived 2026-04-09)
- `pnpm approve-builds` is interactive — must select & confirm esbuild + spawn-sync. (from: phase1-foundation_20260409, archived 2026-04-09)
- `parentElement.querySelector()` only searches children — use `document.querySelector()` for sibling lookups. (from: phase1-foundation_20260409, archived 2026-04-09)

## Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite). (from: phase1-foundation_20260409, archived 2026-04-09)

## Build
- pnpm not installed globally on this system — use `npx -y pnpm@latest exec` or `npx -y pnpm@latest install` for all pnpm commands. (from: phase1-foundation_20260409, archived 2026-04-09)

---
Last refreshed: 2026-04-09T18:17:00+07:00
