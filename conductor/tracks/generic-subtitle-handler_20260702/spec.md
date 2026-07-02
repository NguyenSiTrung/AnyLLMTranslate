# Spec: Generic Subtitle Handler

## Overview

Add a generic subtitle handler to the extension's subtitle pipeline that can intercept and translate subtitles on ANY website with a `<video>` element, without requiring a dedicated platform-specific handler class. This mirrors Immersive Translate's `webvtt`/`subsrt`/`ebutt`/`general` handler types, which cover ~80% of supported sites via generic URL-pattern interception rather than custom code.

The generic handler acts as the lowest-priority fallback in the `SubtitleHandler` registry. When no platform-specific handler (YouTube, Netflix, Disney+, etc.) detects the current hostname, the generic handler activates and intercepts subtitle network requests using broad URL pattern matching and content-type detection. The existing `parseSubtitles()` parser (VTT/SRT/TTML/ASS) handles format conversion. A DOM cue-scraping fallback tier handles sites that render captions into the DOM without exposing subtitle URLs.

## Functional Requirements

### FR1: Generic Subtitle Handler Class
- A new `GenericSubtitleHandler` class implementing the `SubtitleHandler` interface
- `detect()` returns true when:
  - No platform-specific handler has already detected the current hostname (guaranteed by registration order)
  - A `<video>` element exists on the page (or is dynamically inserted via MutationObserver)
- `getPatterns()` returns URL patterns for common subtitle formats:
  - `.vtt` and `.webvtt` extensions (with optional query params)
  - `.srt` extensions
  - `.ttml` and `.ttml2` extensions (NOT generic `.xml`)
  - URLs containing `/subtitle/`, `/caption/`, `/texttrack/` in the path
- `transformResponse()` delegates to the existing `parseSubtitles()` auto-detect parser
- `getNativeCaptionHide()` returns common caption container selectors (`.vjs-text-track-display`, `[data-testid*="caption"]`, `.ytp-caption-segment`, etc.)

### FR2: Content-Type Based Detection
- The interceptor registry should optionally match responses by Content-Type in addition to URL patterns:
  - `text/vtt` -> VTT subtitle
  - `application/x-subtitle` -> generic subtitle
  - `application/ttml+xml` -> TTML subtitle
- Content-Type matching is a secondary signal (URL pattern matching takes precedence)

### FR3: DOM Cue-Scraping Fallback
- The generic handler implements `getDomCueSource()` with common caption container selectors:
  - `.vjs-text-track-display`, `.shaka-text-container`, `[data-testid*="caption"]`, `.cue-text`, `.subtitle-text`, `#caption-window`, `.ytp-caption-segment`
- DOM scraping activates only when URL interception fails to produce cues within a timeout window (existing coordinator timeout mechanism)
- Uses the existing `domCueSource.ts` infrastructure (MutationObserver on stable ancestor, `video.currentTime` sampling)

### FR4: Handler Priority in Registry
- The generic handler is registered LAST in both `content.ts` and `inject.content/index.ts`
- `detectCurrentHandler()` returns the first matching handler, so platform-specific handlers naturally take precedence
- `getPatternsForCurrentHost()` collects patterns from all detecting handlers, but the generic handler only adds its patterns when it detects (i.e., no specific handler matched)

### FR5: Settings Toggle
- New `SubtitleSettings` field: `enableGenericSubtitleHandler: boolean` (default: `true`)
- Toggle in Options -> Subtitles section: "Generic subtitle detection"
- When disabled, the generic handler is not registered, falling back to platform-specific handlers only
- Independent from the per-site `disabledSubtitleSites` toggles

### FR6: Subtitle Sites Display Update
- `lib/subtitleSites.ts` `SUPPORTED_SUBTITLE_SITES` updated to include a "Generic" entry
- Displayed in the Settings supported sites card with method hint "Auto-detect (any site with video)"
- The generic entry cannot be disabled via the per-site toggle (it has its own separate toggle)

## Non-Functional Requirements

- **No false positives**: The generic handler must not intercept non-subtitle VTT/XML files. Content validation (check for WEBVTT header, timing lines, or TTML root element) is performed before translation.
- **No performance impact on known sites**: Since the generic handler only activates when no specific handler detects, known platforms (YouTube, Netflix, etc.) are unaffected.
- **Test coverage**: Unit tests for URL pattern matching, content validation, DOM cue source selectors, handler priority, and settings toggle.
- **Existing tests pass**: All 1903 existing tests continue to pass.

## Acceptance Criteria

1. On a website with a `<video>` element that serves `.vtt` subtitles (not one of the 9 supported platforms), subtitles are intercepted, translated, and displayed as bilingual overlay
2. On a website with a `<video>` element that serves `.srt` subtitles, subtitles are intercepted and translated
3. On a website with a `<video>` element that serves `.ttml` subtitles, subtitles are intercepted and translated via the TTML parser
4. On a website that renders captions into the DOM (no subtitle URL), DOM cue scraping activates as a fallback and translates visible captions
5. On YouTube/Netflix/Disney+/HBO Max/Youku/etc., the existing platform-specific handler takes precedence; the generic handler does not interfere
6. Disabling "Generic subtitle detection" in Settings fully disables the generic handler; platform-specific handlers continue to work
7. Non-subtitle `.vtt`/`.xml` files (e.g., video descriptions, chapter markers) are not intercepted (content validation rejects them)
8. All existing tests pass; new tests cover the generic handler

## Out of Scope

- Config-driven site profiles (JSON list of custom URL patterns per site) - future enhancement
- Native HTML5 TextTrack rendering (overlay-only, consistent with existing architecture)
- `.ass`/`.ssa` format interception via the generic handler (Youku has a dedicated handler)
- Automatic native caption hiding for site-specific CSS selectors beyond common patterns
- User-facing UI for adding custom subtitle URL patterns
