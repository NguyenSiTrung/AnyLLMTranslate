# Track Learnings: settings-ux-audit_20260506

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- Shared UI library: ui/ at project root, not inside entrypoints — reusable across popup, options, and content. (from: phase5-settings-ux_20260410)
- No barrel export: Import directly from @/ui/ComponentName to enable tree-shaking. (from: phase5-settings-ux_20260410)
- forwardRef: Only Button uses forwardRef (needed by Modal focus trap). Other components don't need it. (from: phase5-settings-ux_20260410)
- CSS-only: All animations in animations.css, no runtime JS libraries. (from: phase5-settings-ux_20260410)
- Merging cards uses `border-t border-zinc-800 pt-4` as visual divider within a single Card. (from: settings-ux-polish_20260418)
- Sub-group labels use `text-[10px] uppercase tracking-widest text-zinc-600` for category headers. (from: settings-ux-polish_20260418)
- `motion-reduce:hover:translate-y-0` Tailwind class respects prefers-reduced-motion. (from: settings-ux-polish_20260418)
- Cap stagger delays with `Math.min(idx, 5)` to prevent 1.5s+ entrance delays on large lists. (from: settings-ux-polish_20260418)
- Parent toggle gates child sub-toggles with `opacity-40 pointer-events-none` for visual hierarchy. (from: theme-context_20260422)
- Input component from shared UI library doesn't have a `label` prop - must add manual `<label>` elements with `htmlFor` attribute. (from: cache-settings-ui_20260416)

---

<!-- Learnings from implementation will be appended below -->
