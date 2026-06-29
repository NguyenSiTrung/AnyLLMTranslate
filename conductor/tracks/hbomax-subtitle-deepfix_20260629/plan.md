# Implementation Plan: HBO Max Subtitle Deep Analysis Fixes

## Phase 1: VTT Segment Capture Functional Fixes (High Priority)
<!-- execution: sequential -->

- [ ] Task 1: Write failing test — VTT capture emits after track switch reset
  - Add test in `inject/__tests__/maxVttSegmentCapture.test.ts` that registers a representation, captures segments (sets `emittedRepresentation`), then calls a new `resetMaxVttSegmentCaptureLock()` and captures segments from a DIFFERENT representation — assert the second representation's cues are emitted.
  <!-- files: inject/__tests__/maxVttSegmentCapture.test.ts -->

- [ ] Task 2: Implement `resetMaxVttSegmentCaptureLock()` and wire track-switch reset
  - Export a new `resetMaxVttSegmentCaptureLock()` that clears `emittedRepresentation` and `cueBuffers` (but NOT `representationLanguages` or `preferredLanguage`).
  - Call it from `resetMaxMpdProcessorState()` path or add a dedicated track-switch hook in the inject entrypoint's `SUBTITLE_DOM_TRACK_CHANGED` listener.
  <!-- files: inject/maxVttSegmentCapture.ts, inject/maxMpdProcessor.ts -->

- [ ] Task 3: Write failing test — zh-Hans does not match zh-Hant in VTT capture
  - Add test that registers a `zh-Hant` representation, sets preferred to `zh-Hans`, and asserts the segment is NOT emitted (currently it would be, due to primary-subtag-only matching).
  <!-- files: inject/__tests__/maxVttSegmentCapture.test.ts -->

- [ ] Task 4: Replace local `languagesMatch` with shared `subtitleLanguagesMatch`
  - Import `subtitleLanguagesMatch` from `@/lib/subtitleLanguageMatch` in `maxVttSegmentCapture.ts`.
  - Remove the local `languagesMatch` function.
  <!-- files: inject/maxVttSegmentCapture.ts -->

- [ ] Task 5: Conductor - User Manual Verification 'VTT Segment Capture Functional Fixes'
  - Run `npx vitest run inject/__tests__/maxVttSegmentCapture.test.ts` and confirm all tests pass.

## Phase 2: Robustness Fixes (Medium Priority)
<!-- execution: sequential -->

- [ ] Task 6: Write failing test — processedMpdBodies is bounded
  - Add test that processes multiple large MPD bodies and asserts the internal dedup set size stays bounded (not equal to the number of full bodies stored).
  <!-- files: inject/__tests__/maxMpdProcessor.test.ts -->

- [ ] Task 7: Replace processedMpdBodies with FNV-1a hash dedup
  - Add a simple FNV-1a hash function (or reuse existing `lib/subtitleCacheKey.ts` FNV-1a if exported).
  - Store hashes in `processedMpdBodies` instead of full body strings.
  - Update the duplicate-skip path to hash the incoming body before comparison.
  <!-- files: inject/maxMpdProcessor.ts -->

- [ ] Task 8: Write failing test — nested MPD fetch respects overall deadline
  - Add test that simulates slow segment fetches (delayed responses) and asserts the nested chain aborts after the deadline, returning partial or empty results instead of hanging.
  <!-- files: lib/__tests__/maxMpdSubtitles.test.ts -->

- [ ] Task 9: Add overall deadline to nested MPD fetch chain
  - Thread a `deadlineMs` parameter through `fetchAndParseSubtitleInternal`, `fetchAndParseNestedMpdSubtitle`, and `fetchSegmentBodiesProgressively`.
  - Check `Date.now() > deadline` before each fetch; break/throw if exceeded.
  - Default deadline: 30s from the initial call.
  <!-- files: lib/maxMpdSubtitles.ts -->

- [ ] Task 10: Write failing test — readMaxActiveSubtitleLanguage handles localized labels
  - Add test with a button carrying `aria-label="Inglés"` and a `lang="en"` attribute; assert the function returns `'en'`.
  - Add test with an unknown label like `"Filipino"` and assert it falls back to ISO 639-1 `"fil"` via a reverse lookup.
  <!-- files: lib/__tests__/maxSubtitleLanguages.test.ts -->

- [ ] Task 11: Improve readMaxActiveSubtitleLanguage with attribute fallback and ISO 639-2→1
  - Check for `lang` or `data-language` attribute on the button first.
  - Add a reverse ISO 639-2→1 lookup for unknown labels (reuse the map from `subtitleLanguageMatch.ts`).
  - Add common localized label variants for top languages.
  <!-- files: lib/maxSubtitleLanguages.ts -->

- [ ] Task 12: Conductor - User Manual Verification 'Robustness Fixes'
  - Run `npx vitest run inject/__tests__/maxMpdProcessor.test.ts lib/__tests__/maxMpdSubtitles.test.ts lib/__tests__/maxSubtitleLanguages.test.ts` and confirm all pass.

## Phase 3: Code Consolidation & Dead Code Removal (Low Priority)
<!-- execution: sequential -->

- [ ] Task 13: Consolidate manifest detection into single exported function
  - Export `isDashManifestContent()` (already exists in `maxMpdSubtitles.ts`) as the single source of truth.
  - Update `services/background.ts` to import and use it instead of the private `isDashManifestResponse`.
  - Remove `isDashManifestResponse` and `isMpdManifestBody` (internal helper, fold into `isManifestResponse`).
  <!-- files: lib/maxMpdSubtitles.ts, services/background.ts -->

- [ ] Task 14: Remove dead code — fetchRealSubtitleContent and processMpdSubtitleTracks
  - Remove both functions from `lib/maxMpdSubtitles.ts`.
  - Remove their tests from `lib/__tests__/maxMpdSubtitles.test.ts`.
  - Remove any imports that become unused.
  <!-- files: lib/maxMpdSubtitles.ts, lib/__tests__/maxMpdSubtitles.test.ts -->

- [ ] Task 15: Deduplicate Max CDN VTT URL checker
  - Remove `isMaxCdnVttSegmentFetchUrl` from `services/background.ts`.
  - Import `isMaxCdnVttSegmentUrl` from `lib/maxMpdSubtitles.ts` and use it in `handleFetchSubtitle`.
  <!-- files: services/background.ts -->

- [ ] Task 16: Conductor - User Manual Verification 'Code Consolidation & Dead Code Removal'
  - Run `npx vitest run lib/__tests__/maxMpdSubtitles.test.ts services/__tests__/background.urlAllowlist.test.ts` and confirm all pass.

## Phase 4: Low-Priority Code Quality Fixes
<!-- execution: parallel -->

- [ ] Task 17: Remove dead `isPriority` parameter from fetchAndEmitSubtitleTrack
  - Remove `isPriority` param and simplify the error log level to always use `warn` for 404/MPD errors and `log` for others.
  - Update the single call site.
  <!-- files: inject/maxMpdProcessor.ts -->

- [ ] Task 18: Fix redundant ternary in concatVttSegments
  - Simplify `needsOffset ? allCues[...] : allCues[...]` to `allCues[allCues.length - 1]`.
  <!-- files: lib/vttSegmentConcat.ts -->

- [ ] Task 19: Fix redundant WEBVTT check in captureMaxVttSegment
  - Change the guard to `if (!body || !body.trimStart().startsWith('WEBVTT')) return;`.
  <!-- files: inject/maxVttSegmentCapture.ts -->

- [ ] Task 20: Preserve bodies on nested MPD dead-end in progressive fetch
  - In `fetchSegmentBodiesProgressively`, if nested MPD yields 0 cues, return accumulated `bodies` instead of breaking with empty array.
  <!-- files: lib/maxMpdSubtitles.ts -->

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
