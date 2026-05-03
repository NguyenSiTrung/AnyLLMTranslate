# Track Learnings: audit-fixes_20260503

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- **Semaphore pattern is correct** — `acquireSemaphore` called before `try`, so throwing doesn't double-release. (from: audit, 2026-05-03)
- **MV3 lifecycle** — in-progress translations are lost on SW termination; inherent MV3 limitation, handled gracefully. (from: audit, 2026-05-03)
- **CSS-only spinner** via `::before` pseudo-element with border-trick — keeps DOM clean. (from: patterns.md)
- **In-place DOM update**: find by pieceId → swap class + set textContent → force reflow via `el.offsetHeight`. (from: patterns.md)
- **Chrome alarms persist across MV3 SW restarts** — use for periodic background tasks. (from: patterns.md)
- **Debounce LRU writes** with Map + setTimeout: Map gives per-key dedup, snapshot+clear before async flush prevents races. (from: patterns.md)
- **WXT MAIN world injection** uses `world: 'MAIN'` and `run_at: 'document_start'` in wxt.config.ts. (from: patterns.md)
- **Deep merge for nested settings** needed at load, update, and onChanged boundaries. (from: patterns.md)
- **Content-script re-injection guard** via `window.__anyllmTranslateInitialized` flag. (from: patterns.md)
- **XHR responseText override** via `Object.defineProperty` needs `configurable: true`. (from: patterns.md)

---

<!-- Learnings from implementation will be appended below -->
