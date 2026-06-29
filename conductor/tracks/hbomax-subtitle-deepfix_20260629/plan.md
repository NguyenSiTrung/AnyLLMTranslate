# Implementation Plan: HBO Max Subtitle Deep Analysis Fixes

## Phase 1: VTT Segment Capture Functional Fixes (High Priority)
<!-- execution: sequential -->

- [x] Task 1: Write failing test — VTT capture emits after track switch reset
  - Add test in `inject/__tests__/maxVttSegmentCapture.test.ts` that registers a representation, captures segments (sets `emittedRepresentation`), then calls a new `resetMaxVttSegmentCaptureLock()` and captures segments from a DIFFERENT representation — assert the second representation's cues are emitted.
  <!-- files: inject/__tests__/maxVttSegmentCapture.test.ts -->

- [x] Task 2: Implement `resetMaxVttSegmentCaptureLock()` and wire track-switch reset
  - Export a new `resetMaxVttSegmentCaptureLock()` that clears `emittedRepresentation` and `cueBuffers` (but NOT `representationLanguages` or `preferredLanguage`).
  - Call it from `resetMaxMpdProcessorState()` path or add a dedicated track-switch hook in the inject entrypoint's `SUBTITLE_DOM_TRACK_CHANGED` listener.
  <!-- files: inject/maxVttSegmentCapture.ts, inject/maxMpdProcessor.ts -->

- [x] Task 3: Write failing test — zh-Hans does not match zh-Hant in VTT capture
  - Add test that registers a `zh-Hant` representation, sets preferred to `zh-Hans`, and asserts the segment is NOT emitted (currently it would be, due to primary-subtag-only matching).
  <!-- files: inject/__tests__/maxVttSegmentCapture.test.ts -->

- [x] Task 4: Replace local `languagesMatch` with shared `subtitleLanguagesMatch`
  - Import `subtitleLanguagesMatch` from `@/lib/subtitleLanguageMatch` in `maxVttSegmentCapture.ts`.
  - Remove the local `languagesMatch` function.
  <!-- files: inject/maxVttSegmentCapture.ts -->

- [x] Task 5: Conductor - User Manual Verification 'VTT Segment Capture Functional Fixes'
  - Run `npx vitest run inject/__tests__/maxVttSegmentCapture.test.ts` and confirm all tests pass.

## Phase 2: Robustness Fixes (Medium Priority)
<!-- execution: sequential -->

- [x] Task 6: Write failing test — processedMpdBodies is bounded
- [x] Task 7: Replace processedMpdBodies with FNV-1a hash dedup
- [x] Task 8: Write failing test — nested MPD fetch respects overall deadline
- [x] Task 9: Add overall deadline to nested MPD fetch chain
- [x] Task 10: Write failing test — readMaxActiveSubtitleLanguage handles localized labels
- [x] Task 11: Improve readMaxActiveSubtitleLanguage with attribute fallback and ISO 639-2→1
- [x] Task 12: Conductor - User Manual Verification 'Robustness Fixes'

## Phase 3: Code Consolidation & Dead Code Removal (Low Priority)
<!-- execution: sequential -->

- [x] Task 13: Consolidate manifest detection into single exported function
- [x] Task 14: Remove dead code — fetchRealSubtitleContent and processMpdSubtitleTracks
- [x] Task 15: Deduplicate Max CDN VTT URL checker
- [x] Task 16: Conductor - User Manual Verification 'Code Consolidation & Dead Code Removal'

## Phase 4: Low-Priority Code Quality Fixes
<!-- execution: parallel -->

- [x] Task 17: Remove dead `isPriority` parameter from fetchAndEmitSubtitleTrack
- [x] Task 18: Fix redundant ternary in concatVttSegments
- [x] Task 19: Fix redundant WEBVTT check in captureMaxVttSegment
- [x] Task 20: Preserve bodies on nested MPD dead-end in progressive fetch

- [ ] Task 21: Conductor - User Manual Verification 'Low-Priority Code Quality Fixes'
  - Run full test suite and lint to confirm no regressions.

## Phase 5: Test Coverage
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 22: Add VTT segment capture append flow tests
  - Test: same representation emits `append: true` on second segment.
  - Test: different representation after lock is silently dropped (before fix) / emitted (after fix).
  - Test: `mergeCues` deduplicates by `startTime`.
  <!-- files: inject/__tests__/maxVttSegmentCapture.test.ts -->

- [ ] Task 23: Conductor - User Manual Verification 'Test Coverage'
  - Run `npx vitest run inject/__tests__/maxVttSegmentCapture.test.ts` and confirm all pass.

## Phase 6: Full Regression & Cleanup
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4, phase5 -->

- [ ] Task 24: Run full test suite, lint, and build
  - `npx vitest run` (all 1723+ tests must pass)
  - `npx eslint .` (no new lint errors)
  - `npx wxt build` (build must succeed)
  <!-- files: (none — verification only) -->

- [ ] Task 25: Conductor - User Manual Verification 'Full Regression & Cleanup'
  - Confirm all tests, lint, and build pass. Capture learnings.
