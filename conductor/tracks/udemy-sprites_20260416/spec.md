# Specification: Udemy Sprite Subtitle Fix

## Overview
The AnyLLMTranslate extension is mistakenly intercepting video thumbnail sprite files (e.g., `thumb-sprites.jpg#xywh=...`) requested by Udemy's video player in WebVTT format. This leads to coordinate metadata being processed and displayed as translated subtitles. This track implements defense-in-depth within the `UdemyHandler` to recognize and immediately ignore these sprite tracks.

## Functional Requirements
- **URL Pattern Exclusion**: Extend the interceptor regex within `UdemyHandler.getPatterns()` to actively ignore network requests matching known sprite naming conventions (e.g., `sprite`, `thumbnail`, `board`).
- **Cue Level Filtering**: Modify  `UdemyHandler.transformResponse` to filter out any `SubtitleCue` where the text strictly matches image file patterns (e.g., `.jpg`, `.png`, `#xywh=...`).
- **Early Exit Fast Path**: If `transformResponse` detects that the track is purely sprite payloads, it must early-exit and return an empty `[]` array.
- **Silent Handling**: Background processes receiving these empty arrays must drop the translation job silently without surfacing errors to the user UI.

## Non-Functional Requirements
- **Performance**: The regex applied to cues must execute efficiently to minimize subtitle rendering latency.
- **Precision**: The filtering logic must not be overly aggressive; it must distinctively target sprite patterns so it doesn't strip valid coding subtitles discussing `.jpg` files.

## Acceptance Criteria
- The extension no longer overlays translated image coordinates (`thumb-sprites.jpg#xywh=...`) on Udemy videos.
- Legitimate subtitles on Udemy are still successfully intercepted and translated.
- A unit test added to `udemyHandler.test.ts` confirms that a mocked sprite VTT file is safely parsed and correctly zeroed out by the handler.

## Out of Scope
- Editing the core `parseWebVTT` logic in `lib/subtitleParser.ts`.
- Modifying behavior for platforms other than Udemy.
