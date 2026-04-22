# Spec: UX Power Features — Auto-Translate, Statistics, Section Translation

## Overview

Three user-facing features that elevate AnyLLMTranslate from "tool you click" to "tool that works for you":

1. **Auto-Translate on Page Load** — zero-click translation for saved sites
2. **Translation Statistics Dashboard** — visibility into usage, cache efficiency, and API cost
3. **Section Translation** — translate specific page sections without full-page commitment

## Functional Requirements

### FR-1: Auto-Translate on Page Load

#### FR-1.1: Popup Quick Toggle
- Add "Always translate this site" toggle in popup UI, below the main Translate button
- Toggle sets `alwaysTranslate: true` on a `SiteRule` matching current hostname
- If no `SiteRule` exists for hostname, create one with defaults + `alwaysTranslate: true`
- Toggle OFF removes the auto-translate flag (does not delete the site rule)

#### FR-1.2: Content Script Auto-Trigger
- On content script `main()`, after `initInteractionFeatures()`:
  1. Load settings → check `siteRules` for matching hostname
  2. If `alwaysTranslate === true` AND `neverTranslate === false` → auto-invoke `startTranslation()`
  3. `neverTranslate` always takes precedence over `alwaysTranslate`
- Must NOT auto-translate on extension pages (`chrome://`, `chrome-extension://`)

#### FR-1.3: Notification Bar
- When auto-translation activates, inject a slim top-bar notification:
  - Text: "🌐 Auto-translating this page" + [Disable for this site] + [×] dismiss
  - Auto-dismisses after 5 seconds with fade-out animation
  - "Disable for this site" sets `alwaysTranslate: false` via `updateSettings()` + calls `stopTranslation()`
- Notification uses extension-scoped CSS (no host page pollution)

#### FR-1.4: Site Rule Hostname Matching
- Use existing `SiteRule.hostname` matching logic
- Support exact match (`docs.python.org`) and wildcard (`*.python.org`)
- Content script extracts `window.location.hostname` for matching

### FR-2: Translation Statistics Dashboard

#### FR-2.1: Stats Collection
- Track these counters in `chrome.storage.local` under key `anyllm-translate-stats`:
  - `totalCharactersTranslated`: cumulative characters sent to LLM
  - `totalApiCalls`: number of `translate` messages handled
  - `totalCacheHits`: translations served from IndexedDB cache
  - `totalCacheMisses`: translations that required LLM call
  - `totalPagesTranslated`: unique page translation sessions
  - `totalSubtitlesCuesTranslated`: subtitle cues translated
  - `dailyStats`: array of `{ date: string, chars: number, apiCalls: number, cacheHits: number }` — rolling 30-day window
- Increment counters in `background.ts` handlers (`handleTranslate`, `handleTranslateSubtitle`, `handleTranslateSelection`)
- Daily stats entry created/updated on each API call using `new Date().toISOString().slice(0, 10)` as key

#### FR-2.2: Statistics UI (Options Page)
- New "Statistics" tab in options page sidebar (icon: `BarChart3` from Lucide)
- Display:
  - **Summary cards**: Total characters, API calls, cache hit rate (%), pages translated
  - **Cache efficiency**: hit rate as percentage with visual progress ring
  - **Daily chart**: Bar chart of characters translated per day (last 30 days) — rendered with pure CSS bars (no charting library)
  - **Reset button**: Clears all statistics with confirmation modal

#### FR-2.3: Stats Reset
- "Reset Statistics" button with confirmation modal
- Clears `anyllm-translate-stats` from storage
- Does NOT affect translation cache or settings

### FR-3: Section Translation (Translate Only This Section)

#### FR-3.1: Activation
- **Context menu**: Right-click → "Translate This Section" (new menu item)
- **Keyboard shortcut**: `Alt+Q` (page-level, configurable)
- Activation enters "section picker" mode

#### FR-3.2: Section Picker Mode
- On activation, add mouseover listener to `document.body`
- On hover: highlight the nearest block-level ancestor with a dashed blue border + semi-transparent blue overlay
- Skip elements that are: `<body>`, `<html>`, extension-injected nodes, elements smaller than 50×50px
- On click: translate the highlighted section
- On `Escape` or right-click: exit picker mode

#### FR-3.3: Section Translation Execution
- Extract pieces from the clicked element only (pass as `root` to `extractPieces()`)
- Apply theme/position/darkMode settings to page (same as full-page)
- Set page state to `dual` or `translation-only` per settings
- Track section translations independently — do NOT interfere with full-page translation state
- Multiple sections can be translated independently

#### FR-3.4: Section Cleanup
- Each translated section gets a subtle floating "×" button to remove just that section's translations
- `stopTranslation()` still removes ALL translations (sections + full-page)

## Non-Functional Requirements

- **NFR-1**: Auto-translate must add < 50ms to page load (async, non-blocking)
- **NFR-2**: Statistics storage must not exceed 100KB in `chrome.storage.local`
- **NFR-3**: Section picker must not interfere with page click handlers (use capture phase, `stopPropagation` only on our click)
- **NFR-4**: All features must work with existing 16 themes and dark mode
- **NFR-5**: All new UI must follow existing design system (Tailwind, Zinc/Blue palette, Lucide icons)

## Acceptance Criteria

- [ ] Toggling "Always translate" in popup persists across browser restart
- [ ] Auto-translated pages show notification bar that dismisses on click/timeout
- [ ] `neverTranslate` overrides `alwaysTranslate` when both set
- [ ] Statistics tab shows accurate cache hit rate after translating 3+ pages
- [ ] Daily stats chart renders for the last 30 days
- [ ] Reset statistics clears all counters without affecting cache or settings
- [ ] Right-click "Translate This Section" enters picker mode with visual highlight
- [ ] Clicking a section translates only that subtree
- [ ] Multiple sections can be translated independently
- [ ] `Alt+X` (restore page) removes all translations including sections
- [ ] All tests pass (`pnpm test`), no lint errors (`pnpm lint`)

## Out of Scope

- Language-based auto-detection (auto-translate based on detected page language)
- Estimated API cost calculation (requires per-provider pricing data)
- Section translation history / undo per-section
- Export statistics as CSV/JSON
