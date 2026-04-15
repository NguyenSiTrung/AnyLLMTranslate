# Track Learnings: subtitle-translation-wire_20260416

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Subtitle & Interception (most relevant)
- postMessage bridge uses channel `'anyllm-translate'` + `requestId` correlation for MAIN ↔ ISOLATED world communication. Both interceptors (XHR + fetch) block handlers until `SUBTITLE_TRANSLATED` with matching `requestId` arrives.
- Fetch interceptor must call `response.clone()` before `.text()` — body can only be consumed once.
- XHR `responseText` override via `Object.defineProperty` needs `configurable: true` for reassignment.
- CORS bypass for subtitle fetching: direct fetch first, fallback to `chrome.runtime.sendMessage` via background worker.

### Architecture (critical for this track)
- `handleTranslateSubtitle` in `services/background.ts` is fully implemented with cache read/write — no changes needed.
- `lib/subtitleBuilder.ts` exports `buildBilingualVTT(cues, options)` and `buildTranslationOnlyVTT(cues)` — use these, don't reimplement.
- `content/messageBridge.ts` `sendTranslatedSubtitle()` is defined but never called — this track makes the first call site.
- `loadSettings()` is a `chrome.*` API — only callable from ISOLATED world content scripts (coordinator is in ISOLATED world ✅).

### Cache Integration
- `getCachedTranslation` returns `null` on miss — the background `handleTranslateSubtitle` already handles this internally.

### Testing Patterns
- Mock `chrome.runtime.sendMessage` with `.mockResolvedValue(...)` — content scripts call `.catch()` on the result.
- Module-level state persists across tests — reset coordinator state in `beforeEach` via `resetCoordinatorState()`.

---

<!-- Learnings from implementation will be appended below -->

## [2026-04-16 02:39] - Phase 1+2 Tasks 1.1–2.3: Wire subtitle translation execution path

- **Implemented:** Full subtitle translation pipeline:
  - `getHandlerByPlatform()` registry helper
  - `handleIntercepted()` translation path (parse → translate → build VTT → post back)
  - `activateOverlayMode()` translate path (translate before overlay init, graceful fallback)
- **Files changed:**
  - `inject/subtitleHandlers/registry.ts` — added `getHandlerByPlatform()`
  - `content/subtitleCoordinator.ts` — wired translation in `handleIntercepted` + `activateOverlayMode`
  - `content/__tests__/subtitleCoordinator.test.ts` — created (14 tests)
- **Commit:** `9a6de2e`
- **Learnings:**
  - **Patterns:**
    - Coordinator test pattern: call `vi.resetModules()` BEFORE import in `beforeEach`, then call `startCoordinator()` explicitly after import to capture registered listeners. Do NOT only `resetModules()` in `afterEach`.
    - Capture listener handlers in module-level `let capturedHandler = null` assigned in the mock factory — avoids `toHaveBeenCalledWith` assertions and enables direct invocation.
    - ESLint `no-non-null-assertion`: use `if (handler) await handler(...)`. `no-unused-expressions`: `&&`-chained awaits are forbidden — always use `if`.
    - `chrome.runtime.sendMessage` response shape from `handleTranslateSubtitle` is `{ success, cues, error }` — always null-check before destructuring.
  - **Gotchas:**
    - `activateOverlayMode` is guarded by `if (state.isOverlayMode) return` — call `resetCoordinatorState()` before `forceOverlayMode()` in tests to clear this guard.
    - `vi.clearAllMocks()` clears spy calls but not module-level captured variables — reset those explicitly in `beforeEach`.

## [2026-04-16 02:48] - Bug Fix: SUBTITLE_TRANSLATED requestId mismatch

- **Root Cause:** `sendMessage()` in `inject/messageBridge.ts` always generated a new random `requestId`. But the XHR/fetch interceptors filter `SUBTITLE_TRANSLATED` events by `event.data?.requestId !== originalRequestId` (the ID from `SUBTITLE_INTERCEPTED`). Since the IDs never matched, the 5s timeout always fired and the original untranslated response was returned.
- **Fix:** Added optional `overrideRequestId` param to `sendMessage()`. `sendTranslatedSubtitle()` now passes `payload.requestId` as the override so the `SUBTITLE_TRANSLATED` envelope carries the same `requestId` as `SUBTITLE_INTERCEPTED`.
- **Commit:** `7bcacdc`
- **Pattern to remember:**
  - The postMessage bridge uses `requestId` for request-response correlation between worlds. Any "response" message (e.g., `SUBTITLE_TRANSLATED`) MUST carry the same `requestId` as its corresponding "request" message (`SUBTITLE_INTERCEPTED`). Never let a response function auto-generate its own requestId.
---
