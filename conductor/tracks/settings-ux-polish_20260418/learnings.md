# Track Learnings: settings-ux-polish_20260418

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- Shared UI library: ui/ at project root, not inside entrypoints — reusable across popup, options, and content. (from: phase5-settings-ux_20260410)
- No barrel export: Import directly from @/ui/ComponentName to enable tree-shaking. (from: phase5-settings-ux_20260410)
- CSS-only: All animations in animations.css, no runtime JS libraries. (from: phase5-settings-ux_20260410)
- GPU-accelerated: Only transform and opacity in keyframes (never top/left/width/height). (from: phase5-settings-ux_20260410)
- Stagger utility: --stagger-delay CSS custom property × 30ms per item. (from: phase5-settings-ux_20260410)
- Reduced motion: @media (prefers-reduced-motion: reduce) disables all animations. (from: phase5-settings-ux_20260410)
- Validation on blur (not on change) allows users to type freely without immediate error feedback. (from: cache-settings-ui_20260416)
- Component uses useSettingsStore() for automatic reactivity to theme changes. (from: theme-preview_20260410)

---

<!-- Learnings from implementation will be appended below -->
