# Specification: Progressive Chunked Subtitle Translation

## Overview
Refactor the subtitle translation pipeline to eliminate the "Big Bang" processing delay. Instead of translating the entire video's subtitle file in one massive LLM request, the system will split the cues into manageable chunks, drastically reducing the Time-to-First-Subtitle (TTFS) and preventing LLM token exhaustion or interception timeouts.

## Functional Requirements
1. **Chunked Processing:** `handleTranslateSubtitle` in the background worker must split uncached subtitle cues into chunks of 20-30 cues.
2. **Context Overlap:** The translation prompt for each chunk must include 2-3 previous cues as read-only context to ensure accurate translation across sentence boundaries.
3. **Progressive Delivery:** The first chunk must be dispatched to the LLM immediately, and the results sent back to the frontend as soon as they complete.
4. **Background Pre-fetching:** Subsequent chunks must process asynchronously in the background. As they complete, they are appended/updated in the frontend.
5. **Overlay Defaulting:** Because native video players (like YouTube/Udemy) do not reliably support streaming updates to a WebVTT track, the `subtitleCoordinator` will immediately hand over intercepted cues to the Custom Subtitle Overlay (`subtitleOverlay.ts`), which is designed for dynamic cue updates.

## Acceptance Criteria
- [ ] Subtitle translation begins showing the first batch of cues in under ~5 seconds (depending on LLM speed), instead of waiting for the whole video.
- [ ] Subsequent cues appear seamlessly as the video plays.
- [ ] Translation accuracy is maintained across chunk boundaries due to the 2-3 cue context overlap.
- [ ] The system defaults to the Custom Subtitle Overlay to display the progressively translated cues.
- [ ] All related unit tests (especially `background.test.ts` and `subtitleCoordinator.test.ts`) pass with the new chunked logic.

## Out of Scope
- Implementing chunking for standard web page DOM translation (this is only for video subtitles).
- Attempting to force native HTML5 `<track>` elements to dynamically accept streaming chunks.
