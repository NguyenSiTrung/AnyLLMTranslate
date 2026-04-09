# Spec: Video Subtitle Translation Engine (Phase 2)

## Overview

Implement a complete video subtitle translation system for LinguaLens that intercepts, translates, and displays bilingual subtitles on YouTube, Udemy, and Coursera. The system uses XHR/Fetch monkey-patching in a MAIN world injected script as the primary interception strategy, with a full-featured custom subtitle overlay as fallback.

## Functional Requirements

### FR-1: MAIN World Script Injection
- Inject a page-context script (`inject.ts`) into the MAIN world via `web_accessible_resources`
- Script must load before any video player initializes (run at `document_start`)
- Minimal scope: only XHR/Fetch hooks and subtitle handlers — no access to extension APIs

### FR-2: XHR/Fetch Interceptor
- Monkey-patch `XMLHttpRequest.prototype.open/send` and `window.fetch` to intercept subtitle-related network requests
- Match subtitle URLs by platform-specific patterns (e.g., YouTube `/api/timedtext`, Udemy `*.vtt`, Coursera `*.vtt`)
- Intercept responses, hold them, send to content script for translation, and return the bilingual version to the player
- Must not break non-subtitle network requests

### FR-3: postMessage Bridge
- Establish a bidirectional communication channel between inject script (MAIN world) and content script (ISOLATED world) via `window.postMessage`
- Use a unique channel identifier (`lingua-lens`) to filter messages
- Message types: `SUBTITLE_INTERCEPTED`, `SUBTITLE_TRANSLATED`, `SUBTITLE_METADATA`
- Include request IDs for correlating requests with responses

### FR-4: Subtitle Parser (WebVTT + SRT)
- Parse WebVTT (.vtt) files into structured cue arrays: `{ startTime, endTime, text }`
- Parse SRT (.srt) files with automatic format detection
- Handle edge cases: multi-line cues, HTML tags in cues, positioning metadata, BOM markers
- Normalize both formats to a common `SubtitleCue[]` internal representation

### FR-5: Bilingual VTT Builder
- Reconstruct a valid WebVTT file from translated cues
- Support bilingual mode: original text + translated text in each cue (line break separated)
- Support translation-only mode: replace original with translated text
- Preserve timing, positioning, and styling metadata from original

### FR-6: YouTube Subtitle Handler
- Detect YouTube video pages and subtitle availability
- Intercept `/api/timedtext` requests (srv3 XML format and JSON3 format)
- Convert YouTube's proprietary formats to common `SubtitleCue[]` internally
- Handle auto-generated captions and manual captions
- Support language track selection

### FR-7: Udemy Subtitle Handler
- Detect Udemy course video pages
- Intercept VTT subtitle requests (pattern: `*.udemycdn.com/*.vtt`)
- Handle Udemy's SPA navigation between lectures (MutationObserver on player changes)
- Support multiple language tracks per lecture

### FR-8: Coursera Subtitle Handler
- Detect Coursera course video pages
- Intercept VTT subtitle requests (pattern: `*.coursera.org/*subtitle*`)
- Handle Coursera's lecture navigation and playlist progression
- Support multiple language tracks

### FR-9: Custom Subtitle Overlay (Fallback)
- Render a custom subtitle overlay DOM element on top of the video player when interception fails
- Sync overlay text with video `currentTime` using `timeupdate` event
- User controls:
  - Font size slider (12px–36px)
  - Position toggle (top/bottom of video)
  - Background opacity slider (0%–100%)
  - Drag to reposition
- Responsive: adjust to video player resize and fullscreen
- Auto-detect video element on page

### FR-10: Subtitle Styling
- Dedicated `subtitle.css` for overlay styles
- Semi-transparent background (default: `rgba(0,0,0,0.75)`)
- Bilingual display: original on top (smaller, dimmer), translation below (larger, brighter)
- Support dark/light video backgrounds
- Smooth fade-in/out transitions between cues

## Non-Functional Requirements

### NFR-1: Performance
- Subtitle translation latency < 2s for full VTT file (all cues batch-translated)
- Overlay rendering must not drop video frames (use `requestAnimationFrame`)
- XHR/Fetch patching overhead < 1ms per intercepted request

### NFR-2: Reliability
- Graceful degradation: if interception fails, automatically fall back to custom overlay
- If translation API fails, show original subtitles unchanged
- Handle platform API changes without crashing the extension

### NFR-3: Security
- MAIN world script has minimal scope — no access to extension APIs or user credentials
- All subtitle text sanitized before DOM insertion (prevent XSS via subtitle content)
- postMessage channel validated with origin check

### NFR-4: Compatibility
- Work on Chrome Stable 120+, Edge, Brave
- Handle YouTube's various player states (embedded, fullscreen, theater mode, miniplayer)
- Handle Udemy/Coursera SPA navigation without requiring page reload

## Acceptance Criteria

1. **YouTube**: Navigate to a YouTube video with subtitles → enable subtitle translation → bilingual subtitles appear using the native player renderer
2. **Udemy**: Navigate to a Udemy lecture with subtitles → enable subtitle translation → bilingual subtitles appear
3. **Coursera**: Navigate to a Coursera lecture with subtitles → enable subtitle translation → bilingual subtitles appear
4. **Fallback**: On a site where interception fails → custom overlay renders bilingual subtitles with user-adjustable font size, position, and opacity
5. **Parser**: WebVTT and SRT files with multi-line cues, HTML tags, and BOM markers parse correctly
6. **Bridge**: postMessage communication works reliably between MAIN and ISOLATED worlds
7. **No regression**: Page translation (Phase 1) continues to work correctly
8. **Tests**: All new modules have unit tests with ≥ 80% coverage

## Out of Scope

- Netflix subtitle handler (Phase 4)
- Subtitle download/export functionality
- Subtitle editing or manual timing adjustment
- Speech-to-text (live audio captioning)
- Popup UI controls for subtitle settings (Phase 3 — Options page)
