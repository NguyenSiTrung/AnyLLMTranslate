# Track Learnings: pdf-translation-ux_20260615

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- PDF viewer code lives under `entrypoints/pdf-viewer/` and uses React 19, PDF.js, Tailwind, and scoped custom CSS.
- The PDF viewer currently has two right-pane modes: `Layout` and `Text`.
- `Layout` mode renders the original PDF canvas and overlays translated text boxes using original paragraph coordinates.
- Length-expanded translations can exceed original bounding boxes, especially in Vietnamese, so layout preservation should be treated as a visual-reference mode instead of the default reading mode.
- Preserve virtualization (`useVisiblePages`) and scroll synchronization behavior when changing layout interactions.

---

<!-- Learnings from implementation will be appended below -->
