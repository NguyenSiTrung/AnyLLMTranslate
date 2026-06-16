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
