# Track Learnings: category-override_20260423

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- Background service worker is stateless per-session (tab states in memory Map, recreated on service worker restart). Cache is persistent via IndexedDB.
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged` for cross-context updates (popup ↔ options ↔ content).
- Parent toggle gates child sub-toggles with `opacity-40 pointer-events-none` for visual hierarchy.
- Adding fields to `ExtensionSettings` requires updating `extractSettings()` in Zustand store — otherwise persistence/export silently drops new fields.
- PageContext extraction should be <10ms: only DOM queries (title, meta, hostname), zero network calls.
- Domain-to-category heuristic map for ~30 top domains — no LLM call needed for category detection.
- Fire-and-forget stats with `.catch(() => {})` — non-blocking, never interfere with translation pipeline.
- Per-tab session tracking via `Set<number>` for `totalPagesTranslated` — cleared on `restore` action.
- `chrome.runtime.sendMessage` mock must return a Promise (`.mockResolvedValue(undefined)`) — source code calls `.catch()` on the result.

---

<!-- Learnings from implementation will be appended below -->
