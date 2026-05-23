# Track Learnings: linkedin-subtitles_20260523

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` in wxt.config.ts for XHR/fetch access.
- postMessage bridge uses channel identifier ('anyllm-translate') with origin validation and requestId correlation for MAIN ↔ ISOLATED world communication.
- Fetch interceptor must call `response.clone()` before `.text()` — Response body can only be read once.
- XHR responseText override via `Object.defineProperty` needs `configurable: true` for reassignment.
- DOMParser (browser API) for XML parsing (YouTube srv3 format) — no external parser needed.
- ResizeObserver for responsive video overlay positioning — handles video resize events.
- Fullscreen transitions need setTimeout (~100ms) for repositioning after DOM settles.
- Maximum z-index (2147483647) for overlay visibility over video players.
- BOM marker (\uFEFF) handling in subtitle formats — strip before parsing.
- Format detection heuristics: WEBVTT header, sequence number pattern, comma vs period in timing.
- CORS bypass for subtitle fetching: direct fetch first, fallback to chrome.runtime.sendMessage via background worker.
- Strict platform detection for subtitle auto-activate: Generic `querySelectorAll('video')` is unreliable on listing/search pages with autoplay thumbnails — only known platforms should auto-activate.

---

<!-- Learnings from implementation will be appended below -->
