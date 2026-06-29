# Track Learnings: HBO Max Subtitle Deep Analysis Fixes

## [2026-06-29] - Phase 1-6: All 14 issues fixed
- **Implemented:** Fixed all 14 issues from HBO Max subtitle deep analysis:
  - VTT capture track-switch lock reset (`resetMaxVttSegmentCaptureLock`)
  - Shared `subtitleLanguagesMatch` with script-subtag guard (zh-Hans ≠ zh-Hant)
  - FNV-1a hash dedup for `processedMpdBodies` (bounded memory)
  - 30s deadline on nested MPD fetch chain
  - Localized label handling for `readMaxActiveSubtitleLanguage`
  - Manifest detection consolidation (single `isManifestResponse`)
  - Dead code removal (`fetchRealSubtitleContent`, `processMpdSubtitleTracks`)
  - Max CDN URL checker dedup (`isMaxCdnVttSegmentUrl`)
  - Dead `isPriority` parameter removed
  - Redundant ternary in `concatVttSegments` simplified
  - Redundant WEBVTT check in `captureMaxVttSegment` simplified
  - Progressive fetch preserves bodies on nested MPD dead-end
  - VTT segment capture append/track-switch/mergeCues tests added
- **Files changed:** inject/maxVttSegmentCapture.ts, inject/maxMpdProcessor.ts, inject/domCueSource.ts, lib/maxMpdSubtitles.ts, lib/maxSubtitleLanguages.ts, lib/subtitleLanguageMatch.ts, lib/vttSegmentConcat.ts, services/background.ts, +3 test files
- **Commits:** 8caf55c, dbe7175
- **Learnings:**
  - Patterns: `subtitleLanguagesMatch` needs a script-subtag guard — when both tags carry 4-char ISO 15924 script subtags (Hans/Hant) that differ, primary subtag matching must be suppressed
  - Gotchas: `domCueSource.ts` runs in MAIN world and can directly call `resetMaxVttSegmentCaptureLock()` since both are MAIN world modules — no bridge message needed
  - Gotchas: `fetchRealSubtitleContent` and `processMpdSubtitleTracks` were dead code with tests — removing both reduced test count by 14 but added 22 new tests elsewhere for net +108
  - Context: Background.ts had private copies of `isManifestResponse` and `isMaxCdnVttSegmentUrl` — consolidating to the shared exports from `maxMpdSubtitles.ts` eliminated code duplication
---
