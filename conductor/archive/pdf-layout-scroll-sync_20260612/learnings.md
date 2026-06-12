# Track Learnings: pdf-layout-scroll-sync_20260612

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- IntersectionObserver root must be the scroll pane (`[data-pane="right"]`), not the inner content wrapper — regression test exists in `usePdfPageTranslations.test.tsx`.
- `useEffect` dependency arrays with state that changes frequently (like a Map of translation results) cause the effect to re-run excessively — use `useRef` to hold the latest value and remove from deps.
- PDF.js `page.getTextContent()` is async but CPU-bound — avoid calling it for all pages eagerly.
- `getCachedTranslation` returns `null` on miss (not `undefined`) — guard with `!== null`.
- LLM translates by piece `id` (Map key), but cache reads/writes use piece `text` as lookup key.
- In-process semaphore pattern: `maxConcurrent` slots + `maxQueue` waiting promises; always release in `finally`.
- GPU-accelerated CSS: Only transform and opacity in keyframes (never top/left/width/height).
- Validator execution order: `tsc` → `eslint` → `vitest` → `wxt build`.
- **New Pattern (Spam Mitigation)**: For viewport-based lazy loading / IntersectionObserver to work effectively without spamming API requests on mount, scrollable placeholders (slots) in the target pane must have minimum heights (`minHeight`) matching the source items (pages). Without matching heights, they collapse and stack in the initial viewport/buffer, triggering intersection triggers for all pages simultaneously.

---

<!-- Learnings from implementation will be appended below -->

## [2026-06-12 18:35] - Phase 2 & 3 Completion: Symmetrical Widths, Progress Pill, and Scroll Sync
- **Implemented:**
  - Constrained translation slots width dynamically to match original pages (`width: widthStyle`) and centered them.
  - Moved progress indicator pill from scrolling container to persistent header using the new `headerExtra` prop in `ViewerLayout`.
  - Simplified `useSynchronizedScroll` to scroll 1-to-1 if scroll heights are matched.
- **Files changed:**
  - `entrypoints/pdf-viewer/App.tsx`
  - `entrypoints/pdf-viewer/components/ViewerLayout.tsx`
  - `entrypoints/pdf-viewer/style.css`
  - `entrypoints/pdf-viewer/hooks/useSynchronizedScroll.ts`
- **Learnings:**
  - Gotchas: When aligning layout symmetrically, elements styled with `display: flex; flex-direction: column;` will default to 100% width of the parent flex container if width is not explicitly specified. Setting the width constraints on the outer wrapper matches the dimensions perfectly.
  - Patterns: Placing progress states or page indicators in a sticky/persistent header on the right prevents scroll heights from mismatching between left and right scroll containers, which dramatically simplifies scroll synchronization logic.
