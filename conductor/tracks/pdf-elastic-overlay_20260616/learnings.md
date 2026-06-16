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

## [2026-06-16 17:35] - Implementation Complete

- **Implemented:** Replaced rigid 1:1 bounding-box `Layout` mode with an Elastic Overlay. Translated paragraphs now preserve their original horizontal position (`marginLeft` from PDF x-coordinate) and reading order but reflow vertically with `height: auto` — no clipping, micro-fonts, popovers, or hover-scale.
- **Files changed:**
  - `entrypoints/pdf-viewer/components/PdfTranslationPane.tsx` — removed `isLikelyClipped`, `LayoutParagraphBox`, `OriginalLayoutOverlay`, popover logic, and the right-pane `PdfCanvasRenderer`. Added `ElasticParagraph`, `ElasticLayoutPane`, and `ElasticStatusOverlay`.
  - `entrypoints/pdf-viewer/style.css` — deleted `.pdf-viewer-layout-*` (clipping/popover/hover) styles; added `.pdf-viewer-elastic-*` (white page, dark reflowable text, centered status card).
  - `entrypoints/pdf-viewer/App.tsx` — right-pane page slots use natural height (no `minHeight`) in `'original'` mode; refreshed `Layout`/`Text` tooltips to describe elastic overlay vs reading flow.
  - `entrypoints/pdf-viewer/hooks/useSynchronizedScroll.ts` — replaced ratio-only `mirrorScrollTop` with page-block interpolation (aligns at page boundaries, interpolates within each page); falls back to ratio when page blocks absent.
  - Tests: rewrote `PdfTranslationPane.test.tsx` (elastic rendering, font floor, heading, reading order, states, no canvas) and added page-block sync cases to `useSynchronizedScroll.test.ts`.
- **Validators:** `tsc --noEmit` ✅, `eslint .` ✅ (0 errors), `vitest run` ✅ (966 tests / 76 files), `wxt build` ✅ (2.57 MB).
- **Learnings:**
  - **Design resolution:** "keep original canvas background" (plan) + "white background for masking original canvas text" (spec) are satisfied by an opaque white `.pdf-viewer-elastic-page` container. The original canvas is NOT rendered in the right pane for elastic mode — a fixed-height canvas cannot coexist with the spec's `height: auto` page slots. The white page container IS the mask/visual background. This is the only design that cleanly eliminates clipping.
  - **Font sizing:** elastic font size = `clamp(para.fontSize * scale, 12, 32)` (floor 12px readable, cap 32px for giant headings). Scale = `720 / pageWidth`. Body text (~10–12pt) lands at ~12–14px; headings scale up naturally. No per-paragraph length-ratio shrink.
  - **Width clamping:** elastic paragraph `width` is clamped to `min(max(para.width*scale, 80), pageWidth - marginLeft - 8)` so narrow/multi-column source boxes never overflow the page slot.
  - **Scroll sync page-block algorithm:** `collectPageBlocks()` queries `[data-page-number]` (left) / `[data-page-slot]` (right) and resolves each block's absolute content offset via `rect.top - containerRect.top + scrollTop`. `findActiveBlock()` picks the block containing `scrollTop`; progress within it is applied to the matching target page. Falls back to ratio-based mirroring when no page blocks exist — this keeps the pre-existing ratio unit tests green without special-casing.
  - **Test geometry in jsdom:** `getBoundingClientRect` returns zeros in jsdom. To test page-block sync, mock each page element's `getBoundingClientRect` to return `top: absoluteOffset - container.scrollTop` (so the `+ scrollTop` in the offset formula cancels to the absolute offset) and the container's rect to `top: 0`.
  - **Unused prop lint:** removing the right-pane canvas left the `visible` prop unused in `PdfTranslationPane`. Keeping the prop in the interface (App.tsx still passes it) but dropping it from destructuring satisfies `no-unused-vars` without an interface/App.tsx churn.
---

