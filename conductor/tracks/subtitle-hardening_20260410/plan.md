# Implementation Plan: subtitle-hardening_20260410

## Phase 1: XHR Interceptor — Block-and-Wait + addEventListener Coverage
<!-- execution: sequential -->

- [ ] Task 1: Patch XHR to block readyState 4 delivery until translated
  Rewrite `handleResponse` in `inject/xhrInterceptor.ts`. After intercepting the response, do NOT call `originalOnReadyStateChange`/`originalOnLoad` immediately. Wait for `SUBTITLE_TRANSLATED` message, mutate `responseText` via `Object.defineProperty`, then call original handlers. Add a 5000ms self-cleaning timeout that removes the `translatedHandler` listener from `window` and calls original handlers with untranslated content on expiry.

- [ ] Task 2: Patch XMLHttpRequest.prototype.addEventListener for load/readystatechange
  In `inject/xhrInterceptor.ts`, also patch `addEventListener` on each intercepted XHR instance. Capture `load` and `readystatechange` handlers registered via `addEventListener` (used by Shaka Player, Video.js). Store them alongside `onreadystatechange`/`onload`. Trigger all stored handlers in the same controlled sequence after translation.

- [ ] Task 3: Write unit tests for XHR block-and-wait behavior
  Add/update tests in `tests/unit/xhrInterceptor.test.ts`:
  (a) original handlers are NOT called before `SUBTITLE_TRANSLATED` arrives,
  (b) handlers ARE called after `SUBTITLE_TRANSLATED` message with translated text,
  (c) handlers are called with original content after 5s timeout,
  (d) `window` listener is removed on timeout (verify no lingering).

- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Coordinator Timeout — Clear on Success
<!-- execution: sequential -->

- [ ] Task 1: Add clearPendingRequest to coordinator
  In `content/subtitleCoordinator.ts`, expose function `clearPendingRequest(requestId: string)` that calls `clearTimeout` for the stored timeout and removes it from `state.pendingRequests`.

- [ ] Task 2: Wire SUBTITLE_TRANSLATED success path into coordinator
  In `content/subtitleCoordinator.ts`, listen for `SUBTITLE_TRANSLATED` bridge messages (via `onMessage`). On receipt with a recognized `requestId`, call `clearPendingRequest(requestId)` to cancel the pending overlay-activation fallback.

- [ ] Task 3: Write unit tests for coordinator timeout-clearing
  Add/update tests in `tests/unit/subtitleCoordinator.test.ts`:
  (a) overlay does NOT activate when translation succeeds before timeout,
  (b) overlay DOES activate when no translation arrives within 5s (timeout path),
  (c) `clearPendingRequest` removes the timeout without throwing.

- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Security & Safety Hardening
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Add origin validation to postMessage bridge
  <!-- files: inject/messageBridge.ts, tests/unit/messageBridge.test.ts -->
  In `inject/messageBridge.ts` `onMessage()` listener, add guard: `if (event.origin !== window.location.origin) return;`. Add unit tests verifying: foreign-origin messages are silently ignored, same-origin messages are processed normally.

- [ ] Task 2: Add HTTP error guard to fetch interceptor
  <!-- files: inject/fetchInterceptor.ts, tests/unit/fetchInterceptor.test.ts -->
  In `inject/fetchInterceptor.ts`, after `const response = await originalFetch(input, init)`, add: `if (!response.ok) return response;` — return early before cloning or translating. Add unit tests for 404, 500, and network error response cases.

- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

## Phase 4: Overlay Video Targeting + YouTube Parser Fix
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Precise video targeting in subtitleOverlay
  <!-- files: content/subtitleOverlay.ts, content/subtitleCoordinator.ts, tests/unit/subtitleOverlay.test.ts -->
  Update `initializeOverlay(cues, config?, videoNode?)` to accept an optional third parameter `videoNode: HTMLVideoElement`. Use it directly if provided, otherwise fall back to `querySelectorAll('video')[0]`. Update coordinator's `activateOverlayMode` to extract and pass the video element from intercept context when available.

- [ ] Task 2: Fix YouTube JSON3 segment join
  <!-- files: inject/subtitleHandlers/youtube.ts, tests/unit/youtubeHandler.test.ts -->
  In `parseJson3`, change segment text joining: filter out falsy `utf8` values, join non-empty segments with `' '` (space), then collapse multiple consecutive spaces with `.replace(/\s+/g, ' ')`. Treat `'\n'` utf8 as a word separator (space) not a concatenation character. Add unit tests with multi-segment cues, newline boundaries, and empty segment handling.

- [ ] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)

## Phase 5: Full Regression + Integration
<!-- execution: sequential -->
<!-- depends: phase3, phase4 -->

- [ ] Task 1: Run full test suite
  Run `pnpm test` and verify all 408 existing tests pass plus all newly added tests from Phases 1–4.

- [ ] Task 2: Run lint
  Run `pnpm lint` and confirm zero errors.

- [ ] Task 3: Manual smoke test
  Load unpacked extension in Chrome, navigate to Udemy or YouTube, trigger subtitle translation (Alt+S or context menu). Verify: no double-overlay, no spurious fallback activation, correct bilingual subtitle display in video player.

- [ ] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)
