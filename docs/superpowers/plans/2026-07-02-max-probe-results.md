# Max Subtitle Redesign — Phase 0 Probe Results

**Date:** 2026-07-02
**Status:** Partial — Probe 3 confirmed live; Probes 1 & 2 pending.

## Probe 1 — Segment timing  ✅ CONFIRMED

- **First cue startTime observed:** `00:00:04.560` ("Earth, a breathtaking planet"
  — the show's actual opening narration). A single file spans 4.5s → 9min 24s of
  real content, progressing naturally.
- **X-TIMESTAMP-MAP present:** Yes — `X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0`.
  The MPEGTS offset is literally `0` → `0/90000 - 0 = 0` seconds of offset.
- **Decision:** ABSOLUTE. Max serves large, absolute-timed files. NOT
  segment-relative.
- **Impact:** Task 4 (offset fix) is a **no-op** for Max — there is no offset to
  thread. The offset infrastructure (Tasks 2–3) is kept dormant: harmless
  (applies offset 0), tested, and reusable if another platform ever serves true
  segment-relative VTT.

  **Critically:** this disproves the offset hypothesis that motivated the whole
  redesign. The original desync/dropped-cue symptoms were already resolved by
  earlier pre-session commits (`ff3bc39`, `0818da2`, `998239e` — seek handling +
  PerformanceObserver capture), NOT by offset work. This session's only
  behavioral fix was `ccccc74`, reverting a duplicate-cue regression this
  session introduced.

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
