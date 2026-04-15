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

## [2026-04-16 00:45] - Phase 1 Task 1: Add Cache Configuration card to AdvancedSection
- **Implemented:** Added Cache Configuration card with three number inputs (cacheTTLDays, maxCacheSizeMB, maxBatchChars) below existing Translation Cache display card
- **Files changed:** entrypoints/options/sections/AdvancedSection.tsx
- **Commit:** b81178f
- **Learnings:**
  - Patterns: Input component from shared UI library doesn't have a `label` prop - must add manual `<label>` elements with `htmlFor` attribute
  - Gotchas: Number inputs return string values from `e.target.value` - must convert to `Number()` before setting state to avoid TypeScript errors
  - Context: Settings store uses selector pattern `useSettingsStore((s) => s.updateSettings)` - need to mock both selector and direct calls in tests

## [2026-04-16 00:48] - Phase 1 Task 2: Implement validation logic
- **Implemented:** Added validation for all three inputs with min/max bounds and visual error state
- **Files changed:** entrypoints/options/sections/AdvancedSection.tsx
- **Commit:** b81178f
- **Learnings:**
  - Patterns: Validation on blur (not on change) allows users to type freely without immediate error feedback
  - Gotchas: Error state uses Input component's `error` prop which displays error message below the input
  - Context: Validation prevents saving invalid values to chrome.storage.local

## [2026-04-16 00:49] - Phase 1 Task 3: Implement auto-save behavior
- **Implemented:** Added onBlur handlers that call updateSettings with validated values
- **Files changed:** entrypoints/options/sections/AdvancedSection.tsx
- **Commit:** b81178f
- **Learnings:**
  - Patterns: Auto-save on blur eliminates need for explicit save button - existing "Auto-saved" badge in sidebar provides feedback
  - Gotchas: Need local state for inputs to allow typing without immediately updating settings store
  - Context: useEffect syncs local state with settings store to handle reset/import scenarios

## [2026-04-16 00:50] - Phase 2 Task 1: Write unit tests
- **Implemented:** Created AdvancedSection.test.tsx with 13 test cases covering rendering, validation, and auto-save
- **Files changed:** entrypoints/options/__tests__/AdvancedSection.test.tsx
- **Commit:** 848e625
- **Learnings:**
  - Patterns: Mock settings store with selector support using `mockImplementation((selector) => typeof selector === 'function' ? selector(store) : store)`
  - Gotchas: ToastProvider mock must be outside beforeEach to avoid reference errors - use inline `vi.fn()` in mock factory
  - Context: Test file uses @testing-library/react for component testing - `fireEvent.blur()` triggers blur handlers
