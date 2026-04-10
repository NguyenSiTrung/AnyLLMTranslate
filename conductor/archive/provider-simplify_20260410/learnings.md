# Track Learnings: provider-simplify_20260410

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

📚 **Codebase Patterns:** Found 25 patterns from previous tracks

### Code Conventions
- ESLint 9 uses flat config (eslint.config.mjs), no `--ext` flag needed. (from: phase1-foundation_20260409)
- `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup. (from: phase1-foundation_20260409)

### Architecture
- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/). (from: phase1-foundation_20260409)
- CSS import in content script must use `@/styles/inject.css` (not relative), since entrypoint is in `entrypoints/` but CSS is in `styles/`. (from: phase1-foundation_20260409)
- Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart). Cache is persistent via IndexedDB. (from: phase1-foundation_20260409)

### Type System
- Use string union types (not enums) for discriminated unions like `ThemeName`/`ProviderPreset` — keeps bundle small and enables exhaustive matching. (from: phase3-ux-polish_20260410)
- Export `DEFAULT_SETTINGS` alongside types for single source of truth on initial values. (from: phase3-ux-polish_20260410)
- `PROVIDER_PRESETS` array with `requiresApiKey`, `placeholder`, `baseUrl`, `defaultModel` enables preset selection UX without hardcoding. (from: phase3-ux-polish_20260410)

### State Management
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged` for cross-context updates (popup ↔ options ↔ content). (from: phase3-ux-polish_20260410)
- Deep merge for nested settings objects (provider, subtitleSettings) — handle separately to avoid losing fields on partial updates. (from: phase3-ux-polish_20260410)

### Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite). (from: phase1-foundation_20260409)

### Build
- pnpm not installed globally on this system — use `npx -y pnpm@latest exec` or `npx -y pnpm@latest install` for all pnpm commands. (from: phase1-foundation_20260409)

---

## Phase 1-5 Implementation Learnings

### Type System & Configuration
- ProviderPreset type change requires immediate PROVIDER_PRESETS array update to avoid TypeScript errors (interdependent changes).
- Test files using removed provider presets must be updated before TypeScript compilation will pass.
- UI components using PROVIDER_PRESETS.map() automatically reflect array changes - no UI code updates needed.

### Testing
- All provider-related test assertions needed updating: types/__tests__/config.test.ts, services/__tests__/base.test.ts, services/__tests__/openaiCompatible.test.ts.
- Test count changed from 9 to 2 presets across multiple test files.
- 370 tests passing after refactor - no regressions introduced.

### Linting
- Pre-existing lint errors in codebase (21 errors) are not introduced by this refactor - provider simplification is lint-neutral.
