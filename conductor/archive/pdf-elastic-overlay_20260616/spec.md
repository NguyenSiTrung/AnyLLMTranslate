# Spec: PDF Elastic Overlay Layout Mode

> **Last Revised: 2026-06-16 (Revision 1)** — Layout mode preserves the original
> page canvas (images/tables/blocks) with translated boxes overlaid via absolute
> positioning at `height: auto`, masking only the original text. See
> `revisions.md`. (The original draft below assumed a pure-flow overlay with no
> canvas; that was rejected in Revision 1.)

## Overview

The current PDF `Layout` mode forces translated text into the exact bounding boxes of the original PDF paragraphs. Because translations are frequently longer than the source (especially into languages like Vietnamese, German, or Spanish), this produces clipped text, micro-fonts, and a hover/popover interaction that users must repeat for nearly every paragraph. This track replaces that rigid overlay with an **Elastic Overlay** that preserves the original page's horizontal structure and reading order while letting translated paragraphs grow vertically.

**Decision summary:** We chose Elastic Overlay over continuation pages and over leaving the current Layout mode as-is. Continuation pages would add scroll-sync complexity and confusing page labels for little functional gain. The existing Text mode already serves users who want a pure reading flow. Elastic Overlay gives a readable, structure-aware alternative.

## Functional Requirements

1. **Elastic paragraph layout in Layout mode**
   - Each right-pane page slot corresponds to one original PDF page but uses `height: auto`.
   - Translated paragraphs are laid out vertically using their original reading order (top-to-bottom, left-to-right).
   - Each paragraph box keeps its original horizontal position and width (scaled from PDF viewport units).
   - Paragraph height is `auto` and grows to fit the translated text.
   - Subsequent paragraphs shift down rather than overlapping.

2. **Remove clipping behaviors**
   - Delete `isLikelyClipped`, the `···` clipped badge, the full-text popover, and the hover `scale(1.025)` effect.
   - Remove font-size shrinking heuristics that reduce text below a readable minimum.
   - Single-line source paragraphs are no longer forced with `whiteSpace: nowrap`.

3. **Readable defaults**
   - Establish a readable font floor (minimum `11 px`–`12 px`) for overlay text.
   - Maintain a white background and dark text for masking the original canvas text.
   - Preserve heading detection so larger original headings render larger in the overlay.

4. **Page-based synchronized scrolling**
   - Replace the current ratio-based scroll mirror with a page-block sync.
   - Map the left pane's scroll progress to the matching page block on the right, interpolating within that block.
   - Keep the two panes aligned at page boundaries even when right-side pages are taller than the originals.

5. **Mode UX clarity**
   - Keep `Text` as the default mode.
   - Keep the `Layout | Text` segmented toggle in the persistent header.
   - Update tooltips/labels so `Layout` is clearly positioned as a visual-reference mode.

6. **Preserve existing behavior**
   - Keep canvas virtualization (`useVisiblePages`) and viewport-triggered lazy translation.
   - Keep in-memory and IndexedDB translation caching.
   - Keep error, loading, and empty states scoped to each page slot.

## Non-Functional Requirements

- No changes to PDF text extraction semantics unless required to improve paragraph ordering for multi-column pages.
- No OCR support for scanned PDFs.
- No changes to the left original PDF pane rendering.
- All styling stays scoped to `entrypoints/pdf-viewer/style.css`.
- Maintain ≥ 80% test coverage for modified PDF viewer modules.
- All validators pass: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm build`.

## Acceptance Criteria

- [ ] `Layout` mode renders translated paragraphs in reading order with `auto` height and no clipped text.
- [ ] `isLikelyClipped`, clipped badges, popovers, hover scale, and micro-font scaling are removed.
- [ ] Right pane page slots use natural height instead of fixed original-page `minHeight`.
- [ ] Synchronized scrolling keeps left/right panes aligned at page boundaries when heights differ.
- [ ] `Text` mode remains the default and is visually labeled as the recommended reading mode.
- [ ] Existing lazy translation, caching, virtualization, loading/error/empty states still work.
- [ ] Tests cover elastic layout rendering, scroll sync, and default mode.
- [ ] Project validators pass.

## Out of Scope

- Continuation pages (e.g., "Page 3 continued"). Rejected due to scroll-sync and mental-model complexity.
- Re-translating or summarizing content to fit original boxes.
- OCR for scanned PDFs.
- Left-pane rendering changes.
- Persistent user preference for default PDF layout mode.
- Complex multi-column layout algorithms beyond the existing paragraph grouping heuristic.
