# Track Learnings: pdf-perf-overhaul_20260612

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

---

<!-- Learnings from implementation will be appended below -->
