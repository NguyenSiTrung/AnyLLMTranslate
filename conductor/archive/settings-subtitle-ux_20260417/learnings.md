# Track Learnings: settings-subtitle-ux_20260417

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- Shared UI library: ui/ at project root, not inside entrypoints — reusable across popup, options, and content.
- No barrel export: Import directly from @/ui/ComponentName to enable tree-shaking.
- Input component from shared UI library doesn't have a `label` prop - must add manual `<label>` elements with `htmlFor` attribute.
- CSS-only: All animations in animations.css, no runtime JS libraries.
- GPU-accelerated: Only transform and opacity in keyframes (never top/left/width/height).
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged`.
- Deep merge for nested settings objects (provider, subtitleSettings) — handle separately to avoid losing fields on partial updates.
- Subtitle interception timeout extended to 30s for slow local LLM support.
- Overlay `z-index` + `opacity` both need setting for visibility.
- `all: revert` in subtitle.css prevents host page style pollution.

---

<!-- Learnings from implementation will be appended below -->
