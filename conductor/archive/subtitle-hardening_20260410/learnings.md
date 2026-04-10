# Track Learnings: subtitle-hardening_20260410

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md`:

### Subtitle & Interception
- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` for XHR/fetch access.
- postMessage bridge uses channel identifier ('lingua-lens') with origin validation and requestId correlation for MAIN ↔ ISOLATED world communication.
- Fetch interceptor must call `response.clone()` before `.text()` — Response body can only be read once.
- XHR responseText override via `Object.defineProperty` needs `configurable: true` for reassignment.
- DOMParser (browser API) for XML parsing (YouTube srv3 format) — no external parser needed.
- ResizeObserver for responsive video overlay positioning — handles video resize events.
- Fullscreen transitions need setTimeout (~100ms) for repositioning after DOM settles.
- Maximum z-index (2147483647) for overlay visibility over video players.
- BOM marker (\uFEFF) handling in subtitle parsers — strip before parsing.
- CORS bypass for subtitle fetching: direct fetch first, fallback to chrome.runtime.sendMessage via background worker.

### Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite).

### Architecture
- WXT uses `entrypoints/` dir (not `src/`) for background.ts, content.ts, popup/. Other code lives at project root (lib/, types/, services/, content/).
- Background service worker is stateless per-session.

---

## [2026-04-10 19:00] - All Phases: Subtitle Hardening Implementation
- **Implemented:** XHR block-and-wait, addEventListener patching, coordinator timeout clearing, origin validation, fetch error guard, overlay video targeting, YouTube JSON3 segment join fix
- **Files changed:** inject/xhrInterceptor.ts, inject/fetchInterceptor.ts, inject/messageBridge.ts, inject/subtitleHandlers/youtube.ts, content/subtitleCoordinator.ts, content/subtitleOverlay.ts, tests/unit/xhrInterceptor.test.ts, tests/unit/fetchInterceptor.test.ts, tests/unit/messageBridge.test.ts, tests/unit/subtitleCoordinator.test.ts, tests/unit/subtitleOverlay.test.ts, tests/unit/youtubeHandler.test.ts
- **Commit:** cde44e6
- **Learnings:**
  - Patterns: XHR `addEventListener` patch must capture handlers in a Map per XHR instance, suppressing real registration and replaying manually after translation.
  - Patterns: `eslint-disable-next-line @typescript-eslint/no-this-alias` needed for `this` capture in patched prototype methods.
  - Gotchas: jsdom's XMLHttpRequest fires real readystatechange events when properties change — test mocks must capture handlers via spy on `addEventListener` and NOT call the real impl.
  - Gotchas: FetchInterceptor captures `window.fetch` at module load time — tests must mock `window.fetch` BEFORE dynamic import of the module.
  - Gotchas: YouTube JSON3 `join('')` collapses segment boundaries — `join(' ')` with `filter` + `replace(/\s+/g, ' ')` preserves word spacing.
  - Context: `clearPendingRequest` is wired via `onMessage('SUBTITLE_TRANSLATED')` in the coordinator's `startCoordinator()`.
---
