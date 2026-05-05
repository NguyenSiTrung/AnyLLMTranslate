# Track Learnings: bilingual-display-ux_20260505

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- `DisplayMode` (`bilingual-below` / `translation-only`) is distinct from `PageState` (`dual` / `translation-only` / `off`); keep mapping explicit.
- `setPageState('off')` sets `data-anyllm-state="off"` rather than removing the attribute.
- Host page CSS can overpower extension display rules; hiding originals and restoring translated node display often needs scoped `!important`.
- Content theme CSS must be imported via `@/styles/inject.css` and injected through WXT manifest mode.
- In-place translation updates should find elements by piece id, swap loading/error classes, set `textContent`, and re-trigger animation only when needed.
- ViewportObserver already batches visible pieces with a 100ms delay; preserve this behavior while improving status semantics.
- Settings sync flows rely on chrome.storage change listeners across popup, options, and content script contexts.
- Theme previews should use real `data-anyllm-theme` / `data-anyllm-state` attributes and actual injected theme CSS for fidelity.
- All extension CSS/classes/data attributes must keep the `anyllm-` / `data-anyllm-*` prefix.
- Tests that assert raw theme CSS selectors in `styles/__tests__/themes.test.ts` may need updates when changing `styles/inject.css`.

---

<!-- Learnings from implementation will be appended below -->
