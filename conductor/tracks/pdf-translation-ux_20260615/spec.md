# Spec: PDF Translation UX Improvements

## Overview

This track improves the PDF translation reading experience for target languages whose translations are longer than the source language, such as English to Vietnamese. The current layout-preserving translation pane maps translated text into original PDF bounding boxes, which can truncate translated blocks and require hover to reveal full content. The improved UX will prioritize comfortable reading while keeping layout preservation available for visually structured PDFs.

## Functional Requirements

1. **Default Reading Mode**
   - Change the PDF viewer translation pane default from `Layout` mode to `Text` mode.
   - Keep the existing `Layout | Text` segmented toggle in the persistent header.
   - Ensure the default mode communicates that text flow is the recommended reading experience.

2. **Layout Mode Labeling**
   - Clarify that `Layout` mode preserves the PDF visual structure and may clip longer translations.
   - Use concise helper text, tooltip copy, or an accessible label near the toggle without adding visual clutter.

3. **Persistent Full-Translation Access in Layout Mode**
   - Replace hover-only expansion as the primary way to read clipped layout blocks.
   - Provide click and keyboard-focus access to the full translated text for each layout block.
   - Display full text in a persistent popover/card that can be dismissed explicitly or by selecting another block.
   - Keep hover expansion only if it remains a non-essential enhancement.

4. **Clipping Affordance**
   - Indicate when a layout translation block is clipped or likely clipped.
   - Use a small, non-intrusive affordance such as a fade, corner marker, or `More` indicator.
   - Avoid indicators on blocks that are not clipped.

5. **Accessibility and Input Support**
   - Layout translation blocks with expandable content must be keyboard focusable.
   - Popovers must be reachable by keyboard and dismissible with `Escape`.
   - The interaction must work on touch devices and not depend on hover.

## Non-Functional Requirements

- Preserve current PDF virtualization and viewport-triggered translation behavior.
- Avoid changing PDF text extraction or translation semantics unless needed for clipping detection.
- Preserve layout mode as a visual-reference mode for tables, forms, slides, diagrams, and image-heavy PDFs.
- Avoid introducing page-height divergence that breaks synchronized scrolling.
- Keep UI styling scoped to the PDF viewer entrypoint.

## Acceptance Criteria

- [ ] The PDF viewer opens with the right translation pane in `Text` mode by default.
- [ ] Users can still switch to `Layout` mode from the header toggle.
- [ ] Layout mode no longer requires hover to access full translated content.
- [ ] Clipped or likely clipped layout blocks expose a visible full-text affordance.
- [ ] Full translation popovers work with mouse, keyboard, and touch.
- [ ] `Escape` dismisses an open layout translation popover.
- [ ] Existing PDF virtualization and synchronized scrolling behavior remain intact.
- [ ] Relevant unit/component tests cover default mode and layout full-text access behavior.
- [ ] Project validators pass: tests, lint, and typecheck.

## Out of Scope

- Adaptive per-page or per-column reflow that pushes layout blocks downward.
- Re-translating or summarizing content to fit original PDF bounding boxes.
- OCR support for scanned PDFs.
- Changing the left original PDF pane rendering.
- Adding persistent user preferences for PDF layout mode unless needed by a follow-up track.
