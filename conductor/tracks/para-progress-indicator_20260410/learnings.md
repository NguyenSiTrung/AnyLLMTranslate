# Track Learnings: para-progress-indicator_20260410

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- `cssInjectionMode: 'manifest'` required for inject.css to apply on host pages — not 'ui'. (from: display-theme-fix_20260410)
- CSS animations: GPU-accelerated only (`transform` + `opacity`) — never top/left/width/height. (from: phase5-settings-ux_20260410)
- `@media (prefers-reduced-motion: reduce)` must disable all animations. (from: phase5-settings-ux_20260410)
- `parentElement.querySelector()` only searches children — use `document.querySelector()` for sibling/by-attribute lookups. (from: phase1-foundation_20260409)
- `DATA_ATTRS` constants from `@/lib/constants` used for all `data-lingua-*` attributes — don't hardcode strings. (from: translationDisplay.ts)
- Translation element inserted via `parentElement.after(translationEl)` — spinner placeholder must use the same insertion pattern. (from: translationDisplay.ts)
- `all: revert` on `.lingua-lens-translation` prevents host page CSS bleeding into translation elements. (from: inject.css)

---

<!-- Learnings from implementation will be appended below -->
