# Track Learnings: ux-power-features_20260422

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- **Architecture**: Message-passing (content ↔ background ↔ popup) via `chrome.runtime.sendMessage`
- **State**: Zustand + `chrome.storage.local` sync via `settingsStore.ts`
- **CSS Strategy**: Vanilla CSS with `data-anyllm-*` attributes for host page injection; Tailwind for extension UI only
- **Testing**: Vitest + Testing Library, AAA pattern, 522 existing tests
- **Content Script**: `defineContentScript` with SPA re-injection guard (`__anyllmTranslateInitialized`)
- **Site Rules**: `SiteRule` interface already has `alwaysTranslate` / `neverTranslate` fields in `types/config.ts`
- **DOM Walker**: `extractPieces(root)` accepts optional root element — can be used for section translation
- **Background Service**: Semaphore-based concurrency (max 3), fire-and-forget stats are safe pattern
- **Settings Update**: `updateSettings(partial)` in `lib/config.ts` for atomic partial updates

---

## [2026-04-22 16:17] - Phase 1: Auto-Translate on Page Load
- **Implemented:** Hostname matching with wildcard support, auto-translate trigger in content script, notification bar with dismiss/disable, popup toggle
- **Files changed:** lib/siteRules.ts, content/autoTranslateNotification.ts, entrypoints/content.ts, entrypoints/popup/App.tsx, styles/inject.css
- **Commit:** 429ccb8
- **Learnings:**
  - Patterns: `SiteRule` already has `alwaysTranslate`/`neverTranslate` fields — no type changes needed
  - Gotchas: Must capture `onSectionSelected` callback before calling `exitPickerMode()` since exit clears the callback
  - Context: Wildcard matching uses `endsWith` after stripping `*.` prefix

## [2026-04-22 16:17] - Phase 2: Translation Statistics Dashboard
- **Implemented:** Stats types, statsCollector service, background handler wiring, StatisticsSection UI with daily chart
- **Files changed:** types/stats.ts, services/statsCollector.ts, services/background.ts, entrypoints/options/sections/StatisticsSection.tsx, entrypoints/options/App.tsx
- **Commit:** a050c39
- **Learnings:**
  - Patterns: Fire-and-forget stats with `.catch(() => {})` — non-blocking, never interfere with translation
  - Patterns: Per-tab session tracking via `Set<number>` for `totalPagesTranslated` — cleared on `restore` action
  - Gotchas: `@typescript-eslint/no-dynamic-delete` prohibits `delete obj[key]` — use `Object.fromEntries(filter)` instead
  - Context: CSS-only bar chart with hover tooltips — no charting library needed

## [2026-04-22 16:17] - Phase 3: Section Translation
- **Implemented:** Section picker with visual highlight, section translate with dismiss buttons, context menu + Alt+Q shortcut
- **Files changed:** content/sectionPicker.ts, content/sectionTranslate.ts, content/keyboardShortcuts.ts, entrypoints/content.ts, entrypoints/background.ts, styles/inject.css
- **Commit:** 138ff6d
- **Learnings:**
  - Patterns: `extractPieces(root)` already accepts element arg — perfect for section-scoped translation
  - Gotchas: Callback must be captured BEFORE `exitPickerMode()` since exit nullifies `onSectionSelected`
  - Gotchas: Updating keyboard shortcuts count breaks existing assertion — always check test expectations
  - Context: Section picker uses capture phase listeners to intercept before page handlers

---
