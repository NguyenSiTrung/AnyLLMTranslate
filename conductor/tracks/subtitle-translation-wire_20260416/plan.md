# Implementation Plan: Subtitle Translation Flow — Wire Missing Execution Path

## Phase 1: Registry Helper + `handleIntercepted` Core Path
<!-- execution: sequential -->

- [ ] Task 1.1: Write failing tests for the `handleIntercepted` translation path
  - File: `content/__tests__/subtitleCoordinator.test.ts`
  - Test: resolves handler by `payload.platform` → calls `transformResponse()` → calls background `translateSubtitle`
  - Test: `sendTranslatedSubtitle` is called with correct `requestId` + VTT string content
  - Test: empty cue array (`cues.length === 0`) → silently skipped, no background call
  - Test: `clearPendingRequest(requestId)` called on successful translation
  - Test: translation error → logs warning, does NOT call `sendTranslatedSubtitle`

- [ ] Task 1.2: Add `getHandlerByPlatform()` to `inject/subtitleHandlers/registry.ts`
  - Signature: `getHandlerByPlatform(platform: string): SubtitleHandler | null`
  - Implementation: `handlers.find(h => h.platform === platform) ?? null`
  - Export as named function alongside existing exports

- [ ] Task 1.3: Implement `handleIntercepted` translation path in `content/subtitleCoordinator.ts`
  - Import: `getHandlerByPlatform` from `@/inject/subtitleHandlers/registry`
  - Import: `buildBilingualVTT`, `buildTranslationOnlyVTT` from `@/lib/subtitleBuilder`
  - Import: `sendTranslatedSubtitle` from `@/content/messageBridge`
  - Import: `loadSettings` from `@/lib/config`
  - Logic:
    1. `const handler = getHandlerByPlatform(payload.platform)` → if null, return
    2. `const cues = handler.transformResponse(body, contentType, url)` → if empty, return
    3. `const settings = await loadSettings()`
    4. `const sourceLanguage = payload.originalLanguage || settings.sourceLanguage`
    5. Send `translateSubtitle` message to background
    6. On success: build VTT via `buildBilingualVTT` or `buildTranslationOnlyVTT` based on `settings.displayMode`
    7. `sendTranslatedSubtitle({ requestId, vttContent })`
    8. `clearPendingRequest(requestId)`
    9. On error: `console.warn(...)` only — timeout will replay original

- [ ] Task 1.4: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Overlay Fallback Translation
<!-- execution: sequential -->

- [ ] Task 2.1: Write failing tests for `activateOverlayMode` translate path
  - File: `content/__tests__/subtitleCoordinator.test.ts` (extend existing or add section)
  - Test: `chrome.runtime.sendMessage({ action: 'translateSubtitle' })` called after `parseSubtitles()`
  - Test: `initializeOverlay` receives translated cues (not original)
  - Test: if background returns error → `initializeOverlay` is still called with original cues (graceful degradation)

- [ ] Task 2.2: Update `activateOverlayMode` in `content/subtitleCoordinator.ts`
  - After `const cues = parseSubtitles(subtitleContent)`, call background `translateSubtitle`
  - `const settings = await loadSettings()`
  - On success: `initializeOverlay(response.cues)`
  - On error or no success: `initializeOverlay(cues)` (original, graceful degradation)

- [ ] Task 2.3: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Full Verification
<!-- execution: sequential -->

- [ ] Task 3.1: Run full test suite and lint
  - `pnpm test` — all tests passing (zero regressions)
  - `pnpm lint` — lint-clean

- [ ] Task 3.2: Manual end-to-end verification
  - YouTube: intercept fires → subtitles translated → bilingual captions visible in player
  - Udemy: intercept fires → subtitles translated → bilingual captions visible in player
  - Sprite track on Udemy: silently skipped, no console error, no background call
  - Overlay fallback (manually block XHR in dev tools): shows translated cues

- [ ] Task 3.3: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
