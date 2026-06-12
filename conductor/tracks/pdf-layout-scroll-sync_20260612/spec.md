# Spec: PDF Layout and Scroll Synchronization

## Overview

The bilingual side-by-side PDF translation view currently has layout and scroll synchronization discrepancies. Specifically, the translation slots in the right pane were squished and did not match the heights/widths of the original pages in the left pane. This caused the PDF translation on load to send concurrent translation requests to the LLM provider for all pages at once (spamming the provider). Setting the min-height on slots resolves the request spamming, but we also want to improve the scroll synchronization so it is perfectly 1-to-1, align the layout widths symmetrically, and place the translation progress indicator in a persistent header rather than inside the scrolling container.

## Functional Requirements

1. **Space out Translation Slots**: Give each right-pane page slot a `minHeight` matching the precomputed height of the left-pane page placeholder (`dims.height` or a fallback of `960px`). *(Done as initial hotfix)*
2. **Symmetrical Layout Widths**: Constrain the right-pane page slot widths to match the left-pane page widths (`dims.width` or `720px` max-width), centering them so both sides are perfectly symmetrical.
3. **Move Progress Indicator to Header**: Move the translation progress pill (`{translatedCount} / {totalCount} pages translated`) out of the right scrollable container and place it in the top persistent header. This keeps the indicator always visible to the user and removes layout height discrepancies between the left and right scroll containers.
4. **1-to-1 Scroll Sync**: Simplify `useSynchronizedScroll` scroll synchronization to perform direct 1-to-1 mirroring of scroll offsets when page heights are matched, ensuring perfect alignment.

## Non-Functional Requirements

- All 947 unit and integration tests must pass.
- No regressions in translation behavior, caching, or rendering speed.

## Acceptance Criteria

- [ ] Right-pane page slot wrappers use `className="pdf-viewer-page"` and have `minHeight` matching the left-pane pages.
- [ ] Right-pane page slot wrappers have width/max-width constrained and centered (matching the left pane's `720px` max-width / centering).
- [ ] The translation progress pill is rendered in the global PDF header (sticky/persistent) on the right side.
- [ ] Scroll synchronization between the left and right panes is smooth, perfectly aligned, and direct 1-to-1 (no scroll jumps).
- [ ] All unit and integration tests pass successfully.

## Out of Scope

- Redesigning the styling of the translation cards (fonts, colors).
- Implementing OCR or scanned image translation.
