# Implementation Plan: Fullscreen Subtitle Overlay Fix

## Phase 1: Foundation (Positioning Fix)
<!-- execution: sequential -->

- [x] Task 1: Refactor `positionOverlay` in `content/subtitleOverlay.ts` to use `position: fixed` and remove `window.scrollY/X` from calculations.
- [x] Task 2: Update `content/__tests__/subtitleOverlay.test.ts` to reflect the new fixed positioning logic.
- [x] Task 3: Conductor - Phase Verification 'Foundation' (Run `pnpm test`, `pnpm lint`)

## Phase 2: Reparenting & Top Layer Logic
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 1: Update `handleFullscreenChange` in `content/subtitleOverlay.ts` to detect `document.fullscreenElement` and dynamically `appendChild` the overlay to the fullscreen container, or revert to `document.body` on exit.
- [x] Task 2: Implement Popover API fallback (`popover="manual"` and `showPopover()`) in `initializeOverlay` and `handleFullscreenChange` when the `<video>` element itself is fullscreen.
- [x] Task 3: Write tests simulating `fullscreenchange` events, verifying both the reparenting behavior and Popover API fallback in `content/__tests__/subtitleOverlay.test.ts`.
- [x] Task 4: Conductor - Phase Verification 'Reparenting & Top Layer Logic' (Run `pnpm test`, `pnpm lint`, capture learnings)
