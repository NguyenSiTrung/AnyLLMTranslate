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

## [2026-04-18 15:00] - All Phases Complete
- **Implemented:** All 5 phases — bug fixes, section restructuring, visual polish, micro-interactions, verification
- **Files changed:** App.tsx, ThemePreview.tsx, Card.tsx, GeneralSection, ProviderSection, ThemesSection, DictionarySection, SiteRulesSection, SubtitlesSection, ShortcutsSection, AdvancedSection + 2 test files
- **Learnings:**
  - Patterns: Merging cards uses `border-t border-zinc-800 pt-4` as visual divider within a single Card
  - Patterns: Sub-group labels use `text-[10px] uppercase tracking-widest text-zinc-600` for category headers within controls
  - Patterns: `motion-reduce:hover:translate-y-0` Tailwind class respects `prefers-reduced-motion` without needing extra CSS
  - Patterns: Cap stagger delays with `Math.min(idx, 5)` to prevent 1.5s+ entrance delays on large lists
  - Gotchas: Changing ThemePreview sample text requires updating ThemePreview.test.tsx assertions for both `getByText` and `toHaveTextContent`
  - Gotchas: Merging card titles requires updating test assertions (`screen.getByText('Cache Configuration')` → `'Cache Management'`)
---
