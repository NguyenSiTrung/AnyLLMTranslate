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

<!-- Learnings from implementation will be appended below -->
