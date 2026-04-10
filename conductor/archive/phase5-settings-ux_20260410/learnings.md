# Phase 5 — Settings UI/UX Overhaul — Learnings

## Architecture Decisions

### Shared UI Library (`ui/` directory)
- **Location**: `ui/` at project root, not inside entrypoints — reusable across popup, options, and content
- **Pattern**: Each component is a single file export with typed props interface
- **forwardRef**: Only Button uses forwardRef (needed by Modal focus trap). Other components don't need it.
- **No barrel export**: Import directly from `@/ui/ComponentName` to enable tree-shaking

### CSS Animation Strategy
- **CSS-only**: All animations in `animations.css`, no runtime JS libraries
- **GPU-accelerated**: Only `transform` and `opacity` in keyframes (never top/left/width/height)
- **Stagger utility**: `--stagger-delay` CSS custom property × 30ms per item
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables all animations
- **Keyframes referenced in inline styles**: Toast uses `animate-[fadeOut_200ms...]` Tailwind arbitrary syntax

### Toast Architecture
- **Context-based**: `ToastProvider` wraps app, `useToast()` hook for imperative API
- **Auto-dismiss**: Each toast has a timer (default 4s), exit animation before removal
- **Position**: Fixed bottom-right, stacked with gap-2
- **No external state management**: Self-contained useState, no Zustand integration needed

### Modal Focus Trap
- Captures Tab/Shift+Tab cycling between focusable elements
- Escape key dismisses
- Backdrop click dismisses
- Confirms button gets initial focus via ref

## Patterns Discovered

### Section Header Pattern
Every section uses a `<Card accent="blue">` with icon + title + description as its header.
This is a repeated pattern that could be extracted into a `SectionHeader` component in the future.

### Grouped Sidebar Navigation
- 4 groups: DISPLAY, TRANSLATION, MEDIA, SYSTEM
- Roving tabindex: only active tab has tabindex=0
- Arrow keys navigate between tabs (wrapping)
- Active indicator: right-side blue bar with slide animation

### Auto-Save Feedback
- Subscribe to Zustand store changes at App level
- Show "Auto-saved" badge with fade-in/out (2s timer)
- No explicit save button needed — all changes persist immediately

## Build Impact
- Options chunk grew from ~56KB to ~60KB (4KB for 13 new components)
- CSS grew from ~40KB to ~45KB (5KB for animations + component styles)  
- Total bundle: 424KB (slightly over 400KB target, but 197KB is languages data alone)

## Testing Notes
- 31 new tests for UI components (23 primitives + 8 toast/modal)
- Total test count: 370 tests across 30 files
- Toast auto-dismiss test: avoid `vi.advanceTimersByTime` without `vi.useFakeTimers()` — use high duration instead
