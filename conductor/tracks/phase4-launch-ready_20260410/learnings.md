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

## Phase 4 Implementation Learnings

### Text Selection Translate
- `event.target` can be `document` (not an Element) when `mouseup` is dispatched on document directly — guard `target.closest` with `typeof target.closest !== 'function'` check.
- Async event handlers (`async function onMouseUp`) fire-and-forget — `dispatchEvent` is synchronous but the handler's promise is not awaited by the DOM.
- Module-level state (`let isEnabled = true`) persists across test cases — must reset in `beforeEach`.
- Tooltip positioning requires `window.scrollY` offset to handle scrolled pages correctly.

### Hover Translate
- `HOVER_TARGETS` set pattern (paragraph-level elements) prevents excessive translation requests on inline elements.
- Element skip logic must check both `DATA_ATTRS.TRANSLATED` and `DATA_ATTRS.ROLE` to avoid re-translating hover'd elements.
- `hoverCache` (Map<Element, string>) prevents redundant API calls when re-hovering same element.
- Hover delay clamped to 200-500ms range for UX balance.

### Keyboard Shortcuts
- Hybrid approach: global shortcuts via `chrome.commands` (4 max suggested_key entries), page-specific via `document.addEventListener('keydown')`.
- Capture phase (`true` as third arg) ensures shortcuts intercept before page handlers.
- `chrome.commands` shortcuts are customizable by users at `chrome://extensions/shortcuts`.

### Context Menus
- `chrome.contextMenus.create` must be called inside `runtime.onInstalled` (not at top level) to avoid duplicate entries.
- `documentUrlPatterns` array on menu items enables platform-specific entries (e.g., subtitle translate only on YouTube/Udemy/Coursera).
- Context menu `onClicked` handler receives `info.selectionText` for text selection context.

### Performance
- `requestIdleCallback` with `{ timeout: 2000 }` prevents starvation while deferring non-critical mutation processing.
- `requestAnimationFrame`-based DOM write batching via `scheduleDomWrite()` coalesces multiple writes into single frame.
- ViewportObserver already implements 100ms batch delay — adequate for translation triggers.

### Build & Packaging
- `pnpm zip` produces `.output/lingua-lens-{version}-chrome.zip` — 119KB compressed (368KB uncompressed).
- Manifest `commands` limited to 4 entries with `suggested_key` — additional shortcuts must use content script keydown listener.
- `contextMenus` permission required in manifest for `chrome.contextMenus` API access.

