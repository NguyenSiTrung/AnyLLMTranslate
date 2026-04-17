# Specification: Fullscreen Subtitle Overlay Fix

## Overview
Currently, the translation subtitle overlay is hidden when a video enters fullscreen mode because the overlay is attached to `document.body`, which falls behind the browser's Top Layer. This track resolves the issue by dynamically moving the overlay into the fullscreen Top Layer.

## Functional Requirements
- **Positioning Update:** Change the subtitle overlay's CSS positioning to `fixed` so that its coordinates remain accurate relative to the viewport, regardless of its DOM parent.
- **Dynamic Reparenting:** Listen for the `fullscreenchange` event. When active, detect `document.fullscreenElement`.
- **Custom Player Support:** If the `fullscreenElement` is a container (not the `<video>` itself), reparent the overlay into that container (`appendChild`).
- **Native Video Fallback:** If the `fullscreenElement` is the `<video>` element itself, use the HTML5 Popover API (`popover="manual"`) and trigger `showPopover()` to force the overlay into the Top Layer without modifying the video's internal structure.
- **DOM Restoration:** Upon exiting fullscreen, reparent the overlay back to `document.body` or its original parent.

## Non-Functional Requirements
- **Performance:** Ensure minimal layout thrashing when reparenting elements.
- **Compatibility:** Continue to function normally in browsers that don't yet support the Popover API (graceful degradation).

## Acceptance Criteria
- [ ] Subtitle overlay remains visible and correctly positioned when entering fullscreen on YouTube (custom player wrapper).
- [ ] Subtitle overlay remains visible and correctly positioned when entering fullscreen on a native HTML5 video element.
- [ ] Subtitle overlay returns to its correct position when exiting fullscreen.
- [ ] Drag-to-reposition and settings changes continue to work while in fullscreen mode.
- [ ] `npm run lint` and `npm run test` pass successfully.

## Out of Scope
- Creating a completely custom video player.
- Picture-in-Picture (PiP) subtitle support.
