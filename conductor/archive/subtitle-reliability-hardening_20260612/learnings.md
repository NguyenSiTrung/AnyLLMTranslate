# Track Learnings: subtitle-reliability-hardening_20260612

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` for XHR/fetch access.
- postMessage bridge uses channel identifier `anyllm-translate` with origin validation and requestId correlation for MAIN ↔ ISOLATED world communication.
- Fetch interceptor must call `response.clone()` before `.text()` because a Response body can only be read once.
- XHR responseText override via `Object.defineProperty` needs `configurable: true` for reassignment.
- Subtitle handlers must be registered in both the isolated world script and the MAIN world script.
- Background service worker is stateless per-session; tab-scoped runtime state in Maps is recreated on service worker restart.
- Use a mutable array queue for async subtitle chunk processing so seek handling can reprioritize chunks.
- HTML5 TextTrack discovery uses `video.textTracks` + `addtrack` with `WeakSet<HTMLVideoElement>` deduplication.
- Interceptor enable/disable must restore captured originals carefully to avoid double wrapping on disable→enable cycles.
- Subtitle session teardown currently drains `activeSessions` queues on restore/navigation/tab close; do not call cancellation from generic test reset helpers.
- Tests for origin validation must set `MessageEvent.origin` explicitly in jsdom.
- DOM-dependent tests using MutationObserver or event listeners in Vitest/jsdom often require an async tick before assertions.

---

<!-- Learnings from implementation will be appended below -->
