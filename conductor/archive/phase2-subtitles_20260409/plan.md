# Implementation Plan: Video Subtitle Translation Engine (Phase 2)

## Phase 1: Core Infrastructure & Parsers
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1: MAIN world script injection via WXT
  <!-- files: entrypoints/inject.content/index.ts, wxt.config.ts -->
  - [x] Create `entrypoints/inject.content/index.ts` as MAIN world content script
  - [x] Configure WXT for MAIN world injection (`world: 'MAIN'`, `run_at: 'document_start'`)
  - [x] Verify script loads in page context (can access `window.XMLHttpRequest`)
  - [x] Write unit tests for injection setup

- [x] Task 2: postMessage bridge (inject ↔ content)
  <!-- files: content/messageBridge.ts, inject/messageBridge.ts, types/subtitle.ts -->
  <!-- depends: task1 -->
  - [x] Create `content/messageBridge.ts` — content script side listener
  - [x] Create `inject/messageBridge.ts` — inject script side sender/receiver
  - [x] Define message protocol types in `types/subtitle.ts`
  - [x] Use channel identifier `lingua-lens` with origin validation
  - [x] Support request/response correlation via `requestId`
  - [x] Write unit tests for message serialization and protocol

- [x] Task 3: WebVTT parser
  <!-- files: lib/subtitleParser.ts, tests/unit/subtitleParser.test.ts -->
  - [x] Create `lib/subtitleParser.ts` with `parseWebVTT()` function
  - [x] Parse VTT header, cue timing, cue text
  - [x] Handle multi-line cues, HTML tags, BOM markers
  - [x] Normalize to `SubtitleCue[]` interface
  - [x] Write comprehensive unit tests (normal, edge cases, malformed)

- [x] Task 4: SRT parser
  <!-- files: lib/subtitleParser.ts, tests/unit/subtitleParser.test.ts -->
  <!-- depends: task3 -->
  - [x] Add `parseSRT()` to `lib/subtitleParser.ts`
  - [x] Parse SRT sequence numbers, timing (comma separator), text
  - [x] Auto-detect format (VTT vs SRT) via `parseSubtitles()` dispatcher
  - [x] Write unit tests for SRT-specific edge cases

- [x] Task 5: Bilingual VTT builder
  <!-- files: lib/subtitleBuilder.ts, tests/unit/subtitleBuilder.test.ts -->
  - [x] Create `lib/subtitleBuilder.ts` with `buildBilingualVTT()` function
  - [x] Support bilingual mode (original + translation per cue)
  - [x] Support translation-only mode
  - [x] Preserve timing and positioning metadata
  - [x] Write unit tests for builder output validity

- [ ] Task: Conductor - User Manual Verification 'Core Infrastructure & Parsers' (Protocol in workflow.md)

## Phase 2: Network Interception
<!-- execution: sequential -->

- [x] Task 1: XHR interceptor
  <!-- files: inject/xhrInterceptor.ts, tests/unit/xhrInterceptor.test.ts -->
  - [x] Create `inject/xhrInterceptor.ts`
  - [x] Monkey-patch `XMLHttpRequest.prototype.open` and `send`
  - [x] Match subtitle URLs against platform-specific patterns
  - [x] Hold response, send to bridge, return modified response
  - [x] Ensure non-subtitle requests pass through unmodified
  - [x] Write unit tests with mock XHR

- [x] Task 2: Fetch interceptor
  <!-- files: inject/fetchInterceptor.ts, tests/unit/fetchInterceptor.test.ts -->
  - [x] Create `inject/fetchInterceptor.ts`
  - [x] Monkey-patch `window.fetch`
  - [x] Same URL pattern matching as XHR
  - [x] Clone responses for non-subtitle requests
  - [x] Write unit tests with mock fetch

- [x] Task 3: Interceptor integration with bridge
  <!-- files: entrypoints/inject.content/index.ts, inject/interceptorRegistry.ts -->
  - [x] Wire interceptors to postMessage bridge in inject entrypoint
  - [x] Add subtitle URL pattern registry (per-platform patterns)
  - [x] Add timeout handling (if translation takes too long, return original)
  - [x] Write integration tests

- [ ] Task: Conductor - User Manual Verification 'Network Interception' (Protocol in workflow.md)

## Phase 3: Platform Subtitle Handlers
<!-- execution: parallel -->

- [x] Task 1: Base subtitle handler + handler registry
  <!-- files: inject/subtitleHandlers/base.ts -->
  - [x] Create `inject/subtitleHandlers/base.ts` with abstract `SubtitleHandler` interface
  - [x] Define: `detect()`, `getPatterns()`, `transformResponse()`
  - [x] Create handler registry for auto-detection by hostname
  - [x] Write unit tests for registry

- [x] Task 2: YouTube subtitle handler
  <!-- files: inject/subtitleHandlers/youtube.ts, tests/unit/youtubeHandler.test.ts -->
  <!-- depends: task1 -->
  - [x] Create `inject/subtitleHandlers/youtube.ts`
  - [x] Detect YouTube pages (hostname + video player presence)
  - [x] Match `/api/timedtext` URL pattern
  - [x] Parse YouTube srv3 (XML) → `SubtitleCue[]`
  - [x] Parse YouTube JSON3 → `SubtitleCue[]`
  - [x] Handle auto-generated vs manual captions
  - [x] Write unit tests with sample YouTube subtitle responses

- [x] Task 3: Udemy subtitle handler
  <!-- files: inject/subtitleHandlers/udemy.ts, tests/unit/udemyHandler.test.ts -->
  <!-- depends: task1 -->
  - [x] Create `inject/subtitleHandlers/udemy.ts`
  - [x] Detect Udemy course pages
  - [x] Match `*.udemycdn.com/*.vtt` URL pattern
  - [x] Handle SPA navigation between lectures
  - [x] Write unit tests with sample Udemy subtitle responses

- [x] Task 4: Coursera subtitle handler
  <!-- files: inject/subtitleHandlers/coursera.ts, tests/unit/courseraHandler.test.ts -->
  <!-- depends: task1 -->
  - [x] Create `inject/subtitleHandlers/coursera.ts`
  - [x] Detect Coursera course pages
  - [x] Match `*.coursera.org/*subtitle*` URL pattern
  - [x] Handle lecture navigation and playlist progression
  - [x] Write unit tests with sample Coursera subtitle responses

- [ ] Task: Conductor - User Manual Verification 'Platform Subtitle Handlers' (Protocol in workflow.md)

## Phase 4: Custom Subtitle Overlay (Fallback)
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 1: Overlay renderer
  <!-- files: content/subtitleOverlay.ts, tests/unit/subtitleOverlay.test.ts -->
  - [x] Create `content/subtitleOverlay.ts`
  - [x] Auto-detect video element on page
  - [x] Create overlay DOM structure positioned over video
  - [x] Sync displayed cue with `video.currentTime` via `timeupdate` event
  - [x] Handle video resize and fullscreen mode (`ResizeObserver` + `fullscreenchange`)
  - [x] Smooth fade-in/out transitions between cues
  - [x] Write unit tests for cue synchronization logic

- [x] Task 2: User controls
  <!-- files: content/subtitleOverlay.ts, content/subtitleControls.ts -->
  - [x] Add font size slider (12px–36px range)
  - [x] Add position toggle (top/bottom of video)
  - [x] Add background opacity slider (0%–100%)
  - [x] Add drag-to-reposition functionality
  - [x] Persist user preferences in `chrome.storage.local`
  - [x] Write unit tests for control state management

- [x] Task 3: Subtitle styling CSS
  <!-- files: styles/subtitle.css -->
  - [x] Create `styles/subtitle.css`
  - [x] Semi-transparent background (default: `rgba(0,0,0,0.75)`)
  - [x] Bilingual display: original (smaller, dimmer) + translation (larger, brighter)
  - [x] Dark/light video background support
  - [x] Responsive font sizing
  - [x] Fade-in/out transitions

- [x] Task 4: Auto-fallback logic
  <!-- files: content/subtitleCoordinator.ts -->
  - [x] Detect when interception fails (timeout, error, no handler matched)
  - [x] Automatically activate overlay renderer
  - [x] Fetch subtitles directly via background worker (CORS bypass)
  - [x] Write integration tests for fallback detection

- [ ] Task: Conductor - User Manual Verification 'Custom Subtitle Overlay' (Protocol in workflow.md)

## Phase 5: Integration & Verification
<!-- execution: sequential -->
<!-- depends: phase2, phase3, phase4 -->

- [x] Task 1: Background worker subtitle routing
  <!-- files: services/background.ts -->
  - [x] Add `TRANSLATE_SUBTITLE` message handler to background service worker
  - [x] Batch translate subtitle cues via translation service
  - [x] Cache translated subtitles in IndexedDB
  - [x] Return `SUBTITLE_TRANSLATED` response

- [x] Task 2: Content script subtitle coordinator
  <!-- files: content/subtitleCoordinator.ts, entrypoints/content.ts -->
  - [x] Create `content/subtitleCoordinator.ts` — orchestrates the full subtitle flow
  - [x] Listen for bridge messages, route to background for translation
  - [x] Decide interception vs overlay path
  - [x] Wire up with existing popup toggle state

- [x] Task 3: End-to-end verification & regression
  <!-- files: tests/ -->
  - [x] Verify YouTube subtitle translation flow (unit tests)
  - [x] Verify Udemy subtitle translation flow (unit tests)
  - [x] Verify Coursera subtitle translation flow (unit tests)
  - [x] Verify fallback overlay on unknown sites (unit tests)
  - [x] Verify no regression on Phase 1 page translation (all tests pass)
  - [x] Run full test suite: 111 tests passing
  - [x] Run lint: no errors

- [ ] Task: Conductor - User Manual Verification 'Integration & Verification' (Protocol in workflow.md)
