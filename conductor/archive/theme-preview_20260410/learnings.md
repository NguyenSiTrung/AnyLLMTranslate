# Track Learnings: theme-preview_20260410

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

📚 **Codebase Patterns:** Found 46 patterns from previous tracks

- ESLint 9 uses flat config (eslint.config.mjs), no `--ext` flag needed.
- `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup.
- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/).
- CSS import in content script must use `@/styles/inject.css` (not relative), since entrypoint is in `entrypoints/` but CSS is in `styles/`.
- Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart). Cache is persistent via IndexedDB.
- WXT build produces ~346KB total for chrome-mv3 output.
- WXT `init` refuses to run in non-empty directories — init in temp dir, then copy.
- `pnpm approve-builds` is interactive — must select & confirm esbuild + spawn-sync.
- `parentElement.querySelector()` only searches children — use `document.querySelector()` for sibling lookups.
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite).
- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` in wxt.config.ts for XHR/fetch access.
- postMessage bridge uses channel identifier ('lingua-lens') with origin validation and requestId correlation for MAIN ↔ ISOLATED world communication.
- Fetch interceptor must call `response.clone()` before `.text()` — Response body can only be read once.
- XHR responseText override via `Object.defineProperty` needs `configurable: true` for reassignment.
- DOMParser (browser API) for XML parsing (YouTube srv3 format) — no external parser needed.
- ResizeObserver for responsive video overlay positioning — handles video resize events.
- Fullscreen transitions need setTimeout (~100ms) for repositioning after DOM settles.
- Maximum z-index (2147483647) for overlay visibility over video players.
- BOM marker (\uFEFF) handling in subtitle parsers — strip before parsing.
- Format detection heuristics: WEBVTT header, sequence number pattern, comma vs period in timing.
- CORS bypass for subtitle fetching: direct fetch first, fallback to chrome.runtime.sendMessage via background worker.
- Use string union types (not enums) for discriminated unions like `ThemeName`/`ProviderPreset` — keeps bundle small and enables exhaustive matching.
- Export `DEFAULT_SETTINGS` alongside types for single source of truth on initial values.
- `PROVIDER_PRESETS` array with `requiresApiKey`, `placeholder`, `baseUrl`, `defaultModel` enables preset selection UX without hardcoding.
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged` for cross-context updates (popup ↔ options ↔ content).
- Deep merge for nested settings objects (provider, subtitleSettings) — handle separately to avoid losing fields on partial updates.
- `isLoaded` flag in store prevents rendering before storage load completes — critical to avoid flash of defaults.
- Attribute scoping: `[data-lingua-theme="name"]` on `<html>` cleanly scopes themes without class conflicts.
- WXT auto-discovers `entrypoints/options/` as the options page — no manifest config needed.
- Vertical tabbed layout (sidebar + content area) with ARIA `role="tablist"` works well at 8+ sections.
- Variable injection (`{{targetLanguage}}`, `{{glossary}}`) via regex replace is backward compatible with existing `buildSystemPrompt(lang)` calls.
- pnpm not installed globally on this system — use `npx -y pnpm@latest exec` or `npx -y pnpm@latest install` for all pnpm commands.
- ProviderPreset type change requires immediate PROVIDER_PRESETS array update to avoid TypeScript errors (interdependent changes).
- Test files using removed type values must be updated before TypeScript compilation will pass.
- UI components using array.map() automatically reflect array changes - no UI code updates needed for data-driven components.
- Pre-existing lint errors in codebase are not introduced by this refactor - refactoring should be lint-neutral.
- `event.target` can be `document` (not an Element) when `mouseup` is dispatched on document directly — guard `target.closest` with `typeof target.closest !== 'function'` check.
- Async event handlers (`async function onMouseUp`) fire-and-forget — `dispatchEvent` is synchronous but the handler's promise is not awaited by the DOM.
- Module-level state (`let isEnabled = true`) persists across test cases — must reset in `beforeEach`.
- Tooltip positioning requires `window.scrollY` offset to handle scrolled pages correctly.
- `HOVER_TARGETS` set pattern (paragraph-level elements) prevents excessive translation requests on inline elements.
- Element skip logic must check both `DATA_ATTRS.TRANSLATED` and `DATA_ATTRS.ROLE` to avoid re-translating hover'd elements.
- `hoverCache` (Map<Element, string>) prevents redundant API calls when re-hovering same element.
- Hover delay clamped to 200-500ms range for UX balance.
- Hybrid approach: global shortcuts via `chrome.commands` (4 max suggested_key entries), page-specific via `document.addEventListener('keydown')`.
- Capture phase (`true` as third arg) ensures shortcuts intercept before page handlers.
- `chrome.commands` shortcuts are customizable by users at `chrome://extensions/shortcuts`.
- `chrome.contextMenus.create` must be called inside `runtime.onInstalled` (not at top level) to avoid duplicate entries.
- `documentUrlPatterns` array on menu items enables platform-specific entries (e.g., subtitle translate only on YouTube/Udemy/Coursera).
- Context menu `onClicked` handler receives `info.selectionText` for text selection context.
- `requestIdleCallback` with `{ timeout: 2000 }` prevents starvation while deferring non-critical mutation processing.
- `requestAnimationFrame`-based DOM write batching via `scheduleDomWrite()` coalesces multiple writes into single frame.
- ViewportObserver already implements 100ms batch delay — adequate for translation triggers.
- `pnpm zip` produces `.output/lingua-lens-{version}-chrome.zip` — 119KB compressed (423KB uncompressed).
- Manifest `commands` limited to 4 entries with `suggested_key` — additional shortcuts must use content script keydown listener.
- `contextMenus` permission required in manifest for `chrome.contextMenus` API access.

---

## [2026-04-10 13:59] - Phase 1-5: Complete Theme Preview Implementation
Thread: N/A
- **Implemented:** ThemePreview component with live theme preview in options page
- **Files changed:** entrypoints/options/ThemePreview.tsx, entrypoints/options/__tests__/ThemePreview.test.tsx, entrypoints/options/main.tsx, entrypoints/options/sections/GeneralSection.tsx
- **Commit:** bdcde1d
- **Learnings:**
  - Patterns: Theme preview requires importing actual theme CSS (styles/inject.css) into options page for accurate preview; component uses useSettingsStore() for automatic reactivity to theme changes; light/dark mode toggle applies lingua-dark class to preview container for CSS scoping
  - Gotchas: Component must handle undefined/empty theme values - default to 'dividing-line' to prevent rendering issues; unused imports (Moon, Sun) must be removed to pass lint
  - Context: Theme CSS uses [data-lingua-theme] attribute on container for scoping; dark mode supported via html.lingua-dark class and @media (prefers-color-scheme: dark)
---
