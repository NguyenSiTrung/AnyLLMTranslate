# Track Learnings: pdf-elastic-overlay_20260616

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- PDF viewer code lives under `entrypoints/pdf-viewer/` and uses React 19, PDF.js, Tailwind, and scoped custom CSS.
- `Layout` mode currently renders the original PDF canvas in the right pane and overlays translated text in absolute boxes matching original paragraph coordinates.
- `Text` mode renders translated paragraphs in a simple vertical flow and is already the default reading mode.
- Scroll synchronization currently mirrors scroll progress by overall ratio, which drifts when left/right pane heights differ.
- Translation is triggered lazily via `IntersectionObserver` on right-pane page slots (`usePdfPageTranslations`).

## Design Decision

- Chosen approach: **Elastic Overlay** — preserve original horizontal positions and reading order, but let paragraph boxes grow naturally in height.
- Rejected: rigid bounding-box fixes, continuation pages, and replacing Layout with pure text flow.

<!-- Learnings from implementation will be appended below -->

## [2026-06-16 17:35] - Implementation Complete (Revision 1)

- **Implemented:** Reworked `Layout` mode into an elastic overlay that keeps the original PDF canvas (images, tables, blocks) visible in the right pane, with translated text boxes overlaid at their original positions via absolute positioning and `height: auto` — no clipping, micro-fonts, popovers, or hover-scale.
- **Revision 1 (post-implementation feedback):** The first cut rendered a pure-flow white page with **no canvas**, which dropped images/tables and removed Layout mode's value as a visual reference. Per user feedback, Revision 1 restores the canvas: boxes stay absolutely positioned over it, use `height: auto`, and mask only the original text via an opaque white background so uncovered canvas areas (images/tables) remain visible. See `revisions.md`.
- **Files changed:**
  - `entrypoints/pdf-viewer/components/PdfTranslationPane.tsx` — removed `isLikelyClipped`, clipped badge, full-text popover, hover scale, micro-font scaling, and `whiteSpace: nowrap`. Kept `PdfCanvasRenderer` (canvas). Added `LayoutOverlayBox` (absolute, auto-height), `LayoutOverlay` (canvas + boxes + overflow spacer), `estimateBoxHeight`, and `LayoutStatusOverlay`.
  - `entrypoints/pdf-viewer/style.css` — replaced clipping/popover/hover styles with `.pdf-viewer-layout-para-box` (absolute, auto height, white mask, dark text), `.pdf-viewer-layout-para-box--heading`, and `.pdf-viewer-layout-status*` (centered status card).
  - `entrypoints/pdf-viewer/App.tsx` — right-pane page slots use natural height (no fixed `minHeight`) in `'original'` mode; refreshed `Layout`/`Text` tooltips.
  - `entrypoints/pdf-viewer/hooks/useSynchronizedScroll.ts` — replaced ratio-only `mirrorScrollTop` with page-block interpolation (aligns at page boundaries, interpolates within each page); falls back to ratio when page blocks absent.
  - Tests: `PdfTranslationPane.test.tsx` covers overlay rendering, font floor, heading, canvas preservation, status states; `useSynchronizedScroll.test.ts` adds page-block sync cases.
- **Validators:** `tsc --noEmit` ✅, `eslint .` ✅ (0 errors), `vitest run` ✅, `wxt build` ✅.
- **Learnings:**
  - **Overflow spacer for absolute auto-height boxes:** Absolute boxes don't push siblings, so the page slot would stay canvas-height even when translations overflow. `estimateBoxHeight()` (text length / width / font size → lines × line height) gives a pre-render estimate; `LayoutOverlay` reserves `max(0, maxBottom - canvasHeight) + pad` via an in-flow spacer so a tall box pushes the next page down instead of colliding.
  - **Font sizing:** overlay font = `clamp(para.fontSize * viewport.scale, 12, 32)` (floor 12px, cap 32px). Width clamped to `min(max(para.width*scale, 40), pageWidth - left - 4)`. No length-ratio shrink.
  - **Scroll sync page-block algorithm:** `collectPageBlocks()` queries `[data-page-number]` (left) / `[data-page-slot]` (right); absolute content offset = `rect.top - containerRect.top + scrollTop`. Falls back to ratio-based mirroring when no page blocks exist, keeping pre-existing ratio unit tests green.
  - **Test geometry in jsdom:** `getBoundingClientRect` returns zeros in jsdom. Mock each page element's rect to `top: absoluteOffset - container.scrollTop` and the container's rect to `top: 0` so the `+ scrollTop` cancels to the absolute offset.
  - **Check for `revisions.md` before implementing:** The original spec described pure-flow "no canvas"; an earlier session logged Revision 1 (keep canvas) in `revisions.md`. Always read `revisions.md` when present — it overrides the base spec.md.
---


