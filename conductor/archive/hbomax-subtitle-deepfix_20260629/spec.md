# HBO Max Subtitle Deep Analysis Fixes

## Overview

Fix all 14 issues identified in the June 2026 deep analysis of the HBO Max subtitle feature. The issues span functional bugs (VTT capture lock on track switch, loose Chinese variant matching), memory leaks (unbounded MPD body dedup set), missing robustness (no nested MPD timeout, no localized label handling), dead code (fetchRealSubtitleContent, processMpdSubtitleTracks), code duplication (3 separate manifest detection implementations, 2 duplicate Max CDN VTT URL checkers), and test gaps (VTT segment append flow, multi-representation scenarios).

## Functional Requirements

### FR-1: VTT Segment Capture Track Switch (High)
- Reset `emittedRepresentation` when a mid-session track switch is detected so the passive VTT capture can emit the new track's segments.
- Coordinate with the existing `SUBTITLE_DOM_TRACK_CHANGED` flow or add a dedicated reset hook.

### FR-2: VTT Segment Capture Language Matching (High)
- Replace the local `languagesMatch()` in `maxVttSegmentCapture.ts` with the shared `subtitleLanguagesMatch()` from `lib/subtitleLanguageMatch.ts` so `zh-Hans` does not match `zh-Hant`.

### FR-3: Bounded MPD Body Dedup (Medium)
- Replace `processedMpdBodies` (Set of full body strings) with a hash-based dedup (FNV-1a or similar) or an LRU-capped set to prevent unbounded memory growth during long viewing sessions.

### FR-4: Nested MPD Fetch Deadline (Medium)
- Add an overall deadline timestamp to the nested MPD fetch chain (`fetchAndParseNestedMpdSubtitle` and `fetchSegmentBodiesProgressively`) so the total wait is bounded (e.g., 30s) before falling back to DOM cues.

### FR-5: Localized / New Language Label Handling (Medium)
- Improve `readMaxActiveSubtitleLanguage()` and `MAX_LABEL_TO_LANGUAGE` to handle non-English UI labels and unknown languages by checking for `data-language`/`lang` attributes on track buttons and falling back to ISO 639-2→639-1 conversion.

### FR-6: Consolidate Manifest Detection (Low)
- Consolidate the 3 separate manifest detection implementations (`isManifestResponse`, `isDashManifestResponse`, `isMpdManifestBody`) into a single exported function in `lib/maxMpdSubtitles.ts` and import it where needed.

### FR-7: Remove Dead Code (Low)
- Remove `fetchRealSubtitleContent()`, `processMpdSubtitleTracks()`, and their tests from `lib/maxMpdSubtitles.ts` and `lib/__tests__/maxMpdSubtitles.test.ts`. These are never called by production code.

### FR-8: Deduplicate Max CDN VTT URL Checker (Low)
- Export `isMaxCdnVttSegmentUrl` from `lib/maxMpdSubtitles.ts` and reuse it in `services/background.ts` instead of the private `isMaxCdnVttSegmentFetchUrl` copy.

### FR-9: Remove Dead `isPriority` Parameter (Low)
- Remove the `isPriority` parameter from `fetchAndEmitSubtitleTrack()` (always `true`) and simplify the error handling log level logic.

### FR-10: Fix Redundant Ternary in concatVttSegments (Low)
- Simplify the `needsOffset ? allCues[...] : allCues[...]` ternary (both branches identical) to a single expression.

### FR-11: Fix Redundant WEBVTT Check in captureMaxVttSegment (Low)
- Change `!body.includes('WEBVTT') && !body.trimStart().startsWith('WEBVTT')` to `!body.trimStart().startsWith('WEBVTT')`.

### FR-12: Progressive Fetch Preserves Bodies on Nested MPD Dead-End (Low)
- In `fetchSegmentBodiesProgressively`, if a nested MPD yields 0 cues, return previously accumulated bodies instead of discarding them.

### FR-13: Add VTT Segment Capture Append Tests (Low)
- Add tests for the `append: true` path, the "different representation after lock" path, and `mergeCues` deduplication.

### FR-14: Consolidate `isManifestResponse` Heuristic (Low)
- Part of FR-6: ensure the `<Period` + `AdaptationSet` check is consistent across all callers.

## Non-Functional Requirements

- All existing 1723 tests must continue to pass.
- No new lint errors introduced.
- TDD: write failing tests first, then implement fixes.
- No changes to the coordinator's public API or message bridge contract.

## Acceptance Criteria

- [ ] VTT segment capture emits segments after mid-session track switch.
- [ ] `zh-Hans` and `zh-Hant` are not matched as the same language in VTT capture.
- [ ] `processedMpdBodies` memory is bounded (hash-based or LRU-capped).
- [ ] Nested MPD fetch chain has an overall deadline.
- [ ] `readMaxActiveSubtitleLanguage()` handles localized labels and unknown languages.
- [ ] Single manifest detection function used across MAIN world and background.
- [ ] `fetchRealSubtitleContent` and `processMpdSubtitleTracks` removed.
- [ ] Single `isMaxCdnVttSegmentUrl` function used across codebase.
- [ ] No dead `isPriority` parameter.
- [ ] No redundant ternary in `concatVttSegments`.
- [ ] No redundant WEBVTT check in `captureMaxVttSegment`.
- [ ] Progressive fetch preserves bodies on nested MPD dead-end.
- [ ] VTT segment capture append/multi-representation tests added.
- [ ] All tests pass, no new lint errors.

## Out of Scope

- Changes to the subtitle coordinator's tier precedence logic.
- Changes to the DOM cue source scraper.
- Changes to the XHR/Fetch interceptor's block-and-wait mechanism.
- Changes to the background subtitle translation pipeline.
