# Codebase Patterns

Reusable patterns discovered during development. Read this before starting new work.

## Code Conventions
- ESLint 9 uses flat config (eslint.config.mjs), no `--ext` flag needed. (from: phase1-foundation_20260409, archived 2026-04-09)
- `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup. (from: phase1-foundation_20260409, archived 2026-04-09)

## Architecture
- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/). (from: phase1-foundation_20260409, archived 2026-04-09)
- CSS import in content script must use `@/styles/inject.css` (not relative), since entrypoint is in `entrypoints/` but CSS is in `styles/`. (from: phase1-foundation_20260409, archived 2026-04-09)
- Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart). Cache is persistent via IndexedDB. (from: phase1-foundation_20260409, archived 2026-04-09)
- WXT build produces ~346KB total for chrome-mv3 output (grew from ~270KB after Phase 3 options page). (from: phase1-foundation_20260409, updated 2026-04-10)

## Gotchas
- WXT `init` refuses to run in non-empty directories — init in temp dir, then copy. (from: phase1-foundation_20260409, archived 2026-04-09)
- `pnpm approve-builds` is interactive — must select & confirm esbuild + spawn-sync. (from: phase1-foundation_20260409, archived 2026-04-09)
- `parentElement.querySelector()` only searches children — use `document.querySelector()` for sibling lookups. (from: phase1-foundation_20260409, archived 2026-04-09)

## Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite). (from: phase1-foundation_20260409, archived 2026-04-09)

## Subtitle & Interception
- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` in wxt.config.ts for XHR/fetch access. (from: phase2-subtitles_20260409, archived 2026-04-09)
- postMessage bridge uses channel identifier ('lingua-lens') with origin validation and requestId correlation for MAIN ↔ ISOLATED world communication. (from: phase2-subtitles_20260409, archived 2026-04-09)
- Fetch interceptor must call `response.clone()` before `.text()` — Response body can only be read once. (from: phase2-subtitles_20260409, archived 2026-04-09)
- XHR responseText override via `Object.defineProperty` needs `configurable: true` for reassignment. (from: phase2-subtitles_20260409, archived 2026-04-09)
- DOMParser (browser API) for XML parsing (YouTube srv3 format) — no external parser needed. (from: phase2-subtitles_20260409, archived 2026-04-09)
- ResizeObserver for responsive video overlay positioning — handles video resize events. (from: phase2-subtitles_20260409, archived 2026-04-09)
- Fullscreen transitions need setTimeout (~100ms) for repositioning after DOM settles. (from: phase2-subtitles_20260409, archived 2026-04-09)
- Maximum z-index (2147483647) for overlay visibility over video players. (from: phase2-subtitles_20260409, archived 2026-04-09)
- BOM marker (\uFEFF) handling in subtitle parsers — strip before parsing. (from: phase2-subtitles_20260409, archived 2026-04-09)
- Format detection heuristics: WEBVTT header, sequence number pattern, comma vs period in timing. (from: phase2-subtitles_20260409, archived 2026-04-09)
- CORS bypass for subtitle fetching: direct fetch first, fallback to chrome.runtime.sendMessage via background worker. (from: phase2-subtitles_20260409, archived 2026-04-09)

## Type System
- Use string union types (not enums) for discriminated unions like `ThemeName`/`ProviderPreset` — keeps bundle small and enables exhaustive matching. (from: phase3-ux-polish_20260410, archived 2026-04-10)
- Export `DEFAULT_SETTINGS` alongside types for single source of truth on initial values. (from: phase3-ux-polish_20260410, archived 2026-04-10)
- `PROVIDER_PRESETS` array with `requiresApiKey`, `placeholder`, `baseUrl`, `defaultModel` enables preset selection UX without hardcoding. (from: phase3-ux-polish_20260410, archived 2026-04-10)

## State Management
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged` for cross-context updates (popup ↔ options ↔ content). (from: phase3-ux-polish_20260410, archived 2026-04-10)
- Deep merge for nested settings objects (provider, subtitleSettings) — handle separately to avoid losing fields on partial updates. (from: phase3-ux-polish_20260410, archived 2026-04-10)
- `isLoaded` flag in store prevents rendering before storage load completes — critical to avoid flash of defaults. (from: phase3-ux-polish_20260410, archived 2026-04-10)

## Theming & CSS
- Attribute scoping: `[data-lingua-theme="name"]` on `<html>` cleanly scopes themes without class conflicts. (from: phase3-ux-polish_20260410, archived 2026-04-10)

## Options Page
- WXT auto-discovers `entrypoints/options/` as the options page — no manifest config needed. (from: phase3-ux-polish_20260410, archived 2026-04-10)
- Vertical tabbed layout (sidebar + content area) with ARIA `role="tablist"` works well at 8+ sections. (from: phase3-ux-polish_20260410, archived 2026-04-10)

## Prompt System
- Variable injection (`{{targetLanguage}}`, `{{glossary}}`) via regex replace is backward compatible with existing `buildSystemPrompt(lang)` calls. (from: phase3-ux-polish_20260410, archived 2026-04-10)

## Build
- pnpm not installed globally on this system — use `npx -y pnpm@latest exec` or `npx -y pnpm@latest install` for all pnpm commands. (from: phase1-foundation_20260409, archived 2026-04-09)

## Refactoring
- ProviderPreset type change requires immediate PROVIDER_PRESETS array update to avoid TypeScript errors (interdependent changes). (from: provider-simplify_20260410, archived 2026-04-10)
- Test files using removed type values must be updated before TypeScript compilation will pass. (from: provider-simplify_20260410, archived 2026-04-10)
- UI components using array.map() automatically reflect array changes - no UI code updates needed for data-driven components. (from: provider-simplify_20260410, archived 2026-04-10)
- Pre-existing lint errors in codebase are not introduced by this refactor - refactoring should be lint-neutral. (from: provider-simplify_20260410, archived 2026-04-10)

---
Last refreshed: 2026-04-10T12:40:00+07:00
Codebase health: 370 tests across 30 files, 423KB build (chrome-mv3)
