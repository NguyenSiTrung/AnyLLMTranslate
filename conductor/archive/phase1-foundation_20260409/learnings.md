# Track Learnings: phase1-foundation_20260409

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

_No patterns yet — this is the first track. Patterns will be established here._

---

<!-- Learnings from implementation will be appended below -->

## [2026-04-09 17:45] - Phase 1 Tasks 1-3: Project Setup & Scaffolding
- **Implemented:** WXT project init, all deps, build tooling, type system, constants, languages
- **Files changed:** package.json, wxt.config.ts, tsconfig.json, vitest.config.ts, vitest.setup.ts, eslint.config.mjs, .prettierrc, types/*, lib/*
- **Commits:** 88a9b46, 6291811
- **Learnings:**
  - Patterns: WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/).
  - Patterns: pnpm not installed globally on this system — use `npx -y pnpm@latest exec` or `npx -y pnpm@latest install` for all pnpm commands.
  - Patterns: ESLint 9 uses flat config (eslint.config.mjs), no `--ext` flag needed.
  - Patterns: jsdom latest is v29, not v26.
  - Gotchas: WXT `init` refuses to run in non-empty directories — init in temp dir, then copy.
  - Gotchas: `pnpm approve-builds` is interactive — must select & confirm esbuild + spawn-sync.
  - Context: Path aliases (`@/*`) configured in tsconfig but Vite/Vitest needs explicit resolve alias too.
---

## [2026-04-09 18:04] - Phases 2-5: Service Layer, DOM Engine, Cache, Popup
- **Implemented:** Full translation pipeline from popup → background → content script → DOM
- **Files:** services/{base,openaiCompatible,batcher,background,cacheManager}.ts, content/{domWalker,translationDisplay,viewportObserver,mutationWatcher}.ts, entrypoints/{background,content,popup/}
- **Commits:** ce74a94, cc15c8b, 646f336, (pending)
- **Test count:** 94 tests, all passing
- **Learnings:**
  - Patterns: Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite).
  - Patterns: `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup.
  - Patterns: `parentElement.querySelector()` only searches children — use `document.querySelector()` for sibling lookups.
  - Patterns: CSS import in content script must use `@/styles/inject.css` (not relative), since entrypoint is in `entrypoints/` but CSS is in `styles/`.
  - Architecture: Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart). Cache is persistent via IndexedDB.
  - Build: WXT build produces 252KB total for chrome-mv3 output.
---


