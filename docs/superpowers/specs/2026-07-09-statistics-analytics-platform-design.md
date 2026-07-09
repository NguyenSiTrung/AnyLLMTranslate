# Statistics Analytics Platform Design

**Status:** Approved (2026-07-09)  
**Track:** Settings → Statistics full local analytics platform (option 4)  
**Beads:** ALT-88u  
**Supersedes (UI ambition):** hybrid polish in `2026-05-06-statistics-tab-hybrid-polish-design.md` — keep its a11y/correctness lessons; this design replaces the product surface and data model.

## Overview

Turn Settings → Statistics into a full **local-only analytics dashboard**: multi-period KPIs, activity charts, cache efficiency insights, breakdowns by mode / provider / host / language pair, export, retention, and privacy controls.

Today the tab is a light usage view over lifetime counters plus a 30-day character chart (`StatisticsSection.tsx`, `statsCollector.ts`, v1 `TranslationStats`). Option 4 requires a **schema v2**, richer **recording**, **IndexedDB** for dimensional daily series, and a redesigned **dashboard UI**.

## Goals

- Trustworthy usage dashboard: lifetime totals + period views (7d / 30d / 90d / all-time).
- Breakdowns: translation mode, provider, top hosts, language pairs.
- Export aggregates (JSON + CSV) — never page text or API keys.
- Retention for daily detail (default 90 days); lifetime totals retained until reset.
- Privacy-first: all data on-device; clear copy; host tracking toggle.
- Visual quality aligned with Advanced / General (cyan/teal primary, no purple, skeletons, empty states).
- Preserve and extend May polish: no zero-flash while loading, accessible charts, serialized resets.

## Non-Goals

- Remote telemetry, accounts, or server-side analytics.
- Per-URL or page-content logging.
- Live charts outside the options page.
- Third-party chart libraries (CSS/SVG only).
- Changing translation behavior — analytics only **observes** existing paths.
- Unlimited retention or unbounded host maps (hard caps required).

## Architecture

### Recommended model: daily dimensional series + lifetime counters

| Store | Contents | Rationale |
|-------|----------|-----------|
| `chrome.storage.local` key `anyllm-translate-stats` | Schema **v2** summary: `lifetime`, meta, preferences, compact recent daily totals for fast paint | Small; works with existing `onChanged` live update pattern |
| IndexedDB store via `idb-keyval`, database name `anyllm-stats` | Full **daily dimensional** records for the retention window (key = date `YYYY-MM-DD`) | Avoids `chrome.storage` quota blowups from host/language maps |

**Rejected alternatives:**

- **Separate lifetime-only maps without daily series** — cannot filter “last 7 days by host” or prior-period deltas.
- **Append-only event log** — flexible but too heavy for MV3 + typical extension storage patterns for this product stage.

### Single write API

Replace ad-hoc `incrementStats` + `recordDailyStats` call sites with one serialized API:

```ts
recordUsage(event: {
  mode: TranslationMode;
  characters: number;       // LLM-bound (uncached) chars this event
  apiCalls: number;
  cacheHits: number;
  cacheMisses?: number;
  cacheCharacters?: number; // chars served from cache
  pageSession?: boolean;    // true once per tab session start
  subtitleCues?: number;
  providerId?: string;
  host?: string;            // normalized domain only
  sourceLanguage?: string;
  targetLanguage?: string;
}): Promise<void>
```

The existing stats **update chain** must serialize all writes (including reset) so concurrent page/subtitle/selection events cannot race.

## Data Model

### Types (canonical)

```ts
type TranslationMode = 'page' | 'subtitle' | 'selection' | 'inline' | 'pdf';

interface StatCounters {
  characters: number;
  apiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  cacheCharacters: number;
  pageSessions: number;
  subtitleCues: number;
  selectionEvents: number;
  inlineEvents: number;
  pdfEvents: number;
}

interface DailyStatRecord {
  date: string; // YYYY-MM-DD in local calendar
  totals: StatCounters;
  byMode: Partial<Record<TranslationMode, Partial<StatCounters>>>;
  byProvider: Record<string, Partial<StatCounters>>;
  byHost: Record<string, Partial<StatCounters>>;
  byLanguagePair: Record<string, Partial<StatCounters>>; // "en>vi"
}

interface StatsPreferences {
  hostTrackingEnabled: boolean;
  retentionDays: 30 | 90 | 180;
}

interface TranslationStatsV2 {
  version: 2;
  trackingSince: string; // ISO
  lastActiveAt: string | null;
  lifetime: StatCounters;
  /** Denormalized last 30 local days of totals for fast options paint; always maintained on write. */
  recentDailySummary: Array<{ date: string; totals: StatCounters }>;
  preferences: StatsPreferences;
}
```

### Derived (read-time only)

Do **not** maintain separate write paths for:

- Peak day
- Period vs previous-period deltas
- Top-N hosts / providers / language pairs
- Insight chips (“cache served X% of lookups”)

Derive from lifetime + IDB daily records in pure helpers.

### Hard caps

| Cap | Value |
|-----|--------|
| Daily detail retention | User preference: 30 / **90 (default)** / 180 |
| Hosts stored per day | Top **25** by `characters` after merge; remainder → `__other__` |
| Language pairs per day | Top **40** by `characters`; remainder → `__other__` |
| Providers per day | All observed pool ids (small N); unknown → `unknown` |
| Export range | Lifetime summary + daily detail within retention |

### Key normalization

| Field | Rule |
|-------|------|
| `host` | Hostname lowercased, strip leading `www.`; never path/query/fragment. Omit if missing or host tracking disabled. |
| `providerId` | Pool provider entry `id` when known; else legacy single-provider sentinel or `unknown`. |
| Language pair | `${source}>${target}`; `auto` allowed as source. |
| Date keys | Local calendar `YYYY-MM-DD` (match current `en-CA` local day behavior in `recordDailyStats`). |

### Empty counters

Provide `ZERO_COUNTERS` / merge helpers so partial updates never leave `undefined` arithmetic.

## Collection

### Wire points

| Path | `mode` | Notes |
|------|--------|--------|
| Page batch translate | `page` | Tab host; message languages; provider best-effort; page session flag once per tab |
| Subtitle chunk translate | `subtitle` | Host of video page; langs; provider; cue counts |
| Selection / hover / dictionary | `selection` | Host; langs; increment `selectionEvents` |
| Inline translate (if distinct handler) | `inline` | Host; langs; `inlineEvents` |
| PDF translate | `pdf` | Host or `pdf` sentinel; langs; `pdfEvents` |
| Cache hit paths | same mode as request | `cacheHits` + `cacheCharacters`; no LLM `characters` / `apiCalls` for pure cache serves |

### Cache miss completeness

When a cache lookup fails and an API call is planned, increment `cacheMisses`. Prefer accurate misses over leaving miss counts incomplete (v1 is incomplete in places).

### Provider attribution

Best-effort from pool selection / active provider id. Never block translation if provider id is unavailable.

### Host attribution

Best-effort from `sender.tab.url` or message context. If unparsable, omit host dimension for that event.

### Fire-and-forget policy

Keep recording non-blocking for translation latency (`.catch(() => {})` at call sites is fine). Failures must not fail the translate response. Optionally surface a debug log when `debugMode` is on.

## Migration (v1 → v2)

v1 shape (`types/stats.ts` today):

- `totalCharactersTranslated`, `totalApiCalls`, `totalCacheHits`, `totalCacheMisses`
- `totalPagesTranslated`, `totalSubtitlesCuesTranslated`
- `dailyStats: { date, chars, apiCalls, cacheHits }[]`

Migration steps:

1. Detect missing `version` or `version !== 2`.
2. Map lifetime fields into `StatCounters` (new fields start at `0`).
3. Write each v1 daily row into IDB as `DailyStatRecord` with **totals only** (empty dimension maps).
4. Set `version: 2`, `trackingSince` = earliest daily date or now, `lastActiveAt` from latest activity if any.
5. Default preferences: `hostTrackingEnabled: true`, `retentionDays: 90`.
6. Build `recentDailySummary` from available days.
7. Persist v2 summary; do not leave dual schemas long-term (single read path after migrate).

`getStats()` / load path must run migration once before returning v2 data.

## Reset

`resetStats()` must:

1. Join the same serialized update queue.
2. Remove `chrome.storage.local` stats key.
3. Clear the stats IndexedDB store.
4. Leave settings, translation cache, and glossary untouched.

UI confirmation modal must restate that cache and settings are preserved.

## Query API (read path)

Pure or async helpers (e.g. `services/statsQuery.ts` / `statisticsAnalytics.ts`):

| Function | Purpose |
|----------|---------|
| `loadStatsDashboard()` | Migrate if needed; return summary + preferences |
| `loadDailyRange(from, to)` | IDB days inclusive |
| `aggregatePeriod(days, period)` | Totals for 7d / 30d / 90d / all-time |
| `previousPeriod(period)` | Prior window of equal length for deltas |
| `topN(map, n, metric)` | Hosts / providers / language pairs |
| `getCacheEfficiency(hits, misses)` | Hit rate + empty null (preserve v1 semantics) |
| `buildInsights(periodTotals, days)` | 0–3 short strings |

Period definitions:

- **7d / 30d / 90d:** last N local calendar days including today (zero-fill missing days for charts).
- **All time:** lifetime counters for KPIs; chart uses available retained daily detail only (label clearly: “Daily detail available for last N days”).

## UI Design

### Visual system

- Accent: **cyan/teal** (product primary). No purple.
- Reuse: `SectionHeader`, `Card`, `SegmentedControl`, `Badge`, `EmptyState`, `DangerZone`, `Button`, `Modal`.
- Typography: tabular nums for metrics; scannable hierarchy like Advanced overview strip.

### Information architecture

```
SectionHeader — Statistics
  “Local usage analytics for translation volume, cache efficiency, and where you translate.”

[ Period: 7d | 30d | 90d | All time ]     [ Export ▾ JSON / CSV ]

Hero strip
  Primary: characters (period) + Δ% vs previous period (when computable)
  Secondary: API calls · cache hit rate · last active
  Chip: Local only · Tracking since …

KPI grid (4–6 cards)
  LLM characters · API calls · Cache characters saved · Page sessions
  Subtitle cues · Selection events (always show both cards)
  Each: large value, short description, optional mini trend

Activity chart (≈2/3) + Cache efficiency (≈1/3)
  Chart: metric toggle (chars | requests | cache hits); today highlight; grid; peak marker;
         keyboard-focusable bars; rich aria-labels; no hover-only data
  Cache: ring, hits/misses/lookups, “~N lookups served from cache”, tone bands,
         link/hint to Advanced → cache settings

Breakdowns
  By mode | Top hosts | By provider | Language pairs
  Host panel empty-state CTA when host tracking disabled

Insights (0–3 derived chips)

Data controls
  Host tracking toggle · Retention select

Danger Zone
  Reset all statistics
```

### States

| State | Behavior |
|-------|----------|
| Loading | Skeletons for hero + KPIs + chart (never flash zeros as real data) |
| Empty | Single empty composition + guidance to start translating |
| Error | Inline error card + Retry |
| Host tracking off | Host breakdown explains toggle; other panels still work |
| All-time + short history | Chart caption notes limited daily detail window |

### Components (suggested split)

| Location | Responsibility |
|----------|----------------|
| `StatisticsSection.tsx` | Orchestration, period state, load/export/reset |
| Local presentational | `StatHero`, `StatKpiCard`, `ActivityChart`, `CacheEfficiencyCard`, `BreakdownPanel`, `StatsExportMenu` |
| `statisticsDisplay.ts` / analytics helpers | Formatting, zero-fill days, chart series, efficiency, insights |
| `services/statsCollector.ts` (+ IDB module) | Write path, migration, reset, preferences |
| `services/statsQuery.ts` (optional) | Range load + aggregates |

Extract shared pieces only when the section becomes hard to maintain; prefer local components first if they stay options-only.

### Accessibility

- Chart bars keyboard-focusable; values available without hover.
- Period control and export are labeled buttons/menus.
- SVG decorations `aria-hidden` when equivalent text exists.
- Color not sole indicator (cache tone + numeric rate).
- Focus trap retained on reset modal.

## Export

| Format | Content |
|--------|---------|
| JSON | Single object: `lifetime`, `preferences`, `trackingSince`, `lastActiveAt`, `daily: DailyStatRecord[]` for the selected period range (full dimensions) |
| CSV | One file, **daily totals only** (one row per date): `date,characters,apiCalls,cacheHits,cacheMisses,cacheCharacters,pageSessions,subtitleCues,selectionEvents,inlineEvents,pdfEvents`. Dimension detail is JSON-only in v1 of export to keep CSV simple. |

Filenames: `anyllm-stats-YYYY-MM-DD.json` / `anyllm-stats-daily-YYYY-MM-DD.csv`.

**Forbidden in exports:** API keys, glossary terms, page text, full URLs, provider secrets.

User-facing note near Export: “Local aggregates only — no page content or keys.”

## Privacy

| Preference | Default | Behavior |
|------------|---------|----------|
| Host tracking | **ON** | When OFF, stop writing `byHost`; existing host data remains until prune/reset |
| Retention | **90** | Prune IDB days older than retention on write and on preference change |

Required UI copy:

> Statistics stay on this device. Host names are stored only as site domains (e.g. youtube.com), never page content or API keys.

## Implementation Sequence

One design; sequenced delivery so each step is testable. Do not ship UI for a dimension without its collection path.

1. **Foundation** — Types, zero/merge helpers, IDB store, `recordUsage`, migration, retention prune, serialized reset.
2. **Instrumentation** — Wire all background (and any content) paths: mode, provider, host, languages, cache chars/misses.
3. **Query layer** — Period aggregates, previous period, top-N, insights, zero-filled chart days.
4. **Dashboard shell** — Period control, hero, KPIs, activity chart, cache card, loading/empty/error.
5. **Breakdowns + insights** — Mode, hosts, provider, language pairs.
6. **Controls** — Host toggle, retention, export JSON/CSV, Danger Zone reset.
7. **Verification** — Unit + component tests, a11y pass, manual options smoke.

## Testing

### Unit

- `recordUsage` merge, caps (`__other__`), host tracking off, retention prune.
- Migration v1 → v2 field mapping and daily import.
- Period aggregate and previous-period delta edge cases (empty, single day).
- Top-N and language/host normalization.
- Export builders exclude secrets; stable column order.
- Display helpers: zero-fill range, cache efficiency null vs 0%, formatters.

### Component

- Loading skeletons (no misleading zeros).
- Populated dashboard metrics.
- Empty state.
- Load error + retry.
- Period switch updates aggregates.
- Host tracking off CTA in hosts panel.
- Export triggers download (mock URL/blob).
- Reset modal confirm/cancel; success clears UI.

### Service race

- Reset serialized behind pending `recordUsage` (extend existing collector race coverage).

## Acceptance Criteria

- [ ] Schema v2 loads with migration from v1 without data loss of lifetime/daily totals.
- [ ] All translation modes contribute to lifetime and daily records when exercised.
- [ ] Period control (7d / 30d / 90d / all-time) updates hero, KPIs, chart, and breakdowns.
- [ ] Mode, provider, host, and language-pair panels show real data after corresponding usage.
- [ ] Host tracking toggle stops new host writes; other analytics continue.
- [ ] Retention prune removes daily IDB records older than selected window.
- [ ] Export JSON and CSV download aggregate-only data.
- [ ] Reset clears chrome.storage stats + IDB stats store; cache and settings intact.
- [ ] Loading never flashes zeros as if they were real totals.
- [ ] Chart remains keyboard and screen-reader accessible.
- [ ] Visual language: cyan/teal accents, no purple, consistent with Advanced/General quality.
- [ ] Automated tests cover collector, migration, query helpers, and critical UI states.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Large scope | Fixed sequence; no half-wired dimensions in UI |
| Storage growth | IDB + per-day caps + retention |
| Host sensitivity | Domain-only + toggle + privacy copy |
| Unstable provider ids | Pool `id` + `unknown` fallback |
| Missing host/lang on some messages | Best-effort omit, never invent |
| Options open latency | Summary in `chrome.storage`; lazy IDB for breakdowns |
| Translation path regressions | Recording remains fire-and-forget; tests on background stats calls |

## Open Defaults (approved)

1. Host tracking default **ON**
2. Retention default **90** days
3. Dimensional detail in **IndexedDB**; summary in **chrome.storage**
4. Modes: `page | subtitle | selection | inline | pdf`
5. No chart library
6. Product accent cyan/teal; ban purple in this UI

## Related Files (current)

- `entrypoints/options/sections/StatisticsSection.tsx`
- `entrypoints/options/sections/statisticsDisplay.ts`
- `services/statsCollector.ts`
- `types/stats.ts`
- `services/background.ts` (primary recording sites)
- `ui/*` shared components
- Prior polish: `docs/superpowers/specs/2026-05-06-statistics-tab-hybrid-polish-design.md`
