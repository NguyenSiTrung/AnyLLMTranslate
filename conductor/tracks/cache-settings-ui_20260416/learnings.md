# Track Learnings: cache-settings-ui_20260416

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### State Management
- Zustand + chrome.storage bidirectional sync: write on mutation, listen via `chrome.storage.onChanged` for cross-context updates (popup ↔ options ↔ content). (from: phase3-ux-polish_20260410)
- Deep merge for nested settings objects (provider, subtitleSettings) — handle separately to avoid losing fields on partial updates. (from: phase3-ux-polish_20260410)
- `isLoaded` flag in store prevents rendering before storage load completes — critical to avoid flash of defaults. (from: phase3-ux-polish_20260410)

### UI Components
- Shared UI library: ui/ at project root, not inside entrypoints — reusable across popup, options, and content. (from: phase5-settings-ux_20260410)
- No barrel export: Import directly from @/ui/ComponentName to enable tree-shaking. (from: phase5-settings-ux_20260410)
- forwardRef: Only Button uses forwardRef (needed by Modal focus trap). Other components don't need it. (from: phase5-settings-ux_20260410)

### Options Page
- WXT auto-discovers `entrypoints/options/` as the options page — no manifest config needed. (from: phase3-ux-polish_20260410)
- Vertical tabbed layout (sidebar + content area) with ARIA `role="tablist"` works well at 8+ sections. (from: phase3-ux-polish_20260410)

### Cache Integration
- `getCachedTranslation` returns `null` on miss (not `undefined` or falsy) — always guard with `!== null` to avoid treating a cached empty string as a miss. (from: cache-hardening_20260415)

---

<!-- Learnings from implementation will be appended below -->
