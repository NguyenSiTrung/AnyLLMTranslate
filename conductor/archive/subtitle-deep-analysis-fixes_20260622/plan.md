# Plan: Subtitle Deep Analysis Fixes

**Track ID:** `subtitle-deep-analysis-fixes_20260622`
**Execution Mode:** Parallel where possible

---

## Phase 1: Parser & Builder Fixes
<!-- execution: parallel -->
<!-- depends: -->

Independent fixes to subtitle parsing, VTT builder, and type definitions. No dependencies on other phases.

- [x] Task 1.1: Fix parseTimestamp for MM:SS.mmm (2-segment) VTT format
  <!-- files: lib/subtitleParser.ts, tests/unit/subtitleParser.test.ts -->
  - Update regex to accept optional hours: `(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})`
  - Handle both 2-segment and 3-segment timestamps
  - Add test cases for MM:SS.mmm format

- [x] Task 1.2: Skip NOTE and STYLE blocks in parseWebVTT
  <!-- files: lib/subtitleParser.ts, tests/unit/subtitleParser.test.ts -->
  - Explicitly detect blocks starting with `NOTE` or `STYLE` and skip them
  - Add test cases for NOTE/STYLE blocks mixed with cues

- [x] Task 1.3: Add track identity fields to SubtitleInterceptedPayload type
  <!-- files: types/subtitle.ts -->
  - Add `trackLanguage?: string` and `trackUrl?: string` to `SubtitleInterceptedPayload`
  - Add `isWatchPage?: () => boolean` to `SubtitleHandler` interface (optional)

- [x] Task 1.4: Remove dead code in parser/builder layer
  <!-- files: lib/subtitleBuilder.ts, types/config.ts -->
  - Remove `buildBilingualVTT`, `buildTranslationOnlyVTT`, `BilingualOptions` from `subtitleBuilder.ts`
  - Keep `translationTimeout` in SubtitleSettings (wired in Phase 2 Task 2.1)
  - Update any tests that reference removed code

---

## Phase 2: XHR/Fetch Interceptor Hardening
<!-- execution: parallel -->
<!-- depends: -->

Critical fixes to the MAIN world interceptors. Independent from coordinator and overlay.

- [x] Task 2.1: Use translationTimeout setting instead of hardcoded 30s
  <!-- files: inject/xhrInterceptor.ts, inject/fetchInterceptor.ts -->
  - Read `translationTimeout` from settings via bridge (coordinator passes it in payload or a separate config message)
  - Replace hardcoded `30000` with the setting value
  - Default to 30s if not provided

- [x] Task 2.2: Override response property in addition to responseText
  <!-- files: inject/xhrInterceptor.ts -->
  - After translation, also override `xhr.response` with the translated VTT content
  - Handle `responseType === 'json'` by parsing the VTT as text (subtitles are always text)
  - Handle `responseType === 'arraybuffer'` by encoding the VTT string

- [x] Task 2.3: Use getPatternsForCurrentHost instead of getAllPatterns
  <!-- files: entrypoints/inject.content/index.ts, inject/subtitleHandlers/registry.ts -->
  - Replace `registry.registerPatterns(getAllPatterns())` with `registry.registerPatterns(getPatternsForCurrentHost())`
  - Ensure `getPatternsForCurrentHost` returns patterns only for handlers whose `detect()` returns true

- [x] Task 2.4: Add XHR abort signal handling
  <!-- files: inject/xhrInterceptor.ts -->
  - Listen for `abort` event on intercepted XHR
  - On abort, remove the `translatedHandler` message listener and clear the timeout
  - Prevents dangling listeners when player switches tracks quickly

- [x] Task 2.5: Anchor URL patterns to reduce false positives
  <!-- files: inject/subtitleHandlers/youtube.ts, inject/subtitleHandlers/coursera.ts, inject/subtitleHandlers/udemy.ts, inject/subtitleHandlers/linkedin.ts -->
  - YouTube: anchor to `youtube\.com\/api\/timedtext` (include domain)
  - Coursera: anchor to `coursera\.org\/.*subtitle` and `coursera\.org\/.*\.vtt`
  - Udemy: already anchored to `udemycdn\.com`
  - LinkedIn: already anchored to `(licdn\.com|linkedin\.com)`

---

## Phase 3: DOM Cue Source & TextTrack Discovery
<!-- execution: parallel -->
<!-- depends: -->

Fixes to DOM scraping and HTML5 textTrack discovery. Independent from interceptors and coordinator.

- [x] Task 3.1: Cap DOM cue rolling buffer with sliding window
  <!-- files: inject/domCueSource.ts -->
  - Keep only last N cues (e.g., 200) in the `cues` array
  - When buffer exceeds N, shift oldest cues out
  - Prune coordinator-side buffers (`domOriginalCues`, `domTranslatedCues`) in sync

- [x] Task 3.2: Unify findPrimaryVideo implementations
  <!-- files: lib/findPrimaryVideo.ts, inject/textTrackDiscovery.ts -->
  - Add `readyState >= 1` filter and `srcBonus` to `lib/findPrimaryVideo.ts`
  - Remove local `findPrimaryVideo` from `textTrackDiscovery.ts`
  - Import from `lib/findPrimaryVideo.ts` instead

- [x] Task 3.3: Throttle MutationObserver callbacks
  <!-- files: inject/domCueSource.ts, inject/textTrackDiscovery.ts -->
  - Debounce `scanForVideos` and DOM cue sampling with `requestAnimationFrame` or 50ms debounce
  - Coalesce rapid mutations into a single callback

- [x] Task 3.4: Remove dead allowlist entries
  <!-- files: services/background.ts -->
  - Remove Netflix, Amazon Prime, and other entries from `SUBTITLE_ALLOWLIST` that have no handlers
  - Keep only domains with active handlers: youtube, googlevideo, udemycdn, udemy, coursera, coursera-user-content, linkedin, licdn, cloudfront (generic CDN for Max)

---

## Phase 4: Background Service Improvements
<!-- execution: parallel -->
<!-- depends: -->

Fixes to the background service worker's subtitle session management. Independent file.

- [x] Task 4.1: Send chunk deltas instead of full arrays
  <!-- files: services/background.ts, content/subtitleCoordinator.ts -->
  - Background sends `{ action: 'SUBTITLE_CHUNK_TRANSLATED', chunkStart, chunkCues, sessionId }` instead of full `cues` array
  - Coordinator merges `chunkCues` into its existing array at `chunkStart` offset
  - Update `handleExtensionMessage` in coordinator to handle the new message shape
  - Update existing tests for the new message format

- [x] Task 4.2: Remove dead code in messageBridge
  <!-- files: inject/messageBridge.ts -->
  - Remove `requestResponse` function (unused)
  - Remove associated `__anyllmTranslateRequests` window property logic

---

## Phase 5: Platform Handler Fixes
<!-- execution: parallel -->
<!-- depends: -->

Fixes to per-platform subtitle handlers. Independent from coordinator and interceptors.

- [x] Task 5.1: YouTube handler fixes
  <!-- files: inject/subtitleHandlers/youtube.ts -->
  - `languageExtractor`: capture `tlang` param in addition to `lang` (tlang for translation language)
  - Return `tlang || lang || ''` to capture both source and translated subtitle URLs

- [x] Task 5.2: Coursera handler fixes
  <!-- files: inject/subtitleHandlers/coursera.ts -->
  - Add `languageExtractor` to second pattern (`coursera\.org\/.*\.vtt`)
  - Set `videoId` in `extractAvailableTracks` (extract from URL path or lecture ID)

- [x] Task 5.3: Udemy handler fixes
  <!-- files: inject/subtitleHandlers/udemy.ts -->
  - Set `videoId` in `extractAvailableTracks` (extract from lecture API response or URL)
  - Remove production `console.log` in languageExtractor

- [x] Task 5.4: LinkedIn handler fixes
  <!-- files: inject/subtitleHandlers/linkedin.ts -->
  - Add `getMetadataPatterns()` and `extractAvailableTracks()` for proactive track discovery
  - Match LinkedIn Learning API endpoints that return caption/track metadata

- [x] Task 5.5: HboMax handler fixes
  <!-- files: inject/subtitleHandlers/hbomax.ts -->
  - Expand `LABEL_TO_LANGUAGE` map to cover all Max-supported languages (add French, German, Italian, Japanese, Korean, Portuguese, Russian, Arabic, Hindi, Polish, Turkish, Dutch, Nordic languages)
  - Add `isWatchPage()` method returning `pathname.includes('/video/watch/')`

- [x] Task 5.6: Move isOnWatchPage into handler interface
  <!-- files: inject/subtitleHandlers/registry.ts, inject/subtitleHandlers/youtube.ts, inject/subtitleHandlers/udemy.ts, inject/subtitleHandlers/coursera.ts, inject/subtitleHandlers/linkedin.ts, inject/subtitleHandlers/hbomax.ts -->
  - Add optional `isWatchPage?(): boolean` to `SubtitleHandler` interface
  - Implement per-handler: YouTube (`/watch`), Udemy (`/learn/`), Coursera (`/lecture/`), LinkedIn (`/learning/`), HboMax (`/video/watch/`)
  - Update `detectCurrentHandler` consumers to use `handler.isWatchPage?.()` when available

---

## Phase 6: Coordinator Overhaul
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase5 -->

Central coordinator fixes. Depends on Phase 1 (types), Phase 2 (interceptor payload), Phase 5 (handler changes).

- [x] Task 6.1: Cache settings in coordinator
  <!-- files: content/subtitleCoordinator.ts -->
  - Load settings once at `startCoordinator()` into `state.cachedSettings`
  - Add `chrome.storage.onChanged` listener to refresh cache
  - Replace all `await loadSettings()` calls in hot paths with `state.cachedSettings`
  - Keep `loadSettings()` only in initialization and storage change handler

- [x] Task 6.2: Add track identity guard to handleIntercepted
  <!-- files: content/subtitleCoordinator.ts -->
  - Track `state.activeTrackIdentity` (language + URL hash)
  - When a new `SUBTITLE_INTERCEPTED` arrives with a different track identity, cancel the previous session and reset
  - Prevent translated chunks from track A overwriting track B

- [x] Task 6.3: Deduplicate auto-activate and interceptor flows
  <!-- files: content/subtitleCoordinator.ts -->
  - When `selectSubtitleTrack` fetches a URL, record it in `state.fetchedTrackUrls`
  - When `handleIntercepted` receives a URL already in `fetchedTrackUrls`, skip (the overlay already has it)
  - Clear `fetchedTrackUrls` on SPA navigation

- [x] Task 6.4: Restore native subtitles on translation failure
  <!-- files: content/subtitleCoordinator.ts -->
  - In `handleIntercepted`, if translation fails, send the original `body` back instead of empty VTT
  - Only send empty VTT after overlay is confirmed active with translated cues
  - Add retry toast with button for manual retry

- [x] Task 6.5: Fix updateCues flicker
  <!-- files: content/subtitleOverlay.ts -->
  - In `updateCues`, only reset `currentCueIndex = -1` if the cue array reference changed
  - If same array (just updated in place), keep `currentCueIndex` and let `handleTimeUpdate` check if the active cue content changed
  - Add content equality check before triggering `updateDisplayedText`

- [x] Task 6.6: Fix findActiveCue to return most recent match after seek
  <!-- files: content/subtitleOverlay.ts -->
  - When multiple cues match `currentTime`, return the LAST one in the array (most recently added)
  - Or better: after seek, find the cue whose `startTime` is closest to `currentTime` without exceeding it

- [x] Task 6.7: Implement binary search for findActiveCue
  <!-- files: content/subtitleOverlay.ts -->
  - Sort cues by `startTime` (they should already be sorted)
  - Use binary search to find the cue containing `currentTime`
  - O(log n) instead of O(n) per timeupdate event

- [x] Task 6.8: Fix coordinator message handling
  <!-- files: content/subtitleCoordinator.ts -->
  - `GET_AVAILABLE_TRACKS`: call `sendResponse({ tracks: state.availableTracks })` directly
  - `SELECT_SUBTITLE_TRACK`: return `sendResponse({ success: true/false })` after selection
  - `fetchSubtitleContent`: skip direct fetch, go straight to `fetchViaBackground` for known cross-origin CDN domains

- [x] Task 6.9: Replace module-level singleton with class instance
  <!-- files: content/subtitleCoordinator.ts -->
  - Create `SubtitleCoordinator` class with `state` as instance property
  - Export `createCoordinator()` factory function
  - Update `content.ts` to use the factory
  - Update tests to create fresh instances per test
  - Add `clearHoverCache` to coordinator cleanup function

- [x] Task 6.10: Remove interceptTimeout from coordinator state
  <!-- files: content/subtitleCoordinator.ts -->
  - Remove `interceptTimeout` field from `CoordinatorState` (unused, "reserved for future use")
  - Remove the comment and the `30000` value

---

## Phase 7: Overlay & Controls Improvements
<!-- execution: sequential -->
<!-- depends: phase6 -->

Overlay renderer improvements. Depends on Phase 6 (coordinator changes to updateCues/findActiveCue).

- [x] Task 7.1: Add accessibility attributes to overlay
  <!-- files: content/subtitleOverlay.ts -->
  - Add `role="caption"` or `role="subtitle"` to overlay container
  - Add `aria-live="polite"` to text container
  - Add `aria-label` describing the subtitle overlay

- [x] Task 7.2: Improve hideNativeCaptions strategy
  <!-- files: content/subtitleCoordinator.ts -->
  - Use `display: none` instead of `visibility: hidden` for Max caption overlay
  - Fall back to `opacity: 0` if `display: none` causes layout shift issues
  - Test on Max to verify which approach works best

---

## Phase 8: Test Coverage Gap Filling
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4, phase5, phase6, phase7 -->

Write comprehensive tests for previously untested critical components. Depends on all prior phases (tests against final implementation).

- [x] Task 8.1: XHR interceptor unit tests
  <!-- files: inject/__tests__/xhrInterceptor.test.ts -->
  - Test open/send patching, match detection, handler capture (addEventListener + property)
  - Test response override (responseText + response), timeout behavior, abort handling
  - Test enable/disable cycle (no double-wrapping)
  - Test metadata interception (non-blocking pass-through)

- [x] Task 8.2: Fetch interceptor unit tests
  <!-- files: inject/__tests__/fetchInterceptor.test.ts -->
  - Test response cloning, translation replacement, timeout
  - Test metadata interception (non-blocking)
  - Test enable/disable cycle
  - Test non-subtitle URL pass-through

- [x] Task 8.3: DOM cue source unit tests
  <!-- files: inject/__tests__/domCueSource.test.ts -->
  - Test MutationObserver attachment, cue sampling, rolling buffer cap
  - Test track switch reset (SUBTITLE_DOM_TRACK_CHANGED emission)
  - Test deferred attach (late-mounting video/caption overlay)
  - Test open cue endTime correction

- [x] Task 8.4: TextTrack discovery unit tests
  <!-- files: inject/__tests__/textTrackDiscovery.test.ts -->
  - Test video scanning, addtrack event, loadedmetadata rescan
  - Test MutationObserver for dynamically inserted videos
  - Test primary video selection (uses unified findPrimaryVideo)

- [x] Task 8.5: YouTube parser unit tests
  <!-- files: inject/subtitleHandlers/__tests__/youtube.test.ts -->
  - Test parseSrv3 with sample XML (timing, duration, text extraction)
  - Test parseJson3 with sample JSON (events, segs, tStartMs/dDurationMs)
  - Test transformResponse format detection (json3 vs srv3 vs fallback)
  - Test extractAvailableTracks with player API response

---

## Phase 9: Final Verification
<!-- execution: sequential -->
<!-- depends: phase8 -->

- [x] Task 9.1: Run full test suite and lint
  <!-- files: -->
  - Run `npx vitest run` — all tests pass
  - Run `npx eslint .` — zero errors
  - Run `npx wxt build` — build succeeds
  - Fix any failures from prior phases

- [x] Task 9.2: Conductor - User Manual Verification 'Final Verification' (Protocol in workflow.md)
