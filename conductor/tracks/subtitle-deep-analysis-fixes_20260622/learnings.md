# Track Learnings: subtitle-deep-analysis-fixes_20260622

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
- Interceptor enable/disable: capture originals into instance fields to avoid double-wrapping.
- Session identity for stale chunk rejection: monotonic `subtitleSessionCounter` in background + `activeSubtitleSessionId` in coordinator.
- DOM-sourced platforms (Max): manual Alt+S / context menu must call `tryAutoActivateForDom({ manual: true })`.
- Use shared `lib/findPrimaryVideo()` (largest layout area) for DOM cue sampling and subtitle overlay attachment.

### Testing
- Vitest `@/` alias needs `resolve.alias` in vitest.config.ts.
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
