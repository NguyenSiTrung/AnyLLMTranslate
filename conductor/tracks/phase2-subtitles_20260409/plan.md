# Implementation Plan: Video Subtitle Translation Engine (Phase 2)

## Phase 1: Core Infrastructure & Parsers
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: MAIN world script injection via WXT
  <!-- files: entrypoints/inject.content/index.ts, wxt.config.ts -->
  - [ ] Create `entrypoints/inject.content/index.ts` as MAIN world content script
  - [ ] Configure WXT for MAIN world injection (`world: 'MAIN'`, `run_at: 'document_start'`)
  - [ ] Verify script loads in page context (can access `window.XMLHttpRequest`)
  - [ ] Write unit tests for injection setup

- [ ] Task 2: postMessage bridge (inject ↔ content)
  <!-- files: content/messageBridge.ts, inject/messageBridge.ts, types/subtitle.ts -->
  <!-- depends: task1 -->
  - [ ] Create `content/messageBridge.ts` — content script side listener
  - [ ] Create `inject/messageBridge.ts` — inject script side sender/receiver
  - [ ] Define message protocol types in `types/subtitle.ts`
  - [ ] Use channel identifier `lingua-lens` with origin validation
  - [ ] Support request/response correlation via `requestId`
  - [ ] Write unit tests for message serialization and protocol

- [ ] Task 3: WebVTT parser
  <!-- files: lib/subtitleParser.ts, tests/unit/subtitleParser.test.ts -->
  - [ ] Create `lib/subtitleParser.ts` with `parseWebVTT()` function
  - [ ] Parse VTT header, cue timing, cue text
  - [ ] Handle multi-line cues, HTML tags, BOM markers
  - [ ] Normalize to `SubtitleCue[]` interface
  - [ ] Write comprehensive unit tests (normal, edge cases, malformed)

- [ ] Task 4: SRT parser
  <!-- files: lib/subtitleParser.ts, tests/unit/subtitleParser.test.ts -->
  <!-- depends: task3 -->
  - [ ] Add `parseSRT()` to `lib/subtitleParser.ts`
  - [ ] Parse SRT sequence numbers, timing (comma separator), text
  - [ ] Auto-detect format (VTT vs SRT) via `parseSubtitles()` dispatcher
  - [ ] Write unit tests for SRT-specific edge cases

- [ ] Task 5: Bilingual VTT builder
  <!-- files: lib/subtitleBuilder.ts, tests/unit/subtitleBuilder.test.ts -->
  - [ ] Create `lib/subtitleBuilder.ts` with `buildBilingualVTT()` function
  - [ ] Support bilingual mode (original + translation per cue)
  - [ ] Support translation-only mode
  - [ ] Preserve timing and positioning metadata
  - [ ] Write unit tests for builder output validity

- [ ] Task: Conductor - User Manual Verification 'Core Infrastructure & Parsers' (Protocol in workflow.md)

## Phase 2: Network Interception
<!-- execution: sequential -->

- [ ] Task 1: XHR interceptor
  <!-- files: inject/xhrInterceptor.ts, tests/unit/xhrInterceptor.test.ts -->
  - [ ] Create `inject/xhrInterceptor.ts`
  - [ ] Monkey-patch `XMLHttpRequest.prototype.open` and `send`
  - [ ] Match subtitle URLs against platform-specific patterns
  - [ ] Hold response, send to bridge, return modified response
  - [ ] Ensure non-subtitle requests pass through unmodified
  - [ ] Write unit tests with mock XHR

- [ ] Task 2: Fetch interceptor
  <!-- files: inject/fetchInterceptor.ts, tests/unit/fetchInterceptor.test.ts -->
  - [ ] Create `inject/fetchInterceptor.ts`
  - [ ] Monkey-patch `window.fetch`
  - [ ] Same URL pattern matching as XHR
  - [ ] Clone responses for non-subtitle requests
  - [ ] Write unit tests with mock fetch

- [ ] Task 3: Interceptor integration with bridge
  <!-- files: entrypoints/inject.content/index.ts, inject/interceptorRegistry.ts -->
  - [ ] Wire interceptors to postMessage bridge in inject entrypoint
  - [ ] Add subtitle URL pattern registry (per-platform patterns)
  - [ ] Add timeout handling (if translation takes too long, return original)
  - [ ] Write integration tests

- [ ] Task: Conductor - User Manual Verification 'Network Interception' (Protocol in workflow.md)

## Phase 3: Platform Subtitle Handlers
<!-- execution: parallel -->

- [ ] Task 1: Base subtitle handler + handler registry
  <!-- files: inject/subtitleHandlers/base.ts -->
  - [ ] Create `inject/subtitleHandlers/base.ts` with abstract `SubtitleHandler` interface
  - [ ] Define: `detect()`, `getPatterns()`, `transformResponse()`
  - [ ] Create handler registry for auto-detection by hostname
  - [ ] Write unit tests for registry

- [ ] Task 2: YouTube subtitle handler
  <!-- files: inject/subtitleHandlers/youtube.ts, tests/unit/youtubeHandler.test.ts -->
  <!-- depends: task1 -->
  - [ ] Create `inject/subtitleHandlers/youtube.ts`
  - [ ] Detect YouTube pages (hostname + video player presence)
  - [ ] Match `/api/timedtext` URL pattern
  - [ ] Parse YouTube srv3 (XML) → `SubtitleCue[]`
  - [ ] Parse YouTube JSON3 → `SubtitleCue[]`
  - [ ] Handle auto-generated vs manual captions
  - [ ] Write unit tests with sample YouTube subtitle responses

- [ ] Task 3: Udemy subtitle handler
  <!-- files: inject/subtitleHandlers/udemy.ts, tests/unit/udemyHandler.test.ts -->
  <!-- depends: task1 -->
  - [ ] Create `inject/subtitleHandlers/udemy.ts`
  - [ ] Detect Udemy course pages
  - [ ] Match `*.udemycdn.com/*.vtt` URL pattern
  - [ ] Handle SPA navigation between lectures
  - [ ] Write unit tests with sample Udemy subtitle responses

- [ ] Task 4: Coursera subtitle handler
  <!-- files: inject/subtitleHandlers/coursera.ts, tests/unit/courseraHandler.test.ts -->
  <!-- depends: task1 -->
  - [ ] Create `inject/subtitleHandlers/coursera.ts`
  - [ ] Detect Coursera course pages
  - [ ] Match `*.coursera.org/*subtitle*` URL pattern
  - [ ] Handle lecture navigation and playlist progression
  - [ ] Write unit tests with sample Coursera subtitle responses

- [ ] Task: Conductor - User Manual Verification 'Platform Subtitle Handlers' (Protocol in workflow.md)

## Phase 4: Custom Subtitle Overlay (Fallback)
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 1: Overlay renderer
  <!-- files: content/subtitleOverlay.ts, tests/unit/subtitleOverlay.test.ts -->
  - [ ] Create `content/subtitleOverlay.ts`
  - [ ] Auto-detect video element on page
  - [ ] Create overlay DOM structure positioned over video
  - [ ] Sync displayed cue with `video.currentTime` via `timeupdate` event
  - [ ] Handle video resize and fullscreen mode (`ResizeObserver` + `fullscreenchange`)
  - [ ] Smooth fade-in/out transitions between cues
  - [ ] Write unit tests for cue synchronization logic

- [ ] Task 2: User controls
  <!-- files: content/subtitleOverlay.ts, content/subtitleControls.ts -->
  - [ ] Add font size slider (12px–36px range)
  - [ ] Add position toggle (top/bottom of video)
  - [ ] Add background opacity slider (0%–100%)
  - [ ] Add drag-to-reposition functionality
  - [ ] Persist user preferences in `chrome.storage.local`
  - [ ] Write unit tests for control state management

- [ ] Task 3: Subtitle styling CSS
  <!-- files: styles/subtitle.css -->
  - [ ] Create `styles/subtitle.css`
  - [ ] Semi-transparent background (default: `rgba(0,0,0,0.75)`)
  - [ ] Bilingual display: original (smaller, dimmer) + translation (larger, brighter)
  - [ ] Dark/light video background support
  - [ ] Responsive font sizing
  - [ ] Fade-in/out transitions

- [ ] Task 4: Auto-fallback logic
  <!-- files: content/subtitleCoordinator.ts -->
  - [ ] Detect when interception fails (timeout, error, no handler matched)
  - [ ] Automatically activate overlay renderer
  - [ ] Fetch subtitles directly via background worker (CORS bypass)
  - [ ] Write integration tests for fallback detection

- [ ] Task: Conductor - User Manual Verification 'Custom Subtitle Overlay' (Protocol in workflow.md)

## Phase 5: Integration & Verification
<!-- execution: sequential -->
<!-- depends: phase2, phase3, phase4 -->

- [ ] Task 1: Background worker subtitle routing
  <!-- files: services/background.ts -->
  - [ ] Add `TRANSLATE_SUBTITLE` message handler to background service worker
  - [ ] Batch translate subtitle cues via translation service
  - [ ] Cache translated subtitles in IndexedDB
  - [ ] Return `SUBTITLE_TRANSLATED` response

- [ ] Task 2: Content script subtitle coordinator
  <!-- files: content/subtitleCoordinator.ts, entrypoints/content.ts -->
  - [ ] Create `content/subtitleCoordinator.ts` — orchestrates the full subtitle flow
  - [ ] Listen for bridge messages, route to background for translation
  - [ ] Decide interception vs overlay path
  - [ ] Wire up with existing popup toggle state

- [ ] Task 3: End-to-end verification & regression
  <!-- files: tests/ -->
  - [ ] Verify YouTube subtitle translation flow
  - [ ] Verify Udemy subtitle translation flow
  - [ ] Verify Coursera subtitle translation flow
  - [ ] Verify fallback overlay on unknown sites
  - [ ] Verify no regression on Phase 1 page translation
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run lint: `pnpm lint`

- [ ] Task: Conductor - User Manual Verification 'Integration & Verification' (Protocol in workflow.md)
