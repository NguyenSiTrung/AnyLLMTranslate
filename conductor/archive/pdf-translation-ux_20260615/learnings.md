# Track Learnings: pdf-translation-ux_20260615

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- PDF viewer code lives under `entrypoints/pdf-viewer/` and uses React 19, PDF.js, Tailwind, and scoped custom CSS.
- The PDF viewer currently has two right-pane modes: `Layout` and `Text`.
- `Layout` mode renders the original PDF canvas and overlays translated text boxes using original paragraph coordinates.
- Length-expanded translations can exceed original bounding boxes, especially in Vietnamese, so layout preservation should be treated as a visual-reference mode instead of the default reading mode.
- Preserve virtualization (`useVisiblePages`) and scroll synchronization behavior when changing layout interactions.

---

## Implementation Learnings (2026-06-15)

- Default prop change in `PdfTranslationPane` and state initialization in `App.tsx` must both be updated to keep unit tests and runtime behavior consistent.
- Per-instance popover state in `OriginalLayoutOverlay` is enough for single-page scope. Escape and outside-click listeners are added only when a popover is open and cleaned up on close.
- Clipping detection for layout boxes must be heuristic-based; exact DOM measurement is unavailable at render time. Estimate rendered lines from text length, font size, and box width, then flag boxes whose estimated height exceeds the original box by a safety margin.
- Focusable layout boxes use `role="button"`, `tabIndex={0}` only when clipped, and `aria-expanded` to communicate popover state. Space/Enter activate the popover.
- Styling for layout interactions stays scoped to `entrypoints/pdf-viewer/style.css`. Popovers reuse the existing dark zinc palette so they are readable over the white layout boxes.
- Hover expansion is preserved as a non-essential visual enhancement but is no longer the primary way to read clipped translations.
- When layout mode tests mount `PdfCanvasRenderer`, wrap the initial render in `waitFor` for the layout boxes to appear so async canvas state updates do not produce act warnings.

<!-- Learnings from implementation will be appended below -->
