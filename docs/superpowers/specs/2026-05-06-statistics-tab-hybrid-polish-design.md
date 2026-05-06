# Statistics Tab Hybrid Polish Design

## Overview

Improve the Settings → Statistics tab with a focused Hybrid Polish pass. The tab should keep the existing dark, card-based Settings style while becoming more accurate, accessible, responsive, and trustworthy as a user-facing usage dashboard.

This work addresses the current Statistics tab issues found in `entrypoints/options/sections/StatisticsSection.tsx`, `services/statsCollector.ts`, `types/stats.ts`, and the stats recording paths in `services/background.ts`.

## Goals

- Preserve the current Settings visual language and avoid a full analytics redesign.
- Make stats loading, reset, error, empty, and live-update states explicit.
- Make the daily chart accessible and semantically accurate for the last 30 calendar days.
- Clarify metric labels so users understand what is being counted.
- Fix stats reset race behavior.
- Improve maintainability with small, testable helpers and focused components.

## Non-Goals

- Do not introduce charting dependencies.
- Do not redesign the full Settings app.
- Do not add long-range analytics, exports, filters, or custom reporting.
- Do not change unrelated cache settings in the Advanced tab.

## Recommended Approach

Use the Hybrid Polish approach:

1. Keep the current card-based layout foundation.
2. Refine hierarchy into a light dashboard:
   - KPI cards at the top.
   - Daily activity and cache efficiency as primary analytic cards.
   - A compact Danger Zone reset section at the bottom.
3. Fix correctness, accessibility, and state handling alongside the visual polish.

This is preferred over a minimal fix pass because the current chart and metrics need semantic cleanup, and preferred over a dashboard refresh because the existing Settings UI already has a consistent design system.

## UI Structure

### Header

Keep the shared `SectionHeader`:

- Title: `Statistics`
- Description: clear usage/performance messaging.
- Existing blue accent is acceptable.

### KPI Cards

Replace hardcoded repeated card markup with metric configuration plus a reusable `StatCard`.

Recommended labels:

- `LLM Characters` — fresh characters sent for LLM translation.
- `LLM Requests` — translation API/chunk requests.
- `Page Sessions` — page translation sessions counted once per tab session.
- `Subtitle Cues` — subtitle cues processed for translation.

Each KPI card should include a short helper label or tooltip-style description where useful, especially for `LLM Characters` and `Page Sessions`.

### Daily Activity

Render an accessible 30-day bar chart:

- Always render exactly 30 calendar days.
- Fill missing days with zero values.
- Sort chronologically from oldest to newest.
- Show compact localized date labels instead of raw ISO strings.
- Include `chars`, `apiCalls`, and `cacheHits` in tooltip/detail text.
- Make each bar keyboard-focusable and screen-reader-readable.

When no activity exists across all 30 days, use the shared `EmptyState` component.

### Cache Efficiency

Keep the progress ring concept, but improve the empty state:

- If there are no cache hits or misses, show a neutral “No cache activity yet” state rather than `0%`.
- If cache data exists, show hit rate, hits, misses, and total lookups.
- Add accessible labeling for the SVG ring.

### Reset / Danger Zone

Move reset into a compact destructive section:

- Title: `Danger Zone`
- Copy: explain that stats reset does not clear translation cache or settings.
- Button: `Reset Statistics`
- Disable and show loading while reset is in progress.
- Keep confirmation modal with safer cancel focus.

## State and Data Flow

`StatisticsSection` should be the orchestrator:

1. On mount, load stats from `getStats()`.
2. Show loading UI until load succeeds or fails.
3. Subscribe to `chrome.storage.onChanged` for `anyllm-translate-stats`.
4. Update local UI state when stats change while the tab is open.
5. On reset:
   - Set resetting state.
   - Call `resetStats()`.
   - Set local stats to defaults after success.
   - Close modal after success.
   - Show inline error and keep modal/action recoverable if reset fails.

Pure display transformations should live in a small testable helper module near the section, for example `entrypoints/options/sections/statisticsDisplay.ts`:

- `buildLast30Days(dailyStats, now?)`
- `formatCompactDate(date, locale?)`
- `getCacheHitRate(hits, misses)`
- `hasDailyActivity(days)`

Small presentational components should remain local to `StatisticsSection.tsx` for this pass. Extract them only if implementation makes the section difficult to read.

## Data Correctness

### Reset Race

`resetStats()` should use the same serialized update queue as `incrementStats()` and `recordDailyStats()` so reset cannot race with pending writes.

### 30-Day Semantics

Daily chart rendering should not depend on sparse stored entries. The UI should generate the 30-day range and merge stored values into it.

The UI should enforce the exact 30-day display range even if storage contains extra sparse entries. Do not change storage pruning behavior in this pass.

### Page Session Semantics

The existing `totalPagesTranslated` counter increments when page translation starts once per tab session. For this polish pass, keep that data model and rename the UI label to `Page Sessions` with helper text that explains the metric. Moving the counter to a success-only path is out of scope for this design.

## Error Handling

- Loading failure: show an inline error card with Retry.
- Reset failure: keep/reset UI recoverable and show a clear message.
- Storage change listener failure or unavailable Chrome APIs in tests: guard safely.
- Cached-empty activity should not look like poor performance.

## Accessibility

- Chart bars must be reachable by keyboard.
- Chart values must be available without hover.
- SVG cache ring must have an accessible label or be hidden with equivalent text nearby.
- Reset modal should retain existing focus-trap behavior.
- Empty/loading/error states should be expressed as text, not color alone.

## Responsiveness

- KPI grid should adapt from one column to two/four columns depending on width.
- Daily activity and cache efficiency cards may stack on narrower content widths.
- Reset row should stack text and button if needed.
- Keep compatibility with the current Options page minimum-width constraints.

## Testing

Add or update tests for:

- `resetStats()` serialization/race behavior.
- 30-day chart helper generation, sorting, zero-fill, and cutoff behavior.
- Cache hit-rate helper including empty state.
- Statistics UI loading, populated, empty, error, and reset modal states.
- Accessible chart labels or focusable bars.
- Storage change refresh behavior.

Use existing Vitest and Testing Library patterns. No new dependencies are needed.

## Acceptance Criteria

- Statistics tab no longer flashes misleading zero data while loading.
- Storage errors and reset errors are visible and recoverable.
- Daily chart renders exactly 30 chronological days with zero-filled gaps.
- Daily chart works for hover, keyboard, screen reader, and touch users.
- Cache efficiency has a neutral no-data state.
- Metric labels accurately reflect collected data.
- Reset uses serialized stats updates and cannot be undone accidentally.
- Existing Settings visual style is preserved.
- Relevant unit/component tests pass.
