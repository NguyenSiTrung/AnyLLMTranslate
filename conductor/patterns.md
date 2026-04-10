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

## Text Selection Translate
- `event.target` can be `document` (not an Element) when `mouseup` is dispatched on document directly — guard `target.closest` with `typeof target.closest !== 'function'` check. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- Async event handlers (`async function onMouseUp`) fire-and-forget — `dispatchEvent` is synchronous but the handler's promise is not awaited by the DOM. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- Module-level state (`let isEnabled = true`) persists across test cases — must reset in `beforeEach`. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- Tooltip positioning requires `window.scrollY` offset to handle scrolled pages correctly. (from: phase4-launch-ready_20260410, archived 2026-04-10)

## Hover Translate
- `HOVER_TARGETS` set pattern (paragraph-level elements) prevents excessive translation requests on inline elements. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- Element skip logic must check both `DATA_ATTRS.TRANSLATED` and `DATA_ATTRS.ROLE` to avoid re-translating hover'd elements. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- `hoverCache` (Map<Element, string>) prevents redundant API calls when re-hovering same element. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- Hover delay clamped to 200-500ms range for UX balance. (from: phase4-launch-ready_20260410, archived 2026-04-10)

## Keyboard Shortcuts
- Hybrid approach: global shortcuts via `chrome.commands` (4 max suggested_key entries), page-specific via `document.addEventListener('keydown')`. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- Capture phase (`true` as third arg) ensures shortcuts intercept before page handlers. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- `chrome.commands` shortcuts are customizable by users at `chrome://extensions/shortcuts`. (from: phase4-launch-ready_20260410, archived 2026-04-10)

## Context Menus
- `chrome.contextMenus.create` must be called inside `runtime.onInstalled` (not at top level) to avoid duplicate entries. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- `documentUrlPatterns` array on menu items enables platform-specific entries (e.g., subtitle translate only on YouTube/Udemy/Coursera). (from: phase4-launch-ready_20260410, archived 2026-04-10)
- Context menu `onClicked` handler receives `info.selectionText` for text selection context. (from: phase4-launch-ready_20260410, archived 2026-04-10)

## Performance
- `requestIdleCallback` with `{ timeout: 2000 }` prevents starvation while deferring non-critical mutation processing. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- `requestAnimationFrame`-based DOM write batching via `scheduleDomWrite()` coalesces multiple writes into single frame. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- ViewportObserver already implements 100ms batch delay — adequate for translation triggers. (from: phase4-launch-ready_20260410, archived 2026-04-10)

## Build & Packaging
- `pnpm zip` produces `.output/lingua-lens-{version}-chrome.zip` — 119KB compressed (423KB uncompressed). (from: phase4-launch-ready_20260410, archived 2026-04-10)
- Manifest `commands` limited to 4 entries with `suggested_key` — additional shortcuts must use content script keydown listener. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- `contextMenus` permission required in manifest for `chrome.contextMenus` API access. (from: phase4-launch-ready_20260410, archived 2026-04-10)

## Theme Preview
- Theme preview requires importing actual theme CSS (styles/inject.css) into options page for accurate preview. (from: theme-preview_20260410, archived 2026-04-10)
- Component uses useSettingsStore() for automatic reactivity to theme changes. (from: theme-preview_20260410, archived 2026-04-10)
- Light/dark mode toggle applies lingua-dark class to preview container for CSS scoping. (from: theme-preview_20260410, archived 2026-04-10)
- Component must handle undefined/empty theme values - default to 'dividing-line' to prevent rendering issues. (from: theme-preview_20260410, archived 2026-04-10)
- Theme CSS uses [data-lingua-theme] attribute on container for scoping. (from: theme-preview_20260410, archived 2026-04-10)
- Dark mode supported via html.lingua-dark class and @media (prefers-color-scheme: dark). (from: theme-preview_20260410, archived 2026-04-10)

## UI Components
- Shared UI library: ui/ at project root, not inside entrypoints — reusable across popup, options, and content. (from: phase5-settings-ux_20260410, archived 2026-04-10)
- No barrel export: Import directly from @/ui/ComponentName to enable tree-shaking. (from: phase5-settings-ux_20260410, archived 2026-04-10)
- forwardRef: Only Button uses forwardRef (needed by Modal focus trap). Other components don't need it. (from: phase5-settings-ux_20260410, archived 2026-04-10)

## CSS Animations
- CSS-only: All animations in animations.css, no runtime JS libraries. (from: phase5-settings-ux_20260410, archived 2026-04-10)
- GPU-accelerated: Only transform and opacity in keyframes (never top/left/width/height). (from: phase5-settings-ux_20260410, archived 2026-04-10)
- Stagger utility: --stagger-delay CSS custom property × 30ms per item. (from: phase5-settings-ux_20260410, archived 2026-04-10)
- Reduced motion: @media (prefers-reduced-motion: reduce) disables all animations. (from: phase5-settings-ux_20260410, archived 2026-04-10)
- Keyframes referenced in inline styles: Toast uses animate-[fadeOut_200ms...] Tailwind arbitrary syntax. (from: phase5-settings-ux_20260410, archived 2026-04-10)

## Toast System
- Context-based: ToastProvider wraps app, useToast() hook for imperative API. (from: phase5-settings-ux_20260410, archived 2026-04-10)
- Auto-dismiss: Each toast has a timer (default 4s), exit animation before removal. (from: phase5-settings-ux_20260410, archived 2026-04-10)
- Position: Fixed bottom-right, stacked with gap-2. (from: phase5-settings-ux_20260410, archived 2026-04-10)
- No external state management: Self-contained useState, no Zustand integration needed. (from: phase5-settings-ux_20260410, archived 2026-04-10)

## Popup UI
- Dropdown redesign: permanently exposed quick settings panel eliminates collapsible disclosure pattern. (from: popup-redesign, 2026-04-10)

## Content Script
- cssInjectionMode must be 'manifest' (not 'ui') for inject.css themes to apply on host pages. (from: display-theme-fix_20260410, archived 2026-04-10)
- Inline layout elements (e.g. `<a>`, `<span>` with display:inline) need special translation placement — inject after the element, not as a sibling block. (from: display-theme-fix_20260410, archived 2026-04-10)
- `contenteditable` check needs both attribute (`getAttribute('contenteditable') === 'true'`) and property (`isContentEditable`) — jsdom doesn't reflect the property from the attribute. (from: test-fix, 2026-04-10)
- Test files moved to `__tests__/` subdirectories must update relative imports (e.g. `./content` → `../content`). (from: test-fix, 2026-04-10)
- `chrome.runtime.sendMessage` mock must return a Promise (`.mockResolvedValue(undefined)`) — source code calls `.catch()` on the result. (from: test-fix, 2026-04-10)

## Progress Indicators & Loading States
- CSS spinner: Use `::before` pseudo-element with border-trick — keeps the DOM clean, no extra child elements needed. (from: para-progress-indicator_20260410, archived 2026-04-10)
- `animation: none !important; opacity: 1 !important` on a spinner parent overrides the base `.lingua-lens-translation` fade-in, so the spinner appears immediately without delay. (from: para-progress-indicator_20260410, archived 2026-04-10)
- Always provide CSS custom property fallbacks in inject.css: `var(--lingua-accent, #3b82f6)` — the host page may not define the extension's custom properties. (from: para-progress-indicator_20260410, archived 2026-04-10)
- In-place DOM update pattern: find by pieceId → swap class + set textContent → force reflow via `el.style.animation = 'none'; el.offsetHeight; el.style.animation = ''` to re-trigger the CSS fade-in animation. (from: para-progress-indicator_20260410, archived 2026-04-10)
- For batch translation, show spinners for ALL pieces **before** the single `await` — gives immediate visual feedback for all pending paragraphs simultaneously. (from: para-progress-indicator_20260410, archived 2026-04-10)
- Wrap `chrome.runtime.sendMessage` in try/catch in content scripts — sendMessage can throw synchronously if the service worker is asleep on first call. (from: para-progress-indicator_20260410, archived 2026-04-10)
- `styles/__tests__/themes.test.ts` checks inject.css as a raw string — when replacing CSS keyframe names or selectors, always update `themes.test.ts` alongside the CSS file. (from: para-progress-indicator_20260410, archived 2026-04-10)

## Glossary & Prompt Wiring
- `buildSystemPrompt()` already accepted optional params — always check existing function signatures before extending. (from: glossary-wire_20260410, archived 2026-04-10)
- Pass `glossaryBlock || undefined` (not empty string) to preserve "no glossary" semantics; `formatGlossary()` returns `''` for empty arrays. (from: glossary-wire_20260410, archived 2026-04-10)
- Inspect LLM request body in tests: `JSON.parse(fetchMock.mock.calls[0][1]?.body).messages[0].content`. (from: glossary-wire_20260410, archived 2026-04-10)
- Module-level `mockStorage` in background.test.ts is shared — add cleanup in `beforeEach` to prevent pollution. (from: glossary-wire_20260410, archived 2026-04-10)
- Lift mismatch state to parent and pass callback — keeps table and preview in sync without a shared store. (from: glossary-wire_20260410, archived 2026-04-10)
- Clear badges on ANY mutation (add/delete/edit) by calling `clearMismatches()` in each handler's useCallback. (from: glossary-wire_20260410, archived 2026-04-10)

---
Last refreshed: 2026-04-10T16:54:00+07:00
Codebase health: 403 tests across 32 files, 504KB build (chrome-mv3)
