# Track Learnings: fullscreen-overlay_20260417

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

*See `conductor/patterns.md` for project-wide patterns.*

---

<!-- Learnings from implementation will be appended below -->

## [2026-04-17 10:55] - Phase 1 & 2: Fullscreen Overlay Fix
- **Implemented:** Updated `subtitleOverlay.ts` to use `position: fixed` and implemented dynamic reparenting and Popover API for fullscreen mode support.
- **Files changed:** `content/subtitleOverlay.ts`, `content/__tests__/subtitleOverlay.test.ts`
- **Learnings:**
  - Patterns: Use `Object.defineProperty(document, 'fullscreenElement', ...)` for simulating fullscreen in jsdom, but MUST clean it up in `afterEach()` to avoid polluting other tests.
  - Patterns: jsdom does not implement `HTMLElement.prototype.popover` or `showPopover`. Must manually define them in tests to test Popover API degradation.
  - Context: The overlay is `position: fixed` because we want it to stay above the video. In full screen, the `position: fixed` works well because the `videoRect` coordinates correctly correspond to the viewport.
---
