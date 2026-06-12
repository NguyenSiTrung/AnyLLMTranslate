# Implementation Plan: Subtitle Handling Reliability and Hardening

## Phase 1: Test Harness and Session Identity Foundation

- [ ] Task 1: Add regression tests for stale progressive subtitle sessions
  - [ ] Simulate two `translateSubtitle` requests in one tab.
  - [ ] Assert old session chunks cannot update the newer overlay.
  - [ ] Assert old async loop cannot delete the newer active session.

- [ ] Task 2: Add subtitle session identity to background messages
  - [ ] Generate a per-tab `sessionId` when starting subtitle translation.
  - [ ] Stop or invalidate any existing session before replacing it.
  - [ ] Send `sessionId` with `SUBTITLE_CHUNK_TRANSLATED`.

- [ ] Task 3: Add content-side stale chunk rejection
  - [ ] Track the active subtitle session in `subtitleCoordinator`.
  - [ ] Ignore `SUBTITLE_CHUNK_TRANSLATED` messages with stale or missing session identity when a newer session exists.

- [ ] Task 4: Run Phase 1 validators
  - [ ] Run focused background subtitle session tests.
  - [ ] Run focused subtitle coordinator tests.

## Phase 2: Interception Fallback Safety

- [ ] Task 1: Add tests for immediate interceptor unblocking
  - [ ] No handler returns original body.
  - [ ] Zero parsed cues returns original body.
  - [ ] Overlay initialization failure returns original body.

- [ ] Task 2: Make interception handler always respond
  - [ ] Ensure every early-return path calls `sendTranslatedSubtitle`.
  - [ ] Preserve disabled-subtitle behavior.
  - [ ] Preserve not-watch-page pass-through behavior.

- [ ] Task 3: Make overlay initialization report success
  - [ ] Change overlay initialization contract to return success/failure.
  - [ ] Only blank native subtitles after confirmed overlay attachment.
  - [ ] Keep overlay cleanup idempotent.

- [ ] Task 4: Run Phase 2 validators
  - [ ] Run focused fetch/XHR interceptor tests.
  - [ ] Run focused subtitle coordinator and overlay tests.

## Phase 3: Navigation, BFCache, and Coordinator Lifecycle

- [ ] Task 1: Add tests for BFCache and lifecycle behavior
  - [ ] Verify MAIN-world interceptors re-enable on BFCache restore.
  - [ ] Verify page restore does not permanently disable subtitle coordinator.
  - [ ] Verify full document navigation cancels active subtitle sessions.

- [ ] Task 2: Fix BFCache interceptor lifecycle
  - [ ] Handle `pageshow` after `pagehide`.
  - [ ] Re-enable interceptors when a BFCache-restored page remains alive.
  - [ ] Avoid double patching.

- [ ] Task 3: Decouple page translation restore from subtitle coordinator teardown
  - [ ] Keep coordinator active across `stopTranslation()`.
  - [ ] Still cancel active background subtitle sessions on restore.

- [ ] Task 4: Add full-navigation subtitle cancellation
  - [ ] Send best-effort `CANCEL_SUBTITLE_SESSION` during page unload/navigation.
  - [ ] Keep cleanup safe when runtime messaging is unavailable.

- [ ] Task 5: Run Phase 3 validators
  - [ ] Run focused content entrypoint and interceptor lifecycle tests.

## Phase 4: Fetch Security and Manual Entry Points

- [ ] Task 1: Add URL allow-list hardening tests
  - [ ] Reject localhost/private IP URLs containing allowed domains in query/path.
  - [ ] Reject non-HTTP(S) protocols.
  - [ ] Accept valid known subtitle/CDN hostnames.

- [ ] Task 2: Harden background subtitle URL validation
  - [ ] Parse URL and validate protocol.
  - [ ] Match exact hostnames or safe subdomain suffixes.
  - [ ] Block private, loopback, and link-local hosts.

- [ ] Task 3: Add tests for manual subtitle command
  - [ ] `startSubtitleTranslation` selects a preferred discovered track when available.
  - [ ] It fails gracefully when no track URL exists.

- [ ] Task 4: Wire `startSubtitleTranslation` content handling
  - [ ] Route context menu/keyboard subtitle action to coordinator.
  - [ ] Reuse preferred-language and discovered-track state.

- [ ] Task 5: Run Phase 4 validators
  - [ ] Run focused background URL validation tests.
  - [ ] Run focused content message tests.

## Phase 5: Watcher Cleanup, Discovery, and Multi-Video Improvements

- [ ] Task 1: Add playback watcher cleanup tests
  - [ ] Verify cleanup removes previously attached `play`/`pause` listeners.
  - [ ] Verify play events after cleanup do not trigger auto-activation.

- [ ] Task 2: Fix playback watcher listener cleanup
  - [ ] Store listener references per watched video.
  - [ ] Remove listeners when coordinator cleanup runs.

- [ ] Task 3: Add HTML5 TextTrack discovery tests
  - [ ] Pre-existing unloaded multi-video page discovers tracks after `loadedmetadata`.
  - [ ] Dynamic added videos still work.

- [ ] Task 4: Improve TextTrack discovery rescan behavior
  - [ ] Attach `loadedmetadata` listeners to candidate videos.
  - [ ] Rescan primary video when metadata becomes available.
  - [ ] Keep discovery cleanup complete.

- [ ] Task 5: Improve primary video selection where needed
  - [ ] Reuse or align overlay video selection with primary-video heuristics.
  - [ ] Avoid selecting thumbnail or non-primary videos when possible.

- [ ] Task 6: Clean up subtitle timeout state
  - [ ] Decide whether to wire `translationTimeout` into interceptors or remove obsolete coordinator fields.
  - [ ] Update tests accordingly.

- [ ] Task 7: Run Phase 5 validators
  - [ ] Run focused subtitle discovery, coordinator, and overlay tests.

## Phase 6: Final Verification and Track Completion

- [ ] Task 1: Run full validators
  - [ ] Run `pnpm test`.
  - [ ] Run `pnpm lint`.
  - [ ] Run `pnpm compile`.

- [ ] Task 2: Fix any validator failures
  - [ ] Investigate failures using systematic debugging.
  - [ ] Add or update regression coverage as needed.

- [ ] Task 3: Update track learnings
  - [ ] Capture reusable subtitle lifecycle, session identity, and interceptor patterns.

- [ ] Task 4: Commit completed track work
  - [ ] Review `git diff` and `git status`.
  - [ ] Commit with a conventional commit message.
