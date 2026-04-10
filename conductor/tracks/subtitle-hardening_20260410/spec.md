# Track: Video Subtitle Interception — Hardening & Bug Fixes

## Overview

The current subtitle interception pipeline (XHR + Fetch monkey-patching + postMessage bridge) has several critical architectural flaws identified via deep analysis: race conditions that break video player state machines, a permanent fallback overlay being triggered unconditionally, memory leaks from lingering event listeners, missing XHR `addEventListener` coverage, insecure postMessage validation, and overlay video targeting that fails on multi-video pages.

## Functional Requirements

### 1. XHR Interceptor — Block-and-Wait Response Delivery
- The XHR interceptor MUST block delivery of `readyState === 4` to the video player until translation is complete (or times out).
- After translation, manually trigger the response events in the correct order.
- Patch `XMLHttpRequest.prototype.addEventListener` in addition to `.onreadystatechange` to capture modern event listener registrations (used by Video.js, Shaka Player, etc.).

### 2. Coordinator Timeout Bug Fix
- `subtitleCoordinator.ts` MUST clear the 5-second `activateOverlayMode` timeout when translation completes successfully.
- This prevents the fallback overlay from unconditionally activating even when native subtitle injection succeeded.

### 3. XHR Memory Leak — Listener Cleanup on Timeout
- A 5000ms timeout MUST be added inside `xhrInterceptor.ts`'s `handleResponse` to remove the `window` event listener if no `SUBTITLE_TRANSLATED` response arrives.
- Prevents heap memory growth on long-running binge sessions.

### 4. Fetch Interceptor — HTTP Error Guard
- `fetchInterceptor.ts` MUST check `response.ok` (4xx/5xx) BEFORE calling `responseClone.text()`.
- Do not attempt to parse or translate error responses.

### 5. PostMessage Bridge — Origin Validation
- `messageBridge.ts` MUST validate `event.origin === window.location.origin` inside `onMessage()`.
- Prevents malicious scripts from injecting fake `SUBTITLE_TRANSLATED` messages.

### 6. Overlay — Precise Video Targeting
- `subtitleOverlay.ts` MUST accept an optional `videoNode: HTMLVideoElement` parameter to `initializeOverlay()`.
- Falls back to `querySelectorAll('video')[0]` only when no target is provided.
- Callers (coordinator) should pass the specific video element from the intercepted request context when available.

### 7. YouTube JSON3 — Segment Join Fix
- The YouTube JSON3 parser's `segs.map(s => s.utf8).join('')` approach collapses newline segment boundaries into run-on sentences.
- Must preserve inter-segment spacing (join with `' '` not `''`, or handle `\n` segs as word boundaries).

## Non-Functional Requirements
- All fixes must include Vitest unit tests (AAA pattern, no `any` leaks).
- No new external dependencies.
- The XHR Proxy approach must remain backward compatible with existing test mocks.
- No lint errors introduced.

## Acceptance Criteria
- [ ] XHR interceptor blocks original event delivery until translation completes or times out.
- [ ] `addEventListener`-based event listeners are also intercepted (not just `.onreadystatechange`).
- [ ] Coordinator timeout is cleared on successful subtitle translation — overlay does NOT activate spuriously.
- [ ] XHR `translatedHandler` is removed from `window` on timeout (verified via listener count).
- [ ] Fetch interceptor returns the original response unmodified for non-200 status codes.
- [ ] `onMessage` rejects messages from foreign origins.
- [ ] `initializeOverlay` accepts and uses a passed `videoNode` parameter.
- [ ] YouTube JSON3 parser produces clean joined text (no dropped spaces at word boundaries).
- [ ] All existing 408 tests continue to pass.
- [ ] `pnpm lint` reports zero errors.

## Out of Scope
- Netflix handler support (not in current platform list).
- Changing the postMessage bridge to a `chrome.runtime` message channel.
- UI changes to the subtitle controls panel.
