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
- postMessage bridge uses channel identifier ('anyllm-translate') with origin validation and requestId correlation for MAIN ↔ ISOLATED world communication. (from: phase2-subtitles_20260409, archived 2026-04-09)
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
- Attribute scoping: `[data-anyllm-theme="name"]` on `<html>` cleanly scopes themes without class conflicts. (from: phase3-ux-polish_20260410, archived 2026-04-10)

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
- `pnpm zip` produces `.output/anyllm-translate-{version}-chrome.zip` — 119KB compressed (423KB uncompressed). (from: phase4-launch-ready_20260410, archived 2026-04-10)
- Manifest `commands` limited to 4 entries with `suggested_key` — additional shortcuts must use content script keydown listener. (from: phase4-launch-ready_20260410, archived 2026-04-10)
- `contextMenus` permission required in manifest for `chrome.contextMenus` API access. (from: phase4-launch-ready_20260410, archived 2026-04-10)

## Theme Preview
- Theme preview requires importing actual theme CSS (styles/inject.css) into options page for accurate preview. (from: theme-preview_20260410, archived 2026-04-10)
- Component uses useSettingsStore() for automatic reactivity to theme changes. (from: theme-preview_20260410, archived 2026-04-10)
- Light/dark mode toggle applies anyllm-dark class to preview container for CSS scoping. (from: theme-preview_20260410, archived 2026-04-10)
- Component must handle undefined/empty theme values - default to 'dividing-line' to prevent rendering issues. (from: theme-preview_20260410, archived 2026-04-10)
- Theme CSS uses [data-anyllm-theme] attribute on container for scoping. (from: theme-preview_20260410, archived 2026-04-10)
- Dark mode supported via html.anyllm-dark class and @media (prefers-color-scheme: dark). (from: theme-preview_20260410, archived 2026-04-10)

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
- `animation: none !important; opacity: 1 !important` on a spinner parent overrides the base `.anyllm-translate-translation` fade-in, so the spinner appears immediately without delay. (from: para-progress-indicator_20260410, archived 2026-04-10)
- Always provide CSS custom property fallbacks in inject.css: `var(--anyllm-accent, #3b82f6)` — the host page may not define the extension's custom properties. (from: para-progress-indicator_20260410, archived 2026-04-10)
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

## XHR/Fetch Interception Hardening
- XHR `addEventListener` patch must capture handlers in a Map per XHR instance, suppressing real registration and replaying manually after translation. (from: subtitle-hardening_20260410, archived 2026-04-10)
- `eslint-disable-next-line @typescript-eslint/no-this-alias` needed for `this` capture in patched prototype methods. (from: subtitle-hardening_20260410, archived 2026-04-10)
- jsdom's XMLHttpRequest fires real readystatechange events when properties change — test mocks must capture handlers via spy on `addEventListener` and NOT call the real impl. (from: subtitle-hardening_20260410, archived 2026-04-10)
- FetchInterceptor captures `window.fetch` at module load time — tests must mock `window.fetch` BEFORE dynamic import of the module. (from: subtitle-hardening_20260410, archived 2026-04-10)
- YouTube JSON3 `join('')` collapses segment boundaries — `join(' ')` with `filter` + `replace(/\s+/g, ' ')` preserves word spacing. (from: subtitle-hardening_20260410, archived 2026-04-10)

## ESLint & Code Quality
- ESLint `varsIgnorePattern` in `eslint.config.mjs` allows underscore-prefixed unused variables (e.g. `_error`) — use this convention for intentionally unused catch bindings and destructured vars. (from: eslint-fix_20260413)
- Dead code with `require()` (forbidden in ESM) must be fully removed, not patched — WXT projects are pure ESM, use dynamic `import()` instead. (from: eslint-fix_20260413)
- When rewriting tests to eliminate dynamic `import()` types, move mocks to top-level with `vi.mock()` hoisting — avoids type erasure and `any` casts. (from: eslint-fix_20260413)

## Branding & Naming Conventions
- All extension identifiers use `anyllm-` prefix: CSS classes (`anyllm-translate-*`), data attributes (`data-anyllm-*`), storage keys, postMessage channel, global window flags (`__anyllmTranslate*`). Never use the old `lingua*` prefix. (from: rename_20260413)
- CSS keyframe names, custom properties, and selectors must match the `anyllm-` prefix system — changing any one of them requires updating `styles/__tests__/themes.test.ts` which checks CSS as a raw string. (from: rename_20260413)

## Cache Integration
- `getCachedTranslation` returns `null` on miss (not `undefined` or falsy) — always guard with `!== null` to avoid treating a cached empty string as a miss. (from: cache-hardening_20260415, 2026-04-16)
- LLM translates by piece `id` (Map key), but cache reads/writes use piece `text` as the lookup key — retain `text` alongside `id` in uncachedPieces[] for write-back after LLM response. (from: cache-hardening_20260415, 2026-04-16)
- All-cached early return (`if (uncachedPieces.length === 0) return cachedResults`) avoids calling `initService()` entirely — zero LLM calls for fully-cached pages. (from: cache-hardening_20260415, 2026-04-16)
- `chrome.alarms` persist across MV3 service worker restarts — use them for periodic background tasks (vs `setInterval` which dies with the SW). (from: cache-hardening_20260415, 2026-04-16)
- Export scheduling/eviction logic from `services/background.ts`, not from WXT entrypoints — WXT's `defineBackground` is not available in the Vitest jsdom environment. (from: cache-hardening_20260415, 2026-04-16)
- Debounce LRU writes with a module-level Map + setTimeout: Map gives per-key dedup (latest wins), snapshot+clear before async flush prevents races. (from: cache-hardening_20260415, 2026-04-16)
- `vi.clearAllMocks()` resets mock implementations but NOT module-level variables — re-acquire mocks via `await import(...)` after clearAllMocks; use `vi.useFakeTimers()` / `vi.useRealTimers()` per test to manage timer state. (from: cache-hardening_20260415, 2026-04-16)

## Cache Settings UI
- Input component from shared UI library doesn't have a `label` prop - must add manual `<label>` elements with `htmlFor` attribute. (from: cache-settings-ui_20260416, archived 2026-04-16)
- Number inputs return string values from `e.target.value` - must convert to `Number()` before setting state to avoid TypeScript errors. (from: cache-settings-ui_20260416, archived 2026-04-16)
- Validation on blur (not on change) allows users to type freely without immediate error feedback. (from: cache-settings-ui_20260416, archived 2026-04-16)
- Auto-save on blur eliminates need for explicit save button - existing "Auto-saved" badge in sidebar provides feedback. (from: cache-settings-ui_20260416, archived 2026-04-16)
- Need local state for inputs to allow typing without immediately updating settings store. (from: cache-settings-ui_20260416, archived 2026-04-16)
- useEffect syncs local state with settings store to handle reset/import scenarios. (from: cache-settings-ui_20260416, archived 2026-04-16)

## Display Mode
- When `setPageState('off')` is called, it explicitly sets the `data-anyllm-state` attribute to `'off'`, it doesn't remove it. Test assertions must expect `'off'`, not `null`. (from: display-mode-fix_20260416, archived 2026-04-16)
- `DisplayMode` (`'bilingual-below'` | `'translation-only'`) ≠ `PageState` (`'dual'` | `'translation-only'` | `'off'`) — these are two separate types. The mapping is: `bilingual-below → dual`, `translation-only → translation-only`. (from: display-mode-fix_20260416, archived 2026-04-16)
- Host page CSS (e.g. Docusaurus) can overpower extension display rules. Always use `!important` on `display: none` for hiding original text and `display: X` resets for translated nodes. (from: display-mode-fix_20260416, archived 2026-04-16)

## URL Pattern Filtering
- Negative lookahead regex `(?!.*(keyword1|keyword2|keyword3))` for excluding multiple URL patterns — must be placed before the matching pattern to work correctly. (from: udemy-sprites_20260416, 2026-04-16)
- Early-exit optimization: only trigger when ALL items are filtered, not just first — allows mixed content handling. (from: udemy-sprites_20260416, 2026-04-16)
- Cue-level filtering allows mixed content (some items filtered, others retained) — useful for subtitle handlers with mixed metadata. (from: udemy-sprites_20260416, 2026-04-16)
- Test with actual platform-specific patterns (sprite-en.vtt, thumb-sprites.jpg#xywh=...) rather than generic placeholders. (from: udemy-sprites_20260416, 2026-04-16)

---

## Subtitle Translation Bridge & Testing
- PostMessage Bridge Correlation: Any 'response' message (e.g., `SUBTITLE_TRANSLATED`) MUST carry the same `requestId` as its corresponding 'request' message. Never auto-generate a new `requestId`. (from: subtitle-translation-wire_20260416, archived 2026-04-16)
- Coordinator test pattern: call `vi.resetModules()` BEFORE import in `beforeEach`, then call `startCoordinator()` explicitly after import. (from: subtitle-translation-wire_20260416, archived 2026-04-16)
- Capture listener handlers in module-level variables (`let capturedHandler = null`) assigned in the mock factory. (from: subtitle-translation-wire_20260416, archived 2026-04-16)
- ESLint: `no-non-null-assertion` forbids `handler!()`. `no-unused-expressions` forbids `&&`-chained awaits. Always use an `if`. (from: subtitle-translation-wire_20260416, archived 2026-04-16)
- Testing singleton guards: Call explicit reset methods (e.g. `resetCoordinatorState()`) before forcing modes in tests to clear guards. (from: subtitle-translation-wire_20260416, archived 2026-04-16)

---

## Subtitle Translation Refinements (2026-04-17)
- Language preference hierarchy: use `settingsStore.targetLanguage` over extracted `originalLanguage` from XHR/fetch — user intent always wins. (from: subtitle-translation-wire_20260416 follow-up, 2026-04-17)
- Subtitle interception timeout extended to 30s (`interceptTimeout: 30000`) in both `subtitleCoordinator.ts` and `xhrInterceptor.ts` — slow local LLMs (Ollama, vLLM) need more headroom than 5s. (from: incremental, 2026-04-17)
- Loading toast pattern: `content/subtitleToast.ts` encapsulates a singleton toast DOM element, shown via `showSubtitleLoadingToast()` and hidden via `hideSubtitleLoadingToast()` — call show before awaiting translation, hide in the finally branch. (from: incremental, 2026-04-17)
- Overlay `z-index` + `opacity` both need setting — `z-index: 2147483647` ensures overlay is on top, `opacity: 1` (not default `0`) ensures it is visible; missing either causes invisible-but-blocking overlay. (from: incremental, 2026-04-17)

## Language Name Formatting in Prompts
- `buildSystemPrompt` and `buildUserPrompt` now format language codes as `"Full Name (code)"` (e.g. `"Vietnamese (vi)"`) when `getLanguageName(code) !== code` — tests asserting on prompt content must use the full display format, not bare codes. (from: incremental, 2026-04-17)

## Fullscreen Overlay (2026-04-17)
- Use `Object.defineProperty(document, 'fullscreenElement', ...)` for simulating fullscreen in jsdom, but MUST clean it up in `afterEach()` to avoid polluting other tests. (from: fullscreen-overlay_20260417, archived 2026-04-17)
- jsdom does not implement `HTMLElement.prototype.popover` or `showPopover`. Must manually define them in tests to test Popover API degradation. (from: fullscreen-overlay_20260417, archived 2026-04-17)
- Context: The overlay is `position: fixed` because we want it to stay above the video. In full screen, the `position: fixed` works well because the `videoRect` coordinates correctly correspond to the viewport. (from: fullscreen-overlay_20260417, archived 2026-04-17)

## Progressive Chunking & Priorities (2026-04-17)
- Content scripts running in the ISOLATED world cannot access global registries populated by the MAIN world inject scripts. Handlers must be explicitly re-registered in the content script's entry point to be available for processing. (from: progressive-chunking_20260417, archived 2026-04-17)
- Comparing objects with `undefined === undefined` evaluates to true in `findIndex`, which can cause devastating bugs where the first element of an array is repeatedly overwritten. Always verify interface properties (`id`) exist before using them as keys. (from: progressive-chunking_20260417, archived 2026-04-17)
- When chunking LLM translation requests, deduplicating texts via a Map will alter the output array length and destroy index alignment with the source chunk. If alignment is required, process duplicates gracefully without removing them from the iteration order. (from: progressive-chunking_20260417, archived 2026-04-17)
- Use a mutable array queue (e.g., `queue: number[]`) instead of a `for` loop for async background processing loops. This allows other components to re-prioritize processing order dynamically (e.g., handling video `seeked` events to translate the current timestamp first). (from: progressive-chunking_20260417, archived 2026-04-17)

## Subtitle Drag-and-Drop (2026-04-17)
- Use `pointerdown`/`pointermove`/`pointerup` (not `mousedown`) for drag-and-drop — works uniformly across mouse and touch. `setPointerCapture(e.pointerId)` ensures events are received even if the cursor leaves the element during drag. (from: incremental, 2026-04-17)
- Persist overlay position via `chrome.storage.local` on `pointerup` — read on overlay creation to restore user's last placement. Key pattern: `{ subtitleOverlayX, subtitleOverlayY }`. (from: incremental, 2026-04-17)
- CSS `cursor: grab` (idle) / `cursor: grabbing` (active) + `user-select: none` during drag prevents text selection and provides visual affordance. (from: incremental, 2026-04-17)

## Proactive Subtitle Discovery (2026-04-17)
- HTML5 TextTrack discovery via `video.textTracks` + `addtrack` event listener provides universal fallback for sites without platform-specific handlers. Use `WeakSet<HTMLVideoElement>` to deduplicate reported videos. (from: incremental, 2026-04-17)
- MutationObserver for dynamically inserted `<video>` elements — check both direct `HTMLVideoElement` nodes and descendants of added containers via `node.querySelectorAll('video')`. (from: incremental, 2026-04-17)
- Platform handlers (YouTube, Udemy, Coursera) extended with discovery emission: parse available tracks from intercepted responses and emit `SUBTITLE_TRACKS_DISCOVERED` via the postMessage bridge before proceeding with translation. (from: incremental, 2026-04-17)
- `AvailableSubtitleTrack` type with `platform` field enables the coordinator to differentiate discovery sources and apply platform-specific logic. (from: incremental, 2026-04-17)

---
Last refreshed: 2026-04-18T12:00:00+07:00
Codebase health: 524 tests passing across 42 files, lint-clean
