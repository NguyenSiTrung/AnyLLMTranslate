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

## [2026-06-22 17:25] - Track Complete: All 9 Phases
- **Implemented:** 50 findings from deep analysis across 9 phases
- **Files changed:** lib/subtitleParser.ts, lib/subtitleBuilder.ts (removed), types/subtitle.ts, types/config.ts, inject/xhrInterceptor.ts, inject/fetchInterceptor.ts, inject/domCueSource.ts, inject/textTrackDiscovery.ts, inject/messageBridge.ts, inject/subtitleHandlers/registry.ts, inject/subtitleHandlers/youtube.ts, inject/subtitleHandlers/coursera.ts, inject/subtitleHandlers/udemy.ts, inject/subtitleHandlers/linkedin.ts, inject/subtitleHandlers/hbomax.ts, content/subtitleCoordinator.ts, content/subtitleOverlay.ts, services/background.ts, entrypoints/inject.content/index.ts
- **Commits:** 7 commits (Phase 1, Phase 2+5, Phase 3+4, Phase 6, Phase 7, Phase 8, Phase 9)
- **Tests:** 1213 passing (up from 1182), 0 lint errors, 0 type errors, build OK
- **Learnings:**
  - Patterns: `SUBTITLE_CONFIG` bridge message pattern for MAIN↔ISOLATED config sync; binary search for cue lookup; lazy settings caching with storage.onChanged refresh
  - Gotchas: `const self = this` in interceptor closures triggers `no-this-alias` lint; test mock `addEventListener` must capture all event types or `simulateXhrComplete` breaks; proactive settings caching in startCoordinator races with test mock setup — use lazy caching instead
  - Context: `translationTimeout` in SubtitleSettings is now wired to interceptors via SUBTITLE_CONFIG message (was previously unused); `sendTranslatedSubtitle` is one-shot per requestId — must not send empty VTT before translation succeeds if you want to restore native on failure
  - Spec issue: FR-1 (use translationTimeout) and FR-13 (remove translationTimeout) were contradictory — resolved by wiring it to interceptors (making it no longer unused)
