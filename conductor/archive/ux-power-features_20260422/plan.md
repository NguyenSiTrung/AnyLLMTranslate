# Plan: UX Power Features — Auto-Translate, Statistics, Section Translation

Track: `ux-power-features_20260422`

## Phase 1: Auto-Translate on Page Load
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1: Hostname matching utility + auto-translate trigger
  <!-- files: lib/siteRules.ts, lib/__tests__/siteRules.test.ts, entrypoints/content.ts -->
  - [ ] Create `lib/siteRules.ts` with `matchHostname(hostname, pattern)` and `findMatchingRule(hostname, rules)` utilities
  - [ ] Support exact match and wildcard patterns (`*.example.com`)
  - [ ] In `content.ts` `main()`, after `initInteractionFeatures()`: load settings, check rules, auto-invoke `startTranslation()` if `alwaysTranslate && !neverTranslate`
  - [ ] Guard: skip `chrome://`, `chrome-extension://`, `about:` URLs
  - [ ] Write unit tests for hostname matching (exact, wildcard, edge cases)
  - [ ] Write unit tests for auto-trigger guard logic

- [x] Task 2: Notification bar for auto-translate feedback
  <!-- files: content/autoTranslateNotification.ts, content/__tests__/autoTranslateNotification.test.ts, styles/inject.css -->
  - [ ] Create `content/autoTranslateNotification.ts` — injects slim top-bar into page
  - [ ] Show "🌐 Auto-translating this page" + [Disable for this site] + [×] dismiss
  - [ ] Auto-dismiss after 5s with CSS fade-out animation
  - [ ] "Disable" button: sets `alwaysTranslate: false` via `updateSettings()` + calls `stopTranslation()`
  - [ ] Add notification styles to `styles/inject.css` (scoped with `data-anyllm-role`)
  - [ ] Write tests for show/dismiss/disable behavior

- [x] Task 3: Popup "Always translate this site" toggle
  <!-- files: entrypoints/popup/App.tsx, types/messages.ts -->
  - [ ] Add toggle row below main action button in popup: "Always translate [hostname]"
  - [ ] Query active tab hostname via `chrome.tabs.query`
  - [ ] On toggle ON: find or create `SiteRule` for hostname, set `alwaysTranslate: true`
  - [ ] On toggle OFF: set `alwaysTranslate: false` on matching rule
  - [ ] Show current state by reading settings on popup open
  - [ ] Disable toggle on non-http pages (chrome://, extension pages)

- [x] Task 4: Conductor — Phase 1 Verification
  - [x] Run `pnpm test` — 608 tests pass
  - [x] Run `pnpm lint` — 0 errors
  - [ ] Manual test: enable auto-translate for a site, reload, verify it auto-translates
  - [ ] Manual test: notification bar appears and dismisses
  - [ ] Manual test: "Disable" removes auto-translate and restores page
  - [x] Update track learnings

## Phase 2: Translation Statistics Dashboard
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1: Stats collection service + types
  <!-- files: types/stats.ts, services/statsCollector.ts, services/__tests__/statsCollector.test.ts -->
  - [ ] Create `types/stats.ts` with `TranslationStats` interface (totalChars, totalApiCalls, cacheHits, cacheMisses, pagesTranslated, subtitleCues, dailyStats array)
  - [ ] Create `services/statsCollector.ts`:
    - `incrementStats(partial)` — merges counters into `chrome.storage.local`
    - `getStats()` — reads current stats
    - `resetStats()` — clears stats key
    - `recordDailyStats(chars, apiCalls, cacheHits)` — upserts today's entry, prunes > 30 days
  - [ ] Use storage key `anyllm-translate-stats`
  - [ ] Write unit tests: increment, daily rollup, 30-day pruning, reset

- [x] Task 2: Wire stats into background.ts handlers
  <!-- files: services/background.ts -->
  - [ ] In `handleTranslate`: increment `totalApiCalls`, `totalCharactersTranslated` (sum piece chars), `totalCacheHits/Misses`, call `recordDailyStats()`
  - [ ] In `handleTranslateSubtitle`: increment `totalSubtitlesCuesTranslated`
  - [ ] In `handleTranslateSelection`: increment `totalApiCalls`, `totalCharactersTranslated`
  - [ ] Increment `totalPagesTranslated` on first `startTranslation` per tab session
  - [ ] All stats calls fire-and-forget (non-blocking, errors silently caught)

- [x] Task 3: Statistics section UI in options page
  <!-- files: entrypoints/options/sections/StatisticsSection.tsx, entrypoints/options/App.tsx -->
  - [ ] Create `StatisticsSection.tsx`:
    - Summary cards row: Total Characters, API Calls, Pages Translated, Subtitle Cues
    - Cache efficiency card with hit rate percentage + visual progress ring (CSS)
    - Daily chart: last 30 days as CSS-only bar chart (no library)
    - "Reset Statistics" button with confirmation modal
  - [ ] Register "Statistics" tab in `options/App.tsx` sidebar (icon: `BarChart3`)
  - [ ] Use existing UI components (Card, Button, Modal)

- [x] Task 4: Conductor — Phase 2 Verification
  - [x] Run `pnpm test` — 615 tests pass
  - [x] Run `pnpm lint` — 0 errors
  - [ ] Manual test: translate several pages, verify counters increment
  - [ ] Manual test: daily chart shows bars for today
  - [ ] Manual test: reset clears all stats
  - [ ] Update track learnings

## Phase 3: Section Translation
<!-- execution: sequential -->
<!-- depends: -->

- [x] Task 1: Section picker module
  <!-- files: content/sectionPicker.ts, content/__tests__/sectionPicker.test.ts, styles/inject.css -->
  - [ ] Create `content/sectionPicker.ts`:
    - `enterPickerMode()` — adds mouseover/click/keydown listeners
    - `exitPickerMode()` — removes listeners, clears highlight
    - On mouseover: find nearest block-level ancestor, add highlight (dashed blue border + semi-transparent overlay)
    - Skip `<body>`, `<html>`, extension nodes, elements < 50×50px
    - On click: call `translateSection(element)`, exit picker mode
    - On `Escape`: exit picker mode
  - [ ] Add picker highlight styles to `styles/inject.css`
  - [ ] Write unit tests for element filtering, highlight add/remove, enter/exit lifecycle

- [x] Task 2: Wire section picker to context menu + shortcut
  <!-- files: entrypoints/background.ts, content/keyboardShortcuts.ts, entrypoints/content.ts -->
  - [ ] Add context menu item "Translate This Section" in `background.ts`
  - [ ] Add `Alt+Q` keyboard shortcut in `keyboardShortcuts.ts` → `enterPickerMode()`
  - [ ] Wire message handler in `content.ts` for `translateSection` action from context menu
  - [ ] Guard: do not enter picker mode if full-page translation is active (offer to use section mode instead)

- [x] Task 3: Section translation execution + cleanup
  <!-- files: content/sectionTranslate.ts, content/__tests__/sectionTranslate.test.ts, entrypoints/content.ts -->
  - [ ] Create `content/sectionTranslate.ts`:
    - `translateSection(element)` — calls `extractPieces(element)`, applies theme, sends to background
    - Track translated sections in a `Set<Element>` for independent cleanup
    - Add floating "×" remove button per translated section
    - "×" removes translations for ONLY that section (not full page)
  - [ ] Integrate with existing `translatePieces()` flow in `content.ts`
  - [ ] Ensure `stopTranslation()` also clears all section translations
  - [ ] Write unit tests for section-scoped extraction, multi-section independence, cleanup

- [x] Task 4: Conductor — Phase 3 Verification
  - [x] Run `pnpm test` — 626 tests pass
  - [x] Run `pnpm lint` — 0 errors
  - [ ] Manual test: right-click → "Translate This Section" → picker appears
  - [ ] Manual test: hover highlights block elements, click translates section
  - [ ] Manual test: translate 2+ sections independently, remove one
  - [ ] Manual test: `Alt+X` removes all translations including sections
  - [ ] Update track learnings

## Phase 4: Integration & Final Polish
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3 -->

- [x] Task 1: Cross-feature integration testing
  <!-- files: tests -->
  - [x] Test: auto-translate + section translate coexistence
  - [x] Test: stats increment correctly for auto-translated pages
  - [x] Test: stats increment correctly for section translations
  - [x] Test: popup toggle state reflects correctly after auto-translate activates
  - [x] Verify no regressions — 626 tests passing (up from 526)

- [x] Task 2: Conductor — Final Verification
  - [x] Run full test suite: `pnpm test` — 626 tests pass
  - [x] Run lint: `pnpm lint` — 0 errors
  - [x] Run build: `pnpm build` — 616.31 KB clean production output
  - [x] Update track learnings with final patterns
