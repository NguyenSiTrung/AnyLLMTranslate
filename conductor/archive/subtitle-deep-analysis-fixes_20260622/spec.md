# Spec: Subtitle Deep Analysis Fixes

## Overview

Comprehensive fix and improvement track addressing 50 findings from a deep analysis of the subtitle feature across all supported sites (YouTube, Udemy, Coursera, LinkedIn Learning, HBO Max). The findings span 3 execution contexts (MAIN world inject, ISOLATED world content, Background service worker) and cover critical bugs, performance issues, race conditions, dead code, missing test coverage, and refactoring opportunities.

## Motivation

The subtitle feature has grown organically across 20+ tracks. A deep audit revealed 5 critical issues (XHR blocking, fragile response overrides, unbounded memory, track-mixing races, inefficient chunk delivery), 12 high-severity issues (settings I/O storms, missing fallbacks, divergent implementations, parser gaps), 13 medium issues, 8 low issues, and 12 refactoring opportunities. This track addresses all of them in a phased, parallelizable plan.

## Functional Requirements

### FR-1: XHR/Fetch Interceptor Hardening (Critical)
- Use `translationTimeout` setting (10-120s) instead of hardcoded 30s timeout
- Override `response` in addition to `responseText` on XHR objects
- Handle `responseType` (json, arraybuffer, text) correctly
- Use `getPatternsForCurrentHost()` instead of `getAllPatterns()` to avoid cross-platform false positives
- Add XHR abort signal handling to clean up dangling translatedHandler listeners
- Anchor URL patterns to reduce false-positive matches on non-target domains

### FR-2: DOM Cue Source Memory & Performance (Critical)
- Cap DOM cue rolling buffer to a sliding window (e.g., last 200 cues)
- Prune old cues from coordinator's `domOriginalCues`, `domTranslatedCues`, `domTranslatedTexts`, `domTranslationMap`
- Implement binary search for `findActiveCue` (O(log n) instead of O(n))
- Throttle MutationObserver callbacks with requestAnimationFrame or debounce

### FR-3: Track Identity & Race Condition Prevention (Critical)
- Add track identity (language + URL or trackId) to `SUBTITLE_INTERCEPTED` payload
- Guard `handleIntercepted` against concurrent track switches
- Deduplicate auto-activate (fetch) and interceptor flows to avoid double translation sessions
- Fix `findActiveCue` to return the most recent matching cue after seeks

### FR-4: Progressive Chunk Delivery Optimization (Critical)
- Background sends only the translated chunk (index + chunk cues) instead of the full array
- Coordinator merges chunk into existing array at the correct offset
- Reduce message size from O(n) to O(chunk_size) per update

### FR-5: Coordinator Settings Caching (High)
- Cache settings in coordinator at startup, refresh via `chrome.storage.onChanged` listener
- Eliminate per-batch `loadSettings()` calls in `handleDomCues` and `handleIntercepted`

### FR-6: Native Subtitle Fallback (High)
- Restore native subtitles when overlay translation fails
- Send original (untranslated) VTT back instead of empty VTT on failure
- Add retry mechanism (toast with retry button or automatic backoff)

### FR-7: Overlay Flicker Fix (High)
- `updateCues` should not reset `currentCueIndex` to -1 if the active cue hasn't changed
- Only force re-evaluation when the cue array identity or content actually changes

### FR-8: Parser Fixes (High)
- `parseTimestamp` must handle MM:SS.mmm (2-segment) VTT timestamps
- `parseWebVTT` must skip NOTE and STYLE blocks explicitly
- Remove dead `buildBilingualVTT` / `subtitleBuilder.ts` (overlay mode replaced VTT replacement)

### FR-9: Unify findPrimaryVideo (High)
- Single canonical implementation in `lib/findPrimaryVideo.ts` with `readyState` filter and `srcBonus`
- Remove duplicate implementation in `textTrackDiscovery.ts`

### FR-10: Platform Handler Fixes (Medium/High)
- Add `languageExtractor` to Coursera's second VTT pattern
- YouTube: capture `tlang` param in addition to `lang`
- Coursera/Udemy: set `videoId` in `extractAvailableTracks`
- LinkedIn: add `getMetadataPatterns` and `extractAvailableTracks`
- HboMax: expand `LABEL_TO_LANGUAGE` map to cover all Max-supported languages
- Remove production `console.log` from Udemy languageExtractor and other handlers
- Remove dead Netflix/Amazon allowlist entries (no handlers exist)

### FR-11: Coordinator Message Handling Fixes (Medium)
- `GET_AVAILABLE_TRACKS` must use `sendResponse()` properly instead of sending a separate message
- `SELECT_SUBTITLE_TRACK` must return success/error response to popup
- `fetchSubtitleContent` should skip direct fetch and go straight to background worker for cross-origin URLs

### FR-12: isOnWatchPage Refactoring (Medium)
- Move `isOnWatchPage` logic into `SubtitleHandler` interface as optional `isWatchPage()` method
- Each handler defines its own watch page detection, eliminating hardcoded platform checks

### FR-13: Dead Code Cleanup (Low)
- Remove `requestResponse` from `messageBridge.ts` (unused)
- Remove `translationTimeout` from `SubtitleSettings` (unused in runtime)
- Remove `buildBilingualVTT` / `subtitleBuilder.ts` (dead in overlay flow)
- Remove `interceptTimeout` from coordinator state (reserved, unused)

### FR-14: Coordinator State Refactoring (Low)
- Replace module-level singleton `state` with a class instance for testability
- Add `clearHoverCache` to coordinator cleanup function

### FR-15: Test Coverage Gap Filling (High)
- Unit tests for `XhrInterceptor` (monkey-patching, handler capture, response override, timeout, abort)
- Unit tests for `FetchInterceptor` (response cloning, translation replacement, timeout)
- Unit tests for `domCueSource.ts` (MutationObserver, rolling buffer, track switch reset, deferred attach)
- Unit tests for `textTrackDiscovery.ts` (video scanning, addtrack event, loadedmetadata rescan)
- Unit tests for YouTube `parseSrv3` and `parseJson3` formats

### FR-16: Minor Improvements (Low)
- `hideNativeCaptions` use `display: none` or `opacity: 0` instead of `visibility: hidden` where appropriate
- Add ARIA attributes to overlay for accessibility
- Add retry mechanism for failed subtitle translations

## Non-Functional Requirements

- **Performance:** No `loadSettings()` in hot paths (DOM cue batches, timeupdate). Binary search for cue lookup. Capped DOM cue buffer. Throttled MutationObservers.
- **Memory:** DOM cue buffer bounded to sliding window. No unbounded array growth.
- **Reliability:** Native subtitle fallback on translation failure. XHR abort handling. Retry mechanism.
- **Testability:** Class-based coordinator state. Comprehensive test coverage for interceptors and DOM scraping.
- **Compatibility:** No breaking changes to existing subtitle flow on any supported platform.

## Acceptance Criteria

1. XHR interceptor uses `translationTimeout` setting, overrides both `responseText` and `response`
2. DOM cue buffer capped at 200 cues; `findActiveCue` uses binary search
3. No concurrent track-mixing race; track identity guards in `handleIntercepted`
4. Background sends chunk deltas, not full arrays
5. Coordinator caches settings; zero `loadSettings()` calls in `handleDomCues`/`handleIntercepted` hot paths
6. Native subtitles restored on overlay translation failure
7. `updateCues` does not flicker when active cue unchanged
8. `parseTimestamp` handles MM:SS.mmm format
9. Single `findPrimaryVideo` implementation used everywhere
10. All platform handlers have `languageExtractor`, `videoId`, and metadata patterns where applicable
11. `GET_AVAILABLE_TRACKS` and `SELECT_SUBTITLE_TRACK` use proper `sendResponse` contract
12. `isOnWatchPage` delegated to handlers via `isWatchPage()` interface method
13. All dead code removed (`requestResponse`, `translationTimeout`, `buildBilingualVTT`, `interceptTimeout`)
14. Unit tests exist for XHR interceptor, Fetch interceptor, domCueSource, textTrackDiscovery, YouTube parser
15. All existing tests pass; `pnpm lint` clean; `wxt build` succeeds

## Out of Scope

- Adding new platform handlers (Netflix, Amazon Prime, Disney+, etc.)
- Redesigning the subtitle overlay UI/UX
- Changing the postMessage bridge protocol (only extending payloads)
- Modifying the background translation chunking algorithm (only the delivery mechanism)
