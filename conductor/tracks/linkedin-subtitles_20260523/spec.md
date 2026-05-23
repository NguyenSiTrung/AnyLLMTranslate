# Specification: LinkedIn Learning Subtitle Support

## Overview
Implement video subtitle translation support for LinkedIn Learning (`linkedin.com/learning`). This will intercept WebVTT subtitle requests, translate the cues progressively via the LLM provider, and render bilingual subtitles using the extension's custom overlay player wrapper.

## Functional Requirements
- **FR-1: LinkedIn Subtitle Interceptor**: Create a `LinkedInSubtitleHandler` that detects LinkedIn Learning course pages, intercepts WebVTT subtitle files (`.vtt`), and parses them into `SubtitleCue[]`.
- **FR-2: Watch Page Recognition**: Restrict watch-page detection to `linkedin.com/learning/*` and ignore generic/social feed video items.
- **FR-3: Whitelist Addition**: Add `linkedin.com` and `licdn.com` to the background service worker's `SUBTITLE_ALLOWLIST` to permit CORS-bypass subtitle downloads.
- **FR-4: UI Overlay Fallback**: Wire up the overlay display, drag-and-drop repositioning, and style configuration.
- **FR-5: Universal Fallback**: Allow HTML5 `TextTrack` discovery fallback to detect native tracks if network interception fails.

## Acceptance Criteria
- Auto-activation triggers when playing a video on `linkedin.com/learning/` (if enabled in settings).
- Subtitles are translated and displayed in side-by-side bilingual format in the custom overlay.
- Background worker correctly downloads VTT subtitles from `*.licdn.com` without CORS blockages.
- Full test coverage for the LinkedIn subtitle handler parsing and transformation logic.

## Out of Scope
- Support for regular LinkedIn feed/social network video subtitle translation.
