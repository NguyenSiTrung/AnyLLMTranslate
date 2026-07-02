# Max Subtitle Redesign — Phase 0 Probe Results

**Date:** 2026-07-02
**Status:** Partial — Probe 3 confirmed live; Probes 1 & 2 pending.

## Probe 1 — Segment timing
- First cue startTime observed: **PENDING** (needs live `.vtt` body inspection)
- X-TIMESTAMP-MAP present: PENDING
- **Decision:** PENDING
- **Impact:** Determines whether Task 4 (offset fix) is the real desync fix (RELATIVE) or a no-op (ABSOLUTE).

## Probe 2 — In-flight observability
- Observed on initial load: PENDING
- Observed on seek: PENDING
- Observed on track switch: PENDING
- **Decision:** PENDING
- **Impact:** Determines whether Tasks 9–10 (in-flight interception + PerformanceObserver retirement) build.

## Probe 3 — Native textTracks  ✅ CONFIRMED

- **textTracks output:** Max's player populates native `<video>.textTracks` with
  cues. Observed in live console log:
  ```
  inject.js:15 AnyLLMTranslate: TextTrack full cues emitted   (×2)
  inject.js:15 AnyLLMTranslate: TextTrack discovery found tracks
  ```
- **Decision:** YES — Max populates native tracks.
- **Impact:** Native TextTrack rendering (Tasks 6–8 runtime half) is
  **substantially harder** than the original design assumed. It is not
  "create synthetic tracks" — synthetic tracks stack on top of Max's own and
  produce duplicate original-language lines (regression `ccccc74` reverted this).

  `createRenderer` is currently hard-wired to `OverlayRenderer`. The overlay
  path remains correct because `hideNativeCaptions` (DOM `<style>`) controls
  Max's *DOM* caption window; it cannot hide native-track rendering, so until
  the coordinator can detect + suppress the player's own native tracks, the
  overlay is the only viable renderer for Max.

  The `NativeTrackRenderer` code + tests are retained for a possible future
  fix but are not in the live path.
