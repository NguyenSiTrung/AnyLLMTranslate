# Track Learnings: coursera-udemy-handler-fixes_20260623

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Subtitle & Interception
- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` in wxt.config.ts for XHR/fetch access.
- postMessage bridge uses channel identifier ('anyllm-translate') with origin validation and requestId correlation for MAIN ↔ ISOLATED world communication.
- Fetch interceptor must call `response.clone()` before `.text()` — Response body can only be read once.
- XHR responseText override via `Object.defineProperty` needs `configurable: true` for reassignment.
- DOMParser (browser API) for XML parsing (YouTube srv3 format) — no external parser needed.
- Subtitle handlers must be registered in both the isolated world script (coordination/UI) and the MAIN world script (XHR/fetch interception).
- Interceptor always-respond rule: Every early-return path in `handleIntercepted()` must call `sendTranslatedSubtitle()` with original content.
- Session identity for stale chunk rejection: monotonic `subtitleSessionCounter` in background + `activeSubtitleSessionId` in coordinator.

### URL Pattern Filtering
- Negative lookahead regex `(?!.*(keyword1|keyword2|keyword3))` for excluding multiple URL patterns — must be placed before the matching pattern to work correctly.
- Early-exit optimization: only trigger when ALL items are filtered, not just first — allows mixed content handling.
- Cue-level filtering allows mixed content (some items filtered, others retained) — useful for subtitle handlers with mixed metadata.

### Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts (tsconfig paths are not auto-resolved by Vite).
- `loadSettings` mocks must include all properties used by the implementation.
- DOM-dependent tests using MutationObserver require async event loop tick.
- Storage mocks need settings nested under `anyllm-translate-settings` key.
- jsdom's XMLHttpRequest fires real readystatechange events — test mocks must capture handlers via spy.
- FetchInterceptor captures `window.fetch` at module load time — tests must mock before dynamic import.
- Test helpers for origin-checking must set `MessageEvent.origin` explicitly in jsdom.

### Coordinator Testing
- Call `vi.resetModules()` BEFORE import in `beforeEach`, then call `startCoordinator()` explicitly after import.
- Capture listener handlers in module-level variables assigned in the mock factory.
- Testing singleton guards: Call explicit reset methods before forcing modes in tests.

---

<!-- Learnings from implementation will be appended below -->

## [2026-06-23] - Phase 1-4 implementation
- **Implemented:** Coursera CDN VTT patterns, API videoId extraction, subtitlesVtt array handling; Udemy locale BCP-47, sprite `#xywh=` filter, CDN language path extractor; domain-anchored detect(); parseSubtitles + warn on metadata parse errors; removed coordinator Udemy/Coursera isWatchPage fallbacks.
- **Files changed:** inject/subtitleHandlers/coursera.ts, inject/subtitleHandlers/udemy.ts, content/subtitleCoordinator.ts, tests/unit/*, content/__tests__/subtitleCoordinator.test.ts
- **Learnings:**
  - Patterns: Coordinator proactive detection tests need `mockHandler.isWatchPage` when `detectCurrentHandler` is mocked — pathname fallback no longer covers YouTube without handler.
  - Gotchas: Coursera VTT language from filename uses `[_-]({2,3}...)` before path segments to avoid matching `api` in `/api/...`.
  - Context: `getPatternsForCurrentHost()` only includes patterns when `handler.detect()` is true on current hostname.
---
