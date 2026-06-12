# Implementation Plan: Subtitle Handling Reliability and Hardening

## Phase 1: Test Harness and Session Identity Foundation

- [x] Task 1: Add regression tests for stale progressive subtitle sessions
  - [x] Simulate two `translateSubtitle` requests in one tab.
  - [x] Assert old session chunks cannot update the newer overlay.
  - [x] Assert old async loop cannot delete the newer active session.

- [x] Task 2: Add subtitle session identity to background messages
  - [x] Generate a per-tab `sessionId` when starting subtitle translation.
  - [x] Stop or invalidate any existing session before replacing it.
  - [x] Send `sessionId` with `SUBTITLE_CHUNK_TRANSLATED`.

- [x] Task 3: Add content-side stale chunk rejection
  - [x] Track the active subtitle session in `subtitleCoordinator`.
  - [x] Ignore `SUBTITLE_CHUNK_TRANSLATED` messages with stale or missing session identity when a newer session exists.

- [x] Task 4: Run Phase 1 validators
  - [x] Run focused background subtitle session tests.
  - [x] Run focused subtitle coordinator tests.

## Phase 2: Interception Fallback Safety

- [x] Task 1: Add tests for immediate interceptor unblocking
  - [x] No handler returns original body.
  - [x] Zero parsed cues returns original body.
  - [x] Overlay initialization failure returns original body.

- [x] Task 2: Make interception handler always respond
  - [x] Ensure every early-return path calls `sendTranslatedSubtitle`.
  - [x] Preserve disabled-subtitle behavior.
  - [x] Preserve not-watch-page pass-through behavior.

- [x] Task 3: Make overlay initialization report success
  - [x] Change overlay initialization contract to return success/failure.
  - [x] Only blank native subtitles after confirmed overlay attachment.
  - [x] Keep overlay cleanup idempotent.

- [x] Task 4: Run Phase 2 validators
  - [x] Run focused fetch/XHR interceptor tests.
  - [x] Run focused subtitle coordinator and overlay tests.

## Phase 3: Navigation, BFCache, and Coordinator Lifecycle

- [x] Task 1: Add tests for BFCache and lifecycle behavior
  - [x] Verify MAIN-world interceptors re-enable on BFCache restore.
  - [x] Verify page restore does not permanently disable subtitle coordinator.
  - [x] Verify full document navigation cancels active subtitle sessions.

- [x] Task 2: Fix BFCache interceptor lifecycle
  - [x] Handle `pageshow` after `pagehide`.
  - [x] Re-enable interceptors when a BFCache-restored page remains alive.
  - [x] Avoid double patching.

- [x] Task 3: Decouple page translation restore from subtitle coordinator teardown
  - [x] Keep coordinator active across `stopTranslation()`.
  - [x] Still cancel active background subtitle sessions on restore.

- [x] Task 4: Add full-navigation subtitle cancellation
  - [x] Send best-effort `CANCEL_SUBTITLE_SESSION` during page unload/navigation.
  - [x] Keep cleanup safe when runtime messaging is unavailable.

- [x] Task 5: Run Phase 3 validators
  - [x] Run focused content entrypoint and interceptor lifecycle tests.

## Phase 4: Fetch Security and Manual Entry Points

- [x] Task 1: Add URL allow-list hardening tests
  - [x] Reject localhost/private IP URLs containing allowed domains in query/path.
  - [x] Reject non-HTTP(S) protocols.
  - [x] Accept valid known subtitle/CDN hostnames.

- [x] Task 2: Harden background subtitle URL validation
  - [x] Parse URL and validate protocol.
  - [x] Match exact hostnames or safe subdomain suffixes.
  - [x] Block private, loopback, and link-local hosts.

- [x] Task 3: Add tests for manual subtitle command
  - [x] `startSubtitleTranslation` selects a preferred discovered track when available.
  - [x] It fails gracefully when no track URL exists.

- [x] Task 4: Wire `startSubtitleTranslation` content handling
  - [x] Route context menu/keyboard subtitle action to coordinator.
  - [x] Reuse preferred-language and discovered-track state.

- [x] Task 5: Run Phase 4 validators
  - [x] Run focused background URL validation tests.
  - [x] Run focused content message tests.

## Phase 5: Watcher Cleanup, Discovery, and Multi-Video Improvements

- [x] Task 1: Add playback watcher cleanup tests
  - [x] Verify cleanup removes previously attached `play`/`pause` listeners.
  - [x] Verify play events after cleanup do not trigger auto-activation.

- [x] Task 2: Fix playback watcher listener cleanup
  - [x] Store listener references per watched video.
  - [x] Remove listeners when coordinator cleanup runs.

- [x] Task 3: Add HTML5 TextTrack discovery tests
  - [x] Pre-existing unloaded multi-video page discovers tracks after `loadedmetadata`.
  - [x] Dynamic added videos still work.

- [x] Task 4: Improve TextTrack discovery rescan behavior
  - [x] Attach `loadedmetadata` listeners to candidate videos.
  - [x] Rescan primary video when metadata becomes available.
  - [x] Keep discovery cleanup complete.

- [x] Task 5: Improve primary video selection where needed
  - [x] Reuse or align overlay video selection with primary-video heuristics.
  - [x] Avoid selecting thumbnail or non-primary videos when possible.

- [x] Task 6: Clean up subtitle timeout state
  - [x] Decide whether to wire `translationTimeout` into interceptors or remove obsolete coordinator fields.
  - [x] Update tests accordingly.

- [x] Task 7: Run Phase 5 validators
  - [x] Run focused subtitle discovery, coordinator, and overlay tests.

## Phase 6: Final Verification and Track Completion

- [x] Task 1: Run full validators
  - [x] Run `pnpm test`.
  - [x] Run `pnpm lint`.
  - [x] Run `pnpm compile`.

- [x] Task 2: Fix any validator failures
  - [x] Investigate failures using systematic debugging.
  - [x] Add or update regression coverage as needed.

- [x] Task 3: Update track learnings
  - [x] Capture reusable subtitle lifecycle, session identity, and interceptor patterns.

- [x] Task 4: Commit completed track work
  - [x] Review `git diff` and `git status`.
  - [x] Commit with a conventional commit message.
