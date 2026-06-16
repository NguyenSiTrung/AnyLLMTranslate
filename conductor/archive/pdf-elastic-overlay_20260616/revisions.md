# Revisions: pdf-elastic-overlay_20260616

## Revision 1 — 2026-06-16 — Spec (Layout mode visual preservation)

**Trigger:** User feedback after initial implementation. The first cut implemented
the spec's "elastic reflowable overlay" literally — white page with flowing
translated paragraphs and **no original canvas** on the right pane. The user
pointed out this dropped images, tables, and blocks from Layout mode, removing
its value as a "visual reference" mode.

**Phase/Task when issue occurred:** Post-implementation review of Phase 3.

**Change:** Layout (`original`) mode now **renders the original page canvas**
(images, tables, blocks visible) with translated text boxes overlaid at their
original positions. Boxes:
- Keep original `left`/`top`/`width` (absolute positioning over the canvas).
- Use `height: auto` (grow to fit, no clipping/micro-fonts/popovers).
- Mask only the original text via an opaque white background; images/tables in
  uncovered areas stay visible.
- Font floored at 12px (capped 32px for headings), no length-ratio shrinking.
- A spacer reserves vertical space (estimated via text metric) so a box that
  extends beyond the canvas pushes the next page down instead of colliding.

**Rationale:** The original spec's `height: auto` page-slot + "paragraphs shift
down" (flow) goal is incompatible with preserving the canvas visual reference
(flowing text covers the canvas). User confirmed visual reference (canvas) is
the priority for Layout mode; overlap from long translations is an accepted
tradeoff, mitigated by estimated slot growth.

**Files affected:** `PdfTranslationPane.tsx`, `style.css`, `PdfTranslationPane.test.tsx`.

## Acceptance Criteria Update

- [x] `Layout` mode renders translated paragraphs in reading order with `auto` height and no clipped text.
- [x] `isLikelyClipped`, clipped badges, popovers, hover scale, and micro-font scaling are removed.
- [x] **Original page canvas (images/tables/blocks) is preserved in Layout mode.**
- [x] Right pane page slots use natural height (canvas + estimated overflow) instead of fixed original-page `minHeight`.
- [x] Synchronized scrolling keeps left/right panes aligned at page boundaries when heights differ.
- [x] `Text` mode remains the default and is visually labeled as the recommended reading mode.
- [x] Existing lazy translation, caching, virtualization, loading/error/empty states still work.
- [x] Tests cover overlay rendering, scroll sync, and default mode.
- [x] Project validators pass.
