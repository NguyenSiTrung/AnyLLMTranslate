# Codebase Patterns

Reusable patterns discovered during development. Read this before starting new work.

## Code Conventions
- ESLint 9+ uses flat config (eslint.config.mjs), no `--ext` flag needed. (from: phase1-foundation_20260409, archived 2026-04-09)
- `promise.finally().catch()` needed to suppress unhandled rejections when storing promises in Maps for dedup. (from: phase1-foundation_20260409, archived 2026-04-09)
- `@typescript-eslint/no-dynamic-delete` prohibits `delete obj[key]` — use `Object.fromEntries(Object.entries(obj).filter(...))` instead. (from: ux-power-features_20260422, archived 2026-04-22)
- Comparing objects with `undefined === undefined` evaluates to true in `findIndex`, which can cause bugs where the first element is repeatedly overwritten. Always verify interface properties (`id`) exist before using them as keys. (from: progressive-chunking_20260417, archived 2026-04-17)

## Architecture
- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/). (from: phase1-foundation_20260409, archived 2026-04-09)
- CSS import in content script must use `@/styles/inject.css` (not relative), since entrypoint is in `entrypoints/` but CSS is in `styles/`. (from: phase1-foundation_20260409, archived 2026-04-09)
- Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart). Cache is persistent via IndexedDB. (from: phase1-foundation_20260409, archived 2026-04-09)
- Use a mutable array queue (e.g., `queue: number[]`) instead of a `for` loop for async background processing loops. This allows other components to re-prioritize processing order dynamically (e.g., handling video `seeked` events). (from: progressive-chunking_20260417, archived 2026-04-17)
- Per-tab session tracking via `Set<number>` for counters like `totalPagesTranslated` — cleared on `restore` action to avoid double-counting. (from: ux-power-features_20260422, archived 2026-04-22)
- WXT build produces ~744KB total for chrome-mv3 output (grew from ~346KB after settings overhaul, subtitles, UI library, and Langflow support). (from: phase1-foundation_20260409, updated 2026-05-23)

## Gotchas
- WXT `init` refuses to run in non-empty directories — init in temp dir, then copy. (from: phase1-foundation_20260409, archived 2026-04-09)
- `pnpm approve-builds` is interactive — must select & confirm esbuild + spawn-sync. (from: phase1-foundation_20260409, archived 2026-04-09)
- `parentElement.querySelector()` only searches children — use `document.querySelector()` for sibling lookups. (from: phase1-foundation_20260409, archived 2026-04-09)

## Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite). (from: phase1-foundation_20260409, archived 2026-04-09)
- Always ensure `loadSettings` mocks in unit tests include all properties used by the implementation (including nested objects like `inlineTranslate`), otherwise tests may fail in try/catch blocks or during property access. (from: inline-translate_20260418, archived 2026-04-18)
- DOM-dependent tests using MutationObserver or event listeners in Vitest/jsdom require an async event loop tick (e.g., `await Promise.resolve()`) to allow handlers to register before asserting results. (from: linkedin-subtitles_20260523, archived 2026-05-25)
- Storage mocks in tests need settings nested under the correct key (`anyllm-translate-settings` rather than direct keys) to avoid fallback default values. (from: linkedin-subtitles_20260523, archived 2026-05-25)
- Prefer explicit top-level type imports over inline `import(...)` type annotations to avoid TypeScript/ESLint warnings about forbidden inline imports. (from: linkedin-subtitles_20260523, archived 2026-05-25)

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
- Subtitle handlers must be registered in both the isolated world script (coordination/UI) and the MAIN world script (XHR/fetch interception) — missing either registration breaks the pipeline. (from: linkedin-subtitles_20260523, archived 2026-05-25)
- Background service worker's `SUBTITLE_ALLOWLIST` must include CDN domains (e.g. `licdn.com` for LinkedIn) to permit CORS-bypass subtitle downloads via the MAIN world scripts. (from: linkedin-subtitles_20260523, archived 2026-05-25)

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
- Destructive list actions use `pendingDeleteId` state + Modal confirmation pattern — never delete directly on click. (from: settings-ux-audit_20260506, archived 2026-05-06)
- Danger variant Modals focus Cancel button (safer default); info variant focuses Confirm — use separate `cancelRef`. (from: settings-ux-audit_20260506, archived 2026-05-06)
- Inline edit rows need explicit Save/Cancel buttons — `onBlur` auto-save conflicts with button clicks and loses edits. (from: settings-ux-audit_20260506, archived 2026-05-06)
- Card variant semantics: `default` for pure display/stats, `bordered` for interactive/configurable containers. (from: settings-ux-audit_20260506, archived 2026-05-06)

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

## PDF Content Classification & Layout
- **Rule-based vs LLM classification split:** Pure-math detection (LaTeX delimiters, Unicode-symbol ratio ≥ 0.4) is deterministic and client-side — never needs a network call. Figure/table detection needs an LLM and must fail-open (treat everything as prose on error) so a classification failure can never make the page worse than translate-all. (from: pdf-skip-math-figures, merged 2026-06-17)
- **Classification belongs inside the orchestration seam (`translateParagraphs`), not the extraction or hook layer.** Running classification where translation is already coordinated gives atomic failure handling (one try/catch), atomic retry (`retryPage` re-runs one function), unified `source→translated` cache (skipped paragraphs cache `source→source`), and leaves `extractPageText` pure. (from: pdf-skip-math-figures, merged 2026-06-17)
- **Propagate paragraph `kind` end-to-end, don't rediscover it by text equality.** Stuffing all results into `Map<string,string>` discards kind and forces the renderer to guess via `translatedText === para.text` — which then drops verbatim paragraphs and lets translated boxes collapse onto canvas-painted math. Carry `kind: prose|math|figure` on `TranslationResultItem` → `paragraphKinds` on `PageTranslations` → renderer, where math/figure become transparent origHeight-reserving spacers in the reflow. (from: bug 8vg / kind-propagation, merged 2026-06-17)
- **Orthogonal view modes need orthogonal types + storage keys.** The PDF viewer has two independent toggles: View (`split` | `translation-only`) and Layout sub-mode (`original` | `text`). `PdfViewMode` is a distinct type from the web-page translator's `PageState` (different UI surface) and lives in its own `chrome.storage.local` key (`anyllm-pdf-view-mode`), not in `ExtensionSettings` — mirroring how the viewer keeps `layoutMode` out of the encrypted-settings path. (from: pdf-translation-only-view, merged 2026-06-18)
- **`useVisiblePages` container-ref switch invariant:** when the left pane unmounts (translation-only mode), the `[data-page-number]` observer must re-target to the right pane or Layout-overlay canvases won't virtualize. The selector already matches overlay canvases (they carry `data-page-number`), so only the `containerRef` arg changes — `viewMode === 'translation-only' ? rightContainerRef : leftContainerRef`. (from: pdf-translation-only-view, merged 2026-06-18)
- **Null-ref guards make conditional pane mounting safe for scroll sync.** `useSynchronizedScroll`'s effect must early-return when `leftRef.current` or `rightRef.current` is null. Then unmounting the left pane in translation-only mode makes the hook a no-op with no errors or feedback loops, and re-mounting re-aligns via page-block interpolation on the next scroll event. (from: pdf-translation-only-view, merged 2026-06-18)

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

## Settings UI/UX Polish (2026-04-18)
- Merging cards uses `border-t border-zinc-800 pt-4` as visual divider within a single Card — keeps related controls grouped without separate Card overhead. (from: settings-ux-polish_20260418, archived 2026-04-18)
- Sub-group labels use `text-[10px] uppercase tracking-widest text-zinc-600` for category headers within controls — provides visual hierarchy without adding Card nesting. (from: settings-ux-polish_20260418, archived 2026-04-18)
- `motion-reduce:hover:translate-y-0` Tailwind class respects `prefers-reduced-motion` without needing extra CSS — use alongside `hover:-translate-y-[1px]` for accessible hover lift. (from: settings-ux-polish_20260418, archived 2026-04-18)
- Cap stagger delays with `Math.min(idx, 5)` to prevent 1.5s+ entrance delays on large lists (Dictionary entries, SiteRules items). (from: settings-ux-polish_20260418, archived 2026-04-18)
- Changing ThemePreview sample text requires updating ThemePreview.test.tsx assertions for both `getByText` and `toHaveTextContent`. (from: settings-ux-polish_20260418, archived 2026-04-18)
- Merging card titles (e.g. "Cache Configuration" → "Cache Management") requires updating test assertions (`screen.getByText(...)`) to match new names. (from: settings-ux-polish_20260418, archived 2026-04-18)

## Security & Encryption (2026-04-21)
- AES-GCM encryption for extension storage: Use PBKDF2 (SHA-256, 100k iterations) with `chrome.runtime.id` + static salt to derive a stable per-install key. Prepend random 12-byte IV to ciphertext, base64-encode, and prefix with `enc:` for backward-compatible encrypted/plaintext detection. (from: hardening-fixes_20260421, archived 2026-04-22)
- Refactor all direct `chrome.storage.local` accesses to go through `lib/config.ts` so encryption is always applied at load/save boundaries. (from: hardening-fixes_20260421, archived 2026-04-22)
- Safe DOM construction: Never use `innerHTML` with dynamic text; use `document.createElement` + `textContent`. Static SVG templates in innerHTML are acceptable if they contain no user data. (from: hardening-fixes_20260421, archived 2026-04-22)
- Subtitle fetch allow-list: Background CORS bypass must validate URL against a regex allow-list before calling `fetch()` — include common subtitle/CDN domains. (from: hardening-fixes_20260421, archived 2026-04-22)
- Clipboard API: `navigator.clipboard.writeText()` is async and can throw (permissions, non-secure context) — always `await` + try/catch with visual feedback on failure. (from: hardening-fixes_20260421, archived 2026-04-22)
- `document.execCommand('insertText')` is the most reliable way to replace text in standard inputs while preserving the browser's native undo stack. (from: inline-translate_20260418, archived 2026-04-18)
- Multi-framework compatibility (React, Vue, Angular) requires dispatching both `input` and `change` synthetic events manually after programmatically updating input values. (from: inline-translate_20260418, archived 2026-04-18)

## Runtime Reliability (2026-04-21)
- deepMerge for nested settings: Chrome storage partial updates require deep merging of nested objects (provider, subtitleSettings, inlineTranslate). Apply at `loadSettings()`, `updateSettings()`, AND `chrome.storage.onChanged` listeners. (from: hardening-fixes_20260421, archived 2026-04-22)
- Rate limiting via in-process semaphore: In MV3, an in-memory semaphore in the background script suffices (one SW instance). Pattern: `maxConcurrent` slots + `maxQueue` waiting promises; always release in `finally`; add queue timeout for SW restart resilience. (from: hardening-fixes_20260421, archived 2026-04-22)
- Strict platform detection for subtitle auto-activate: Generic `querySelectorAll('video')` is unreliable on listing/search pages with autoplay thumbnails — only known platforms should auto-activate. (from: hardening-fixes_20260421, archived 2026-04-22)
- `chrome.storage.onChanged` listener cleanup: Store the listener in a module-level variable; remove it in `stopTranslation()` to prevent duplicate listeners on SPA re-routes. (from: hardening-fixes_20260421, archived 2026-04-22)
- Content-script re-injection guard: WXT content scripts can be re-injected on SPA navigations; set `window.__anyllmTranslateInitialized` flag and return early if already set. (from: hardening-fixes_20260421, archived 2026-04-22)
- React error boundaries: Wrap popup and options entrypoints with a minimal class component error boundary; provide reload button and log to console. (from: hardening-fixes_20260421, archived 2026-04-22)

## Statistics & Fire-and-Forget Patterns (2026-04-22)
- Fire-and-forget stats with `.catch(() => {})` — non-blocking, never interfere with translation pipeline. (from: ux-power-features_20260422, archived 2026-04-22)
- Per-tab session tracking via `Set<number>` for `totalPagesTranslated` — cleared on `restore` action. (from: ux-power-features_20260422, archived 2026-04-22)
- `@typescript-eslint/no-dynamic-delete` prohibits `delete obj[key]` — use `Object.fromEntries(filter)` instead. (from: ux-power-features_20260422, archived 2026-04-22)
- CSS-only bar chart with hover tooltips — no charting library needed for simple data visualization. (from: ux-power-features_20260422, archived 2026-04-22)
- Section picker uses capture phase listeners to intercept before page handlers. (from: ux-power-features_20260422, archived 2026-04-22)

## Custom Theme & Context-Aware (2026-04-22)
- CSS custom properties (`--anyllm-custom-*`) on `<html>` for dynamic theme injection without shadow DOM complexity. (from: theme-context_20260422, archived 2026-04-22)
- `useMemo` with `as React.CSSProperties` cast safely injects CSS custom properties into live preview containers. (from: theme-context_20260422, archived 2026-04-22)
- `PageContext` extraction should be <10ms: only DOM queries (title, meta, hostname), zero network calls. (from: theme-context_20260422, archived 2026-04-22)
- Domain-to-category heuristic map for ~30 top domains — no LLM call needed for category detection. (from: theme-context_20260422, archived 2026-04-22)
- Parent toggle gates child sub-toggles with `opacity-40 pointer-events-none` for visual hierarchy. (from: theme-context_20260422, archived 2026-04-22)
- Adding fields to `ExtensionSettings` requires updating `extractSettings()` in Zustand store — otherwise persistence/export silently drops new fields. (from: theme-context_20260422, archived 2026-04-22)

## Category Override & Two-Layer Resolution (2026-04-23)
- Tab-scoped in-memory store: `Map<tabId, string>` with `chrome.tabs.onRemoved` cleanup for per-tab override state that doesn't persist across service worker restarts. (from: category-override_20260423, archived 2026-04-23)
- Nullish coalescing for priority chains: `tabOverride ?? siteRuleCategory ?? autoDetected` is O(1) and readable for N-level fallback hierarchies. (from: category-override_20260423, archived 2026-04-23)
- Popup → Background → Content forwarding: popup sends `setCategoryOverride` to background, background stores + forwards `categoryChanged` to content tab for immediate effect. (from: category-override_20260423, archived 2026-04-23)
- "Save as Rule" promotion pattern: temporary popup override promoted to persistent `SiteRule.category` field, then temp override cleared — single-click persistent save UX. (from: category-override_20260423, archived 2026-04-23)
- Export shared data maps for cross-component reuse: `DOMAIN_CATEGORY_MAP` exported from `pageContext.ts` for auto-suggest in SiteRule editor — avoid duplicating domain knowledge. (from: category-override_20260423, archived 2026-04-23)

## LLM Category Detection (2026-05-04)
- Dual-mode detection: `async` mode translates immediately with heuristic category and upgrades context via LLM later; `blocking` mode waits for LLM result before first translation. Feature gated behind `enableLLMPageCategoryDetection` toggle (child of `enableContextAwareTranslation`). (from: llm-category-detection_20260504, archived 2026-05-04)
- Feature toggles must be placed inside their parent toggle and conditionally rendered/disabled if parent is off — e.g., LLM detection nested under context-aware translation. (from: llm-category-detection_20260504, archived 2026-05-04)
- Settings are defined in `types/config.ts` and managed globally via `settingsStore.ts` — always update `extractSettings()` and `DEFAULT_SETTINGS` together. (from: llm-category-detection_20260504, archived 2026-05-04)

## Built-in Site Rules & Global Excludes (2026-05-04)
- Built-in rules use `builtIn: true` flag on `SiteRule` — displayed read-only in UI, user rules always take precedence via `findEffectiveRule()`. (from: incremental, 2026-05-04)
- `mergeExcludeSelectors()` deduplicates global + per-site exclude selectors with `Set`-based union; global selectors come first. (from: incremental, 2026-05-04)
- `globalExcludeSelectors` defaults to `['pre', 'code', '.code-block']` — code blocks are excluded from translation universally. (from: incremental, 2026-05-04)
- Inline edit form pattern for array settings: each entry is an editable row with delete button, plus an "Add" row at the bottom. Validate non-empty before insert. (from: incremental, 2026-05-04)

## Bilingual Display & Session Guards (2026-05-05)
- Monotonically-bumped session id (captured at request issue, re-checked at response) is the simplest way to drop stale async writes after a state reset — prevents translations from a previous session leaking into a restored page. (from: bilingual-display-ux_20260505, archived 2026-05-05)
- When translation-only mode hides the original parent, any inline child (loading, error, translated text) is also hidden. Fix with a sibling-after-parent clone — not a CSS override on the hidden parent. (from: bilingual-display-ux_20260505, archived 2026-05-05)
- A theme-aware DOM helper that runs on both element creation and theme-switch keeps a11y attributes (e.g. tabindex for mask theme) consistent without full re-render. (from: bilingual-display-ux_20260505, archived 2026-05-05)
- Validator execution order: `tsc` → `eslint` → `vitest` → `wxt build` — cheapest checks fail fast first, catching type/lint/runtime/build issues independently. (from: bilingual-display-ux_20260505, archived 2026-05-05)

## Safety Excludes & Force-Merge (2026-05-04)
- `CRITICAL_GLOBAL_EXCLUDES` array (pre, .code-block, contenteditable, textarea, input, translate="no", .notranslate, script, style) is force-merged into `globalExcludeSelectors` at load time via `Set`-based union in `loadSettings()` — users cannot accidentally remove safety selectors. (from: incremental, 2026-05-04)
- Inline tags (`code`, `kbd`, `var`, `samp`) were initially in CRITICAL_GLOBAL_EXCLUDES but removed — excluding them breaks sentence structure since they appear inline within paragraphs. (from: incremental, 2026-05-04)
- UI provides a "Reset to defaults" button gated behind `isDefault` check — only appears when user has customized the exclude list. (from: incremental, 2026-05-04)

## Smart Excludes (2026-05-05)
- `SMART_EXCLUDE_SELECTORS` array (nav, TOC, footer, breadcrumb, sidebar, pagination, infobox) filters structural/navigation elements that aren't prose content — gated behind `enableSmartExcludes` toggle (default: on). (from: incremental, 2026-05-05)
- Smart excludes are applied at DOM walk time, not in CSS — elements matching these selectors are simply skipped by the paragraph detector. (from: incremental, 2026-05-05)

## LLM Response Sanitization (2026-05-04)
- `parseTranslationResponse()` strips `<think>...</think>` blocks (DeepSeek R1 reasoning traces) before JSON parsing — uses regex `/<think>[\s\S]*?<\/think>/g`. (from: incremental, 2026-05-04)
- Three-strategy JSON extraction: direct parse → markdown code fence extraction → outermost brace extraction. Each strategy catches failures silently and falls through. (from: incremental, 2026-05-04)

## Onboarding & Provider Readiness (2026-05-05)
- `OnboardingState` tracks wizard progress with `lastStep` field for resume support — persisted via `chrome.storage` alongside `ExtensionSettings`. (from: incremental, 2026-05-05)
- Provider readiness is a pure function (`getProviderReadiness()`) returning a discriminated union with `status`, `reason`, `canTest`, `canTranslate` — no side effects, easy to test. (from: incremental, 2026-05-05)
- `getConnectionErrorMessage()` classifies error strings by keyword matching (timeout, 401/403, 404/model, network) into actionable recovery messages — avoids exposing raw error strings to users. (from: incremental, 2026-05-05)
- Provider `connectionStatus` must reset to `'unknown'` on any field edit (baseUrl, apiKey, model) — prevents stale "connected" badge after user changes credentials. (from: incremental, 2026-05-05)
- Setup wizard uses a controlled dialog pattern with `ref` + `tabIndex={-1}` for focus management — dialog auto-focuses on step change via `useEffect`. (from: incremental, 2026-05-05)

## Custom Endpoints & Langflow Support (2026-05-13)
- **Provider-agnostic interface:** Consolidate custom endpoint types by defining a standard `TranslationService` interface (`translate()`, `testConnection()`, `detectPageCategory?()`). The factory function `initService()` in `background.ts` instantiates the correct service implementation based on the `preset` value, allowing seamless addition of new providers without affecting core translation pipeline logic. (from: langflow-provider_20260513, archived 2026-05-13)
- **JSONPath dynamic extraction:** Dynamic or flow-based APIs (like Langflow) return highly nested, non-standard JSON responses. Implement a dot-bracket notation JSONPath resolver (`resolveJsonPath`) to extract translation text dynamically from user-customizable paths (e.g. `outputs[0].outputs[0].results.text.text`) rather than hardcoding the response structure. (from: langflow-provider_20260513, archived 2026-05-13)
- **Plain-text fallbacks for translation:** If JSON parsing fails (common when flows or reasoning models return plain text instead of JSON), implement a fallback that maps the entire response text directly to a single expected piece ID, or splits by newline to map line-by-line to multiple expected piece IDs. (from: langflow-provider_20260513, archived 2026-05-13)
- **Conditional UI Rendering for presets:** Redesign settings forms to conditionally render inputs based on the selected preset (e.g., Endpoint URL, Component ID, and Response Text Path for Langflow vs. Base URL and Model for OpenAI-compatible) to keep the configuration UI clean and relevant. (from: langflow-provider_20260513, archived 2026-05-13)

## Deep-Analysis Hardening (2026-06-11)
- **Debug-log TTL cache with warmup + invalidation:** Gate sensitive logs (prompts, page text) behind a short-TTL cached `settings.debugMode` read (5s) to avoid a `chrome.storage` read on every LLM call. Default the cache to `false` so first-call logs (which may fire before async warmup completes) are silently dropped. Call `warmDebugCache()` at SW startup, and wire cache invalidation into the same `onSettingsChange()` listener that re-inits the service so toggling takes effect on the next LLM call without waiting for TTL expiry. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **Origin validation as FIRST guard in MAIN-world postMessage handlers:** Inline `addEventListener('message', ...)` closures in MAIN-world inject scripts (e.g. `FetchInterceptor`, `XhrInterceptor`) must check `event.origin !== window.location.origin` as the first guard. The shared `messageBridge.onMessage` already validates origin; the inline listeners were the gap and could let forged cross-origin messages resolve subtitle `Promise`s with attacker-controlled VTT. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **AES-GCM per-install salt with try-both-fallback migration:** Derive the storage-encryption key from `chrome.runtime.id` + a per-install random 16-byte salt persisted under `STORAGE_KEYS.ENC_SALT`. Cache the salt in a module variable; fall back to the legacy `STATIC_SALT` when `chrome.storage` is unavailable (tests). On decrypt, attempt per-install salt first, then static — AES-GCM's auth tag makes a wrong-salt attempt throw, so try-both is safe. Legacy `enc:` values migrate to the per-install salt on next `saveSettings()`, avoiding a prefix change. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **Recoverable decrypt result via discriminator:** Return `{ value, ok, encrypted }` from `decryptApiKeyResult()` so `loadSettings()` can blank the key (recoverable not-configured state) when an encrypted value cannot be decrypted, instead of using ciphertext as the key. Keep `decryptApiKey()` as a thin wrapper for backward compat with existing tests. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **Interceptor enable/disable: capture originals into instance fields:** `XhrInterceptor.disable()` must capture/restore the actual `prototype.open/addEventListener/send` methods (not just reset `window.XMLHttpRequest`), otherwise a disable→enable cycle double-wraps the already-patched method and fires `bridge.send` twice. `FetchInterceptor.disable()` should only restore `window.fetch` when it still identity-equals its own `patchedFetch` — never clobber a foreign patch. `originalFetch` is captured as `window.fetch.bind(window)` at module load, so after disable, `window.fetch` is the bound original (NOT identity-equal to a test mock) — assert behavior (delegates to mock) rather than identity. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **Semaphore queue holds SemaphoreWaiter objects, not bare resolve closures:** Queue `{ grant, settled }` records. The timeout must set `settled = true` AND remove the exact waiter. `releaseSemaphore()` skips settled waiters and transfers the slot to the next live waiter (active count unchanged) or decrements when none remain. A bare-resolve queue is unsafe: `queue.indexOf(resolve)` never matches a wrapper, so a timed-out wrapper stayed queued and a later release called it without decrementing `active`, leaking a slot until concurrency wedged at the cap. Export `__resetSemaphoreForTest` / `__getSemaphoreStateForTest` for deterministic tests. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **Subtitle session teardown on restore/navigation/tab-close:** `activeSessions: Map<tabId, session>` + keep-alive alarms outlive `restore` and SPA navigation. Add `stopSubtitleSession(tabId)` that drains `session.queue` (the running async loop exits on its next `while` check), deletes the session, and clears the alarm. Wire into the `restore` handler, a new `CANCEL_SUBTITLE_SESSION` message, and a `chrome.tabs.onRemoved` listener (`initSubtitleSessionCleanup`) registered in the background entrypoint. The coordinator sends `CANCEL_SUBTITLE_SESSION` from the SPA navigation handler (best-effort `chrome.tabs.sendMessage` with `chrome.runtime.lastError` swallow). Do NOT call from `resetCoordinatorState()` — it runs in many tests' `beforeEach`. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **Test helpers for origin-checking must set `MessageEvent.origin`:** `window.postMessage` in jsdom fires `MessageEvent` with `origin === ''` if not set explicitly. Any test that exercises origin validation must pass `origin: window.location.origin` (or the scenario origin) into the test helper, or the assertion will silently fail and obscure the real bug. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **Audit-then-remove dead captured fields:** When `TranslationPiece.originalHTML` is captured by the producer but read by nothing in the codebase, the audit must cover type, producer, and all test fixtures (5 in this case). Restore flows that look like they need the capture often use DOM markers (`data-anyllm-translated` / `data-anyllm-role="original"`) + a `removeAllTranslations()` walker instead. `textNodes` is also captured-but-unread but the cost-benefit of removing is low and callers may want it for future restore strategies — keep with a comment. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **Glossary CSV header detection: accept either column order:** User-exported CSVs (Google Sheets, etc.) sometimes put `target,source` instead of `source,target`. Loosen `isHeaderLine` to match either order and accept the column-swap data loss on the rare bad-header row rather than treating it as data and producing a confusing entry. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
- **Mock factories must export the new symbol name:** When `config.ts` switches from `decryptApiKey` to `decryptApiKeyResult`, any test that mocks `../crypto` must update its mock to export the new name or `loadSettings` crashes on `undefined`. (from: deep-analysis-hardening_20260611, archived 2026-06-11)
## Subtitle Reliability Hardening (2026-06-12)
- **Session identity for stale chunk rejection:** Use a monotonic `subtitleSessionCounter` in background + `activeSubtitleSessionId` in coordinator to reject chunks from superseded sessions — prevents race conditions when users navigate between videos. (from: subtitle-reliability-hardening_20260612, archived 2026-06-12)
- **Interceptor always-respond rule:** Every early-return path in `handleIntercepted()` must call `sendTranslatedSubtitle()` with original content — otherwise MAIN-world interceptors hang indefinitely waiting for a response. (from: subtitle-reliability-hardening_20260612, archived 2026-06-12)
- **URL allow-list hostname validation:** Parse URL → validate protocol (HTTP/S only) → block private IPs/localhost → match hostname-only with end-anchored regex — prevents SSRF via domain-in-path/query attacks. (from: subtitle-reliability-hardening_20260612, archived 2026-06-12)
- **BFCache interceptor lifecycle:** Use `pagehide` (always) to disable interceptors and `pageshow` (with `event.persisted`) to re-enable — prevents stale monkey-patches after BFCache restore. (from: subtitle-reliability-hardening_20260612, archived 2026-06-12)
- **Listener cleanup via Map references:** Store `addEventListener` handler references in a `Map<Element, {event: handler}>` alongside `WeakSet` deduplication — enables proper `removeEventListener` on coordinator teardown. (from: subtitle-reliability-hardening_20260612, archived 2026-06-12)
- **loadedmetadata re-scan for TextTrack discovery:** Attach `loadedmetadata` listeners to candidate videos so textTracks are re-scanned when metadata becomes available — handles cases where tracks aren't populated at initial scan time. (from: subtitle-reliability-hardening_20260612, archived 2026-06-12)

## PDF Viewer
- **WXT unlisted page directory naming:** `entrypoints/foo.html` + `entrypoints/foo/` triggers "Multiple entrypoints with the same name". Use the directory-only form `entrypoints/foo/index.html` + `entrypoints/foo/index.tsx`. (from: pdf-translation_20260612, archived 2026-06-12)
- **pdfjs-dist v4 worker bundle via Vite `?url`:** `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` — Vite emits the file under `assets/` and returns a runtime URL for `pdfjs.GlobalWorkerOptions.workerSrc`. (from: pdf-translation_20260612, archived 2026-06-12)
- **PDF.js DPI-aware canvas rendering:** `page.getViewport({ scale: cssScale * devicePixelRatio })`, then set `canvas.width/height` to viewport (physical pixels) and `canvas.style.width/height` to CSS-pixel dimensions. (from: pdf-translation_20260612, archived 2026-06-12)
- **IntersectionObserver root must be the scroll pane:** When observing inside a scroll container, using the inner content wrapper as `root` makes every child appear visible because the wrapper is as tall as the full document. Always use the actual scroll container as the observer `root`. (from: pdf-translation_20260612, archived 2026-06-12)
- **Progressive translation via IntersectionObserver:** Observe page slots inside the scroll pane; translate only when they enter the viewport. Prevents LLM-token storms for long documents. (from: pdf-translation_20260612, archived 2026-06-12)
- **PDF paragraph grouping heuristic:** `page.getTextContent()` returns flat `TextItem`s. Group into lines by `transform[5]` (y) within `Y_TOLERANCE=1.5` PDF units, then into paragraphs by checking the vertical gap between consecutive lines is < `LINE_GAP_FACTOR * lineHeight` (use ~1.6). Rejoin hyphen-terminated line continuations without a space; otherwise insert a single space. (from: pdf-translation_20260612, archived 2026-06-12)
- **Heading detection by page-level median font height:** Compute median `TextItem.height` across all items on a page; paragraphs whose average height is >= 1.4x median are flagged `isHeading`. Survives mixed pages with body and heading text without per-document thresholds. (from: pdf-translation_20260612, archived 2026-06-12)
- **Chunk translation requests before `chrome.runtime.sendMessage`:** The background `translate` handler forwards each message payload as one provider call. Callers must split uncached paragraphs by `settings.maxBatchChars` and send batches sequentially, matching the page translation's smaller visible-content batches. Prevents provider request storms. (from: pdf-translation_20260612, archived 2026-06-12)

- **`useRef` to stabilize `useEffect` deps:** When a state value changes frequently but only needs to be read (not trigger effect re-runs), sync it to a ref via a separate `useEffect` and remove the state from the main effect's dependency array. (from: pdf-perf-overhaul_20260612, archived 2026-06-12)
- **Progressive page proxy streaming:** Set `loadState: 'loaded'` as soon as the PDF document is parsed (before any page proxies are fetched), then stream proxies in small batches (e.g. 3). The pages array uses `PDFPageProxy | null` to represent pending proxies. (from: pdf-perf-overhaul_20260612, archived 2026-06-12)
- **Canvas virtualization via `useVisiblePages` hook:** Use a separate `IntersectionObserver` on page placeholders with a configurable buffer (default: 2 pages) to track which canvases should be mounted. Off-screen pages use lightweight placeholder divs sized to `page.getViewport()` dimensions. (from: pdf-perf-overhaul_20260612, archived 2026-06-12)
- **`createSemaphore()` factory for isolated concurrency:** Extract semaphore logic into a factory to enable multiple independent semaphores (e.g., PDF max 2 concurrent vs page/subtitle max 3). Prevents resource starvation across workloads. (from: pdf-perf-overhaul_20260612, archived 2026-06-12)
- **Bidirectional scroll sync with `isUpdatingRef` guard:** Both panes listen for scroll events and mirror to the other. Use `scrollTo({ behavior: 'instant' })` to avoid CSS `scroll-behavior: smooth` interference. The `isUpdatingRef` + `requestAnimationFrame` clear prevents feedback loops. (from: pdf-perf-overhaul_20260612, archived 2026-06-12)
- **`renderHook` stable prop references:** Creating array/object literals like `[{} as X]` inside a `renderHook` callback creates a new reference on every render, destabilizing effect deps. Hoist stable references outside the callback. (from: pdf-perf-overhaul_20260612, archived 2026-06-12)
- **Placeholder `minHeight` for viewport lazy-loading**: To prevent concurrent API request storms when lazy-loading translated content based on page visibility (IntersectionObserver), placeholder slots must have a `minHeight` matching the source document pages. Symmetrical width constraint (`width: widthStyle`) and centering (`margin: 0 auto`) should also match. (from: pdf-layout-scroll-sync_20260612, 2026-06-12)
- **Header placement for progress/state widgets**: Move progress indicators, stats, or global state widgets out of scrolling containers and place them in a sticky/persistent header on the right. This maintains visual symmetry, ensures constant visibility, and eliminates scrollable height mismatches that disrupt 1-to-1 scroll synchronization. (from: pdf-layout-scroll-sync_20260612, 2026-06-12)
- **1-to-1 scroll synchronization**: Direct 1-to-1 scroll mirroring (`target.scrollTop = source.scrollTop`) is preferred when page scroll heights are matched. Proportional interpolation should only be used as a fallback when container heights differ. (from: pdf-layout-scroll-sync_20260612, archived 2026-06-12)
- **PDF viewer default reading mode**: For target languages whose translations are typically longer than the source (e.g. English → Vietnamese), default the PDF right pane to `Text` mode. Treat `Layout` as a visual-reference mode for tables, forms, slides, and image-heavy PDFs. (from: pdf-translation-ux_20260615, archived 2026-06-15)
- **~~Layout translation full-text access~~** ⚠️ SUPERSEDED by elastic overlay (`pdf-elastic-overlay_20260616`): click/keyboard popover activation was removed when clipping was eliminated — elastic boxes now reflow naturally with no popover needed. (from: pdf-translation-ux_20260615, archived 2026-06-15)
- **~~Clipping detection for layout boxes~~** ⚠️ SUPERSEDED by elastic overlay (`pdf-elastic-overlay_20260616`): `isLikelyClipped` and the length/width/font overflow estimate were removed — translated paragraphs no longer clip. (from: pdf-translation-ux_20260615, archived 2026-06-15)
- **PDF viewer scoped styling**: Keep PDF viewer-specific styles (layout overlays, popovers, clipping badges) inside `entrypoints/pdf-viewer/style.css` to avoid polluting extension-wide or host-page CSS. (from: pdf-translation-ux_20260615, archived 2026-06-15)

## PDF Elastic Overlay (2026-06-16)
- **Layout mode = canvas + absolute overlay boxes with natural height (Revision 1):** The "elastic overlay" keeps the original PDF canvas (images, tables, blocks) rendered in the right pane and overlays translated text boxes at their original positions via **absolute positioning** (`left`/`top`/`width`). Boxes use `height: auto` (no fixed height, no clipping/micro-fonts/popovers/hover-scale) and an opaque white background masks only the original text — uncovered canvas areas stay visible. This preserves the "visual reference" value of Layout mode. (A first-cut pure-flow "no canvas" version was rejected by user feedback because it dropped images/tables.) (from: pdf-elastic-overlay_20260616, archived 2026-06-16)
- **Overflow spacer for natural-height absolute boxes:** Absolute-positioned boxes don't affect parent height, so a page slot would stay canvas-height even when translations overflow. Compute an estimated box height per box (`estimateBoxHeight` from text length, width, font size), track the max bottom, and render an in-flow spacer div of height `max(0, maxBottom - canvasHeight) + pad` so a tall box pushes the next page down instead of colliding. Exact rendered height isn't available at render time, so estimate it. (from: pdf-elastic-overlay_20260616, archived 2026-06-16)
- **Overlay font sizing:** Use `clamp(para.fontSize * viewport.scale, 12, 32)` — 12px readable floor, 32px cap for giant headings, where `scale = 720 / pageWidth`. Width is clamped to `min(max(para.width*scale, 40), pageWidth - left - 4)` so boxes never overflow the page slot. No per-paragraph length-ratio shrinking. (from: pdf-elastic-overlay_20260616, archived 2026-06-16)
- **Page-block scroll sync algorithm:** For two-pane sync where one pane grows taller, replace global ratio mirroring with page-block interpolation: query `[data-page-number]` (left) / `[data-page-slot]` (right), resolve each block's absolute content offset via `rect.top - containerRect.top + scrollTop`, find the block containing `source.scrollTop`, compute intra-page progress, and apply it to the matching target page. This keeps panes aligned at page boundaries. Fall back to ratio-based mirroring when no page blocks exist (keeps legacy unit tests green). (from: pdf-elastic-overlay_20260616, archived 2026-06-16)
- **Mocking `getBoundingClientRect` for scroll/sync tests in jsdom:** jsdom returns zeros for layout rects. To test geometry-based logic, mock each element's `getBoundingClientRect` to return `top: absoluteOffset - container.scrollTop` and the container's rect to `top: 0`, so the `+ scrollTop` in an offset formula cancels back to the absolute offset. (from: pdf-elastic-overlay_20260616, archived 2026-06-16)
- **When the spec/plan and a revisions.md disagree, revisions.md wins:** Always check for a `revisions.md` in the track folder before implementing against the original spec.md — an earlier session may have logged an authoritative design change. Implementing the superseded spec literally wastes a full cycle. (from: pdf-elastic-overlay_20260616, archived 2026-06-16)

## PDF Download (2026-06-18)
- **`pdf-lib` fontBytes optional with dynamic `@pdf-lib/fontkit` import** — falls back to Helvetica when no custom font is provided, avoiding WASM bundling when unused. Use dynamic `import('@pdf-lib/fontkit')` to keep the main bundle lean. (from: pdf-download_20260618, archived 2026-06-18)
- **`pdf-lib` `embedPdf()` requires pages with Content streams** — `doc.addPage()` creates pages without a Contents stream; draw at least one element (even invisible) before embedding in tests. (from: pdf-download_20260618, archived 2026-06-18)
- **Font caching via `idb-keyval` with versioned key** — cache key `'pdf-font:noto-sans:v1'` allows cache-busting on font version changes. Handle both `Uint8Array` and `ArrayBuffer` from IndexedDB. (from: pdf-download_20260618, archived 2026-06-18)
- **`vi.stubGlobal()` returns previous value, not the spy** — create `vi.fn()` separately and pass to `stubGlobal` to assert on the mock. (from: pdf-download_20260618, archived 2026-06-18)
- **3-stage download pipeline with AbortController** — translate-all → font fetch → PDF generation, each stage independently cancellable via shared `AbortSignal`. Check `signal.aborted` before each stage. (from: pdf-download_20260618, archived 2026-06-18)
- **Per-page error isolation in batch translation** — catch per-page errors and continue with remaining pages rather than aborting the entire batch. Record failures in `failedPages[]` + `errors Map` for caller decision. (from: pdf-download_20260618, archived 2026-06-18)

---
Last refreshed: 2026-06-18T22:35:00+07:00
Codebase health: 1047 tests passing across 85 files, build ~2.58MB, 0 lint errors, 43 tracks archived, 0 active tracks
