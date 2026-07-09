# Statistics Analytics Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Settings → Statistics as a full local analytics dashboard (schema v2, IDB dimensional dailies, `recordUsage`, period KPIs/charts/breakdowns, export, retention, privacy controls) per the approved design.

**Architecture:** Lifetime summary + preferences live in `chrome.storage.local` (`anyllm-translate-stats` v2). Full daily dimensional records live in IndexedDB (`anyllm-stats`). A single serialized `recordUsage` API replaces `incrementStats`/`recordDailyStats`. Options UI reads summary quickly, lazy-loads IDB for breakdowns, and derives period deltas/top-N/insights in pure helpers.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, `idb-keyval`, Chrome extension storage APIs, Tailwind, existing `@/ui/*` components. No chart libraries.

**Spec:** `docs/superpowers/specs/2026-07-09-statistics-analytics-platform-design.md`  
**Beads:** ALT-88u

## Global Constraints

- Local-only analytics; never log page text, full URLs, API keys, or glossary.
- Host values: lowercase hostname, strip `www.`; never path/query.
- Host tracking default **ON**; retention default **90** days (30 | 90 | 180).
- Per-day caps: top **25** hosts, top **40** language pairs; remainder → `__other__`.
- Modes: `page | subtitle | selection | inline | pdf`.
- UI accent cyan/teal; **no purple**.
- CSV export = daily totals only; JSON includes full dimensions.
- Recording must be fire-and-forget at call sites (never fail translation).
- All stats writes (including reset) go through the existing serialized update chain.
- Preserve chart keyboard a11y from hybrid polish.
- Test command: `npx vitest run <path>` (or `npm test -- <path>` if preferred); project uses `vitest run` via `npm test`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `types/stats.ts` | v1 types (kept for migration input) + v2 types, defaults, zero counters |
| `services/statsCounters.ts` | Pure merge/cap/normalize helpers for counters and dimension maps |
| `services/statsIdb.ts` | IDB get/set/entries/clear for daily records (`anyllm-stats`) |
| `services/statsCollector.ts` | `getStatsV2`, migration, `recordUsage`, preferences, reset, chain |
| `services/statsQuery.ts` | Period windows, aggregates, top-N, previous period, insights |
| `services/statsExport.ts` | JSON/CSV builders + download helpers |
| `entrypoints/options/sections/statisticsDisplay.ts` | UI formatters, zero-fill chart days, cache efficiency (extend) |
| `entrypoints/options/sections/StatisticsSection.tsx` | Dashboard orchestration + local presentational components |
| `services/background.ts` | Replace increment/recordDaily call sites with `recordUsage` |
| `lib/constants.ts` | Optional: add `STATS_DB` / `STATS_STORE` keys |
| Tests under `services/__tests__/` and `entrypoints/options/sections/__tests__/` | TDD coverage |

**Deprecated after Task 4 (call sites gone):** public use of `incrementStats` and `recordDailyStats`. Keep thin wrappers temporarily only if needed for mid-migration compile, then delete.

---

### Task 1: Stats v2 types and pure counter helpers

**Files:**
- Modify: `types/stats.ts`
- Create: `services/statsCounters.ts`
- Create: `services/__tests__/statsCounters.test.ts`

**Interfaces:**
- Produces:
  - `TranslationMode`, `StatCounters`, `DailyStatRecord`, `StatsPreferences`, `TranslationStatsV2`
  - `ZERO_COUNTERS`, `DEFAULT_STATS_V2`
  - `mergeCounters(a, b): StatCounters`
  - `addPartialCounters(base, partial): StatCounters`
  - `normalizeHost(host: string | undefined): string | undefined`
  - `languagePairKey(source: string, target: string): string`
  - `mergeDimensionMap(map, key, partial, maxKeys): Record<string, Partial<StatCounters>>`
  - Keep v1 `TranslationStats` / `DEFAULT_STATS` / `DailyStat` for migration input

- [ ] **Step 1: Write failing tests for pure helpers**

Create `services/__tests__/statsCounters.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ZERO_COUNTERS,
  mergeCounters,
  addPartialCounters,
  normalizeHost,
  languagePairKey,
  mergeDimensionMap,
} from '../statsCounters';

describe('statsCounters', () => {
  it('mergeCounters sums all fields', () => {
    const a = { ...ZERO_COUNTERS, characters: 10, apiCalls: 1 };
    const b = { ...ZERO_COUNTERS, characters: 5, cacheHits: 2 };
    expect(mergeCounters(a, b).characters).toBe(15);
    expect(mergeCounters(a, b).apiCalls).toBe(1);
    expect(mergeCounters(a, b).cacheHits).toBe(2);
  });

  it('normalizeHost lowercases and strips www', () => {
    expect(normalizeHost('WWW.YouTube.com')).toBe('youtube.com');
    expect(normalizeHost(undefined)).toBeUndefined();
    expect(normalizeHost('')).toBeUndefined();
  });

  it('languagePairKey joins source and target', () => {
    expect(languagePairKey('auto', 'vi')).toBe('auto>vi');
  });

  it('mergeDimensionMap rolls excess keys into __other__ by characters', () => {
    const map: Record<string, Partial<typeof ZERO_COUNTERS>> = {};
    let next = map;
    for (let i = 0; i < 27; i++) {
      next = mergeDimensionMap(next, `host${i}.com`, { characters: i + 1 }, 25);
    }
    expect(Object.keys(next).length).toBeLessThanOrEqual(26); // 25 + __other__
    expect(next.__other__).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run services/__tests__/statsCounters.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement types + helpers**

`types/stats.ts` — append v2 types; keep v1 exports:

```ts
export type TranslationMode = 'page' | 'subtitle' | 'selection' | 'inline' | 'pdf';

export interface StatCounters {
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

export interface DailyStatRecord {
  date: string;
  totals: StatCounters;
  byMode: Partial<Record<TranslationMode, Partial<StatCounters>>>;
  byProvider: Record<string, Partial<StatCounters>>;
  byHost: Record<string, Partial<StatCounters>>;
  byLanguagePair: Record<string, Partial<StatCounters>>;
}

export interface StatsPreferences {
  hostTrackingEnabled: boolean;
  retentionDays: 30 | 90 | 180;
}

export interface TranslationStatsV2 {
  version: 2;
  trackingSince: string;
  lastActiveAt: string | null;
  lifetime: StatCounters;
  recentDailySummary: Array<{ date: string; totals: StatCounters }>;
  preferences: StatsPreferences;
}

export const ZERO_COUNTERS: StatCounters = {
  characters: 0,
  apiCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheCharacters: 0,
  pageSessions: 0,
  subtitleCues: 0,
  selectionEvents: 0,
  inlineEvents: 0,
  pdfEvents: 0,
};

export const DEFAULT_STATS_V2: TranslationStatsV2 = {
  version: 2,
  trackingSince: new Date(0).toISOString(), // overwritten on first write/migrate
  lastActiveAt: null,
  lifetime: { ...ZERO_COUNTERS },
  recentDailySummary: [],
  preferences: { hostTrackingEnabled: true, retentionDays: 90 },
};

// retain existing DailyStat, TranslationStats, DEFAULT_STATS (v1) unchanged below/above
```

`services/statsCounters.ts` — implement pure functions importing types from `@/types/stats`. `mergeDimensionMap`: merge partial into key; if key count exceeds `maxKeys`, sort by `characters` desc, keep top `maxKeys`, sum remainder into `__other__`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run services/__tests__/statsCounters.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add types/stats.ts services/statsCounters.ts services/__tests__/statsCounters.test.ts
git commit -m "feat(stats): add v2 types and pure counter helpers"
```

---

### Task 2: Stats IndexedDB store

**Files:**
- Create: `services/statsIdb.ts`
- Create: `services/__tests__/statsIdb.test.ts`
- Modify: `lib/constants.ts` (add `STATS_DB: 'anyllm-stats'`, `STATS_STORE: 'daily'`)

**Interfaces:**
- Produces:
  - `getDailyRecord(date): Promise<DailyStatRecord | undefined>`
  - `setDailyRecord(record): Promise<void>`
  - `getAllDailyRecords(): Promise<DailyStatRecord[]>`
  - `deleteDailyRecordsBefore(cutoffDateInclusive: string): Promise<number>`
  - `clearAllDailyRecords(): Promise<void>`
- Consumes: `DailyStatRecord` from types

- [ ] **Step 1: Write failing tests with mocked idb-keyval**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const memory = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn(async (key: string) => memory.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    memory.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    memory.delete(key);
  }),
  entries: vi.fn(async () => [...memory.entries()]),
  clear: vi.fn(async () => {
    memory.clear();
  }),
}));

import { getDailyRecord, setDailyRecord, clearAllDailyRecords, deleteDailyRecordsBefore } from '../statsIdb';
import { ZERO_COUNTERS, type DailyStatRecord } from '@/types/stats';

function emptyDay(date: string): DailyStatRecord {
  return {
    date,
    totals: { ...ZERO_COUNTERS },
    byMode: {},
    byProvider: {},
    byHost: {},
    byLanguagePair: {},
  };
}

describe('statsIdb', () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
  });

  it('round-trips a daily record', async () => {
    const day = emptyDay('2026-07-01');
    day.totals.characters = 42;
    await setDailyRecord(day);
    await expect(getDailyRecord('2026-07-01')).resolves.toEqual(day);
  });

  it('deletes records before cutoff', async () => {
    await setDailyRecord(emptyDay('2026-06-01'));
    await setDailyRecord(emptyDay('2026-07-01'));
    const n = await deleteDailyRecordsBefore('2026-06-15');
    expect(n).toBe(1);
    await expect(getDailyRecord('2026-06-01')).resolves.toBeUndefined();
    await expect(getDailyRecord('2026-07-01')).resolves.toBeDefined();
  });

  it('clearAllDailyRecords empties store', async () => {
    await setDailyRecord(emptyDay('2026-07-01'));
    await clearAllDailyRecords();
    await expect(getDailyRecord('2026-07-01')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run services/__tests__/statsIdb.test.ts
```

- [ ] **Step 3: Implement `statsIdb.ts`**

Mirror `cacheManager` lazy `createStore(STORAGE_KEYS.STATS_DB, STORAGE_KEYS.STATS_STORE)`. Key = `record.date`. `deleteDailyRecordsBefore` uses `entries()`, deletes where `date < cutoff` (string compare on `YYYY-MM-DD`).

Add to `lib/constants.ts` `STORAGE_KEYS`:

```ts
STATS_DB: 'anyllm-stats',
STATS_STORE: 'daily',
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run services/__tests__/statsIdb.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts services/statsIdb.ts services/__tests__/statsIdb.test.ts
git commit -m "feat(stats): add IndexedDB store for daily dimensional records"
```

---

### Task 3: Migration v1 → v2 + getStatsV2

**Files:**
- Modify: `services/statsCollector.ts`
- Create: `services/__tests__/statsMigration.test.ts`

**Interfaces:**
- Produces:
  - `getStatsV2(): Promise<TranslationStatsV2>` — migrates if needed
  - `migrateStatsIfNeeded(raw: unknown): Promise<TranslationStatsV2>` (export for tests)
- Consumes: v1 types, `setDailyRecord`, `ZERO_COUNTERS`, `DEFAULT_STATS_V2`

- [ ] **Step 1: Write migration tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const memoryIdb = new Map<string, unknown>();
const chromeLocal: Record<string, unknown> = {};

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn(async (key: string) => memoryIdb.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    memoryIdb.set(key, value);
  }),
  del: vi.fn(async (key: string) => memoryIdb.delete(key)),
  entries: vi.fn(async () => [...memoryIdb.entries()]),
  clear: vi.fn(async () => memoryIdb.clear()),
}));

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) =>
        chromeLocal[key] !== undefined ? { [key]: chromeLocal[key] } : {},
      ),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(chromeLocal, data);
      }),
      remove: vi.fn(async (key: string) => {
        delete chromeLocal[key];
      }),
    },
  },
});

import { getStatsV2, STATS_STORAGE_KEY } from '../statsCollector';
import { getDailyRecord } from '../statsIdb';

describe('stats migration', () => {
  beforeEach(() => {
    memoryIdb.clear();
    for (const k of Object.keys(chromeLocal)) delete chromeLocal[k];
    vi.clearAllMocks();
  });

  it('returns defaults when empty', async () => {
    const stats = await getStatsV2();
    expect(stats.version).toBe(2);
    expect(stats.lifetime.characters).toBe(0);
    expect(stats.preferences.retentionDays).toBe(90);
  });

  it('migrates v1 lifetime and daily rows into v2 + IDB', async () => {
    chromeLocal[STATS_STORAGE_KEY] = {
      totalCharactersTranslated: 100,
      totalApiCalls: 3,
      totalCacheHits: 2,
      totalCacheMisses: 1,
      totalPagesTranslated: 4,
      totalSubtitlesCuesTranslated: 5,
      dailyStats: [{ date: '2026-07-01', chars: 50, apiCalls: 1, cacheHits: 1 }],
    };
    const stats = await getStatsV2();
    expect(stats.version).toBe(2);
    expect(stats.lifetime.characters).toBe(100);
    expect(stats.lifetime.apiCalls).toBe(3);
    expect(stats.lifetime.pageSessions).toBe(4);
    expect(stats.lifetime.subtitleCues).toBe(5);
    const day = await getDailyRecord('2026-07-01');
    expect(day?.totals.characters).toBe(50);
    expect(day?.totals.apiCalls).toBe(1);
    expect(day?.byHost).toEqual({});
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (getStatsV2 missing)

```bash
npx vitest run services/__tests__/statsMigration.test.ts
```

- [ ] **Step 3: Implement migration in `statsCollector.ts`**

Logic:

1. `chrome.storage.local.get(STATS_STORAGE_KEY)`.
2. If missing → return clone of `DEFAULT_STATS_V2` with `trackingSince: new Date().toISOString()` (do not persist until first write, or persist — pick **persist empty v2 on first get** only if simpler for UI; preferred: **return defaults without write** on empty).
3. If `raw.version === 2` → validate/normalize missing fields with defaults; return.
4. Else treat as v1:
   - Map totals into `lifetime`.
   - For each `dailyStats` entry, `setDailyRecord` with totals only.
   - Build `recentDailySummary` from last 30 days.
   - `trackingSince` = earliest daily date noon UTC ISO or now.
   - Persist v2 object to chrome.storage (overwrite v1).
5. Export `getStatsV2`. Keep temporary `getStats` as alias that still returns v1 shape only if something needs it — **prefer updating all readers in later tasks** and make `getStats` deprecated wrapper that maps v2→legacy for compile safety until Task 7/9.

For Task 3 only: implement `getStatsV2` + migration; leave old `getStats`/`incrementStats` working for existing UI until Task 9.

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run services/__tests__/statsMigration.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add services/statsCollector.ts services/__tests__/statsMigration.test.ts
git commit -m "feat(stats): migrate v1 stats to v2 summary and IDB dailies"
```

---

### Task 4: `recordUsage`, preferences update, serialized reset

**Files:**
- Modify: `services/statsCollector.ts`
- Create: `services/__tests__/statsRecordUsage.test.ts`

**Interfaces:**
- Produces:

```ts
export interface UsageEvent {
  mode: TranslationMode;
  characters?: number;
  apiCalls?: number;
  cacheHits?: number;
  cacheMisses?: number;
  cacheCharacters?: number;
  pageSession?: boolean;
  subtitleCues?: number;
  providerId?: string;
  host?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export function recordUsage(event: UsageEvent): Promise<void>;
export function updateStatsPreferences(partial: Partial<StatsPreferences>): Promise<void>;
export function resetStats(): Promise<void>; // clears chrome key + IDB
```

- Consumes: chainUpdate, getStatsV2/migration, statsIdb, statsCounters

- [ ] **Step 1: Write failing tests**

```ts
// Mock idb + chrome like migration tests
import { recordUsage, resetStats, getStatsV2, updateStatsPreferences, STATS_STORAGE_KEY } from '../statsCollector';
import { getDailyRecord, getAllDailyRecords } from '../statsIdb';

describe('recordUsage', () => {
  it('updates lifetime and today IDB dimensions', async () => {
    await recordUsage({
      mode: 'page',
      characters: 100,
      apiCalls: 1,
      cacheHits: 2,
      cacheMisses: 1,
      cacheCharacters: 40,
      pageSession: true,
      providerId: 'prov-1',
      host: 'www.Example.com',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    const stats = await getStatsV2();
    expect(stats.lifetime.characters).toBe(100);
    expect(stats.lifetime.pageSessions).toBe(1);
    expect(stats.lifetime.cacheCharacters).toBe(40);
    expect(stats.lastActiveAt).toBeTruthy();

    const today = new Date().toLocaleDateString('en-CA');
    const day = await getDailyRecord(today);
    expect(day?.totals.characters).toBe(100);
    expect(day?.byMode.page?.characters).toBe(100);
    expect(day?.byProvider['prov-1']?.apiCalls).toBe(1);
    expect(day?.byHost['example.com']?.characters).toBe(100);
    expect(day?.byLanguagePair['en>vi']?.characters).toBe(100);
  });

  it('skips byHost when host tracking disabled', async () => {
    await updateStatsPreferences({ hostTrackingEnabled: false });
    await recordUsage({
      mode: 'selection',
      characters: 10,
      apiCalls: 1,
      host: 'news.example.com',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    const today = new Date().toLocaleDateString('en-CA');
    const day = await getDailyRecord(today);
    expect(day?.byHost ?? {}).toEqual({});
    expect(day?.totals.selectionEvents).toBe(1);
  });

  it('resetStats clears storage and IDB', async () => {
    await recordUsage({ mode: 'page', characters: 1, apiCalls: 1 });
    await resetStats();
    const stats = await getStatsV2();
    expect(stats.lifetime.characters).toBe(0);
    expect(await getAllDailyRecords()).toEqual([]);
  });

  it('serializes reset behind pending recordUsage', async () => {
    // Same deferred chrome.storage.local.set pattern as hybrid polish plan
    const setDeferred: Array<() => void> = [];
    const setMock = chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>;
    setMock.mockImplementation((items: Record<string, unknown>) => new Promise<void>((resolve) => {
      setDeferred.push(() => {
        Object.assign(/* mock storage */, items);
        resolve();
      });
    }));
    const p1 = recordUsage({ mode: 'page', characters: 5, apiCalls: 1 });
    const p2 = resetStats();
    setDeferred.shift()?.();
    await p1;
    // allow remaining chain steps
    while (setDeferred.length) setDeferred.shift()?.();
    await p2;
    const stats = await getStatsV2();
    expect(stats.lifetime.characters).toBe(0);
  });
});
```

Adapt chrome mock storage object to match migration test pattern so assign works.

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run services/__tests__/statsRecordUsage.test.ts
```

- [ ] **Step 3: Implement `recordUsage`**

Inside `chainUpdate`:

1. Load/migrate summary via internal `readSummary()`.
2. Build `partial` counters from event (mode increments: `selectionEvents`/`inlineEvents`/`pdfEvents`/`subtitleCues`/`pageSessions`).
3. `lifetime = mergeCounters(lifetime, partial)`.
4. `lastActiveAt = now ISO`.
5. Load today's IDB record or empty day; merge totals + byMode[mode] + byProvider + byHost (if enabled + normalized) + byLanguagePair (if both langs); apply caps via `mergeDimensionMap`.
6. `setDailyRecord`.
7. Prune IDB: cutoff = today − retentionDays.
8. Rebuild `recentDailySummary` from last 30 days of IDB totals (or merge today into existing summary).
9. Persist summary to chrome.storage.

`resetStats`: chain → `chrome.storage.local.remove` + `clearAllDailyRecords`.

`updateStatsPreferences`: chain → merge preferences; if retention lowered, prune immediately.

Keep `incrementStats`/`recordDailyStats` as thin adapters calling `recordUsage` with `mode: 'page'` **only if** needed for Task 5/7 compile — better delete after Task 7. For Task 4, implement adapters:

```ts
export async function incrementStats(partial: Partial<...>): Promise<void> {
  await recordUsage({
    mode: 'page',
    characters: partial.totalCharactersTranslated,
    apiCalls: partial.totalApiCalls,
    cacheHits: partial.totalCacheHits,
    cacheMisses: partial.totalCacheMisses,
    pageSession: (partial.totalPagesTranslated ?? 0) > 0,
    subtitleCues: partial.totalSubtitlesCuesTranslated,
  });
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run services/__tests__/statsRecordUsage.test.ts services/__tests__/statsMigration.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add services/statsCollector.ts services/__tests__/statsRecordUsage.test.ts
git commit -m "feat(stats): implement recordUsage, preferences, and full reset"
```

---

### Task 5: Query layer (periods, aggregates, top-N, insights)

**Files:**
- Create: `services/statsQuery.ts`
- Create: `services/__tests__/statsQuery.test.ts`

**Interfaces:**

```ts
export type StatsPeriod = '7d' | '30d' | '90d' | 'all';

export function listPeriodDates(period: StatsPeriod, now?: Date): string[]; // empty for 'all'
export function previousPeriodDates(period: StatsPeriod, now?: Date): string[];
export function sumCounters(days: DailyStatRecord[]): StatCounters;
export function sumLifetimeOrDays(lifetime: StatCounters, days: DailyStatRecord[], period: StatsPeriod): StatCounters;
export function percentDelta(current: number, previous: number): number | null;
export function topEntries(
  maps: Array<Record<string, Partial<StatCounters>>>,
  metric: keyof StatCounters,
  n: number,
): Array<{ key: string; value: number }>;
export function buildInsights(periodTotals: StatCounters, peakDate: string | null): string[];
export async function loadDaysForPeriod(period: StatsPeriod, now?: Date): Promise<DailyStatRecord[]>;
```

- [ ] **Step 1: Write tests**

Cover: 7d length 7; previous 7d does not overlap; sumCounters; percentDelta null when previous 0 and current 0, 100 when previous 0 current >0; topEntries merges multiple day maps; buildInsights returns ≤3 strings and mentions cache when hit rate known.

- [ ] **Step 2: Run — FAIL**

```bash
npx vitest run services/__tests__/statsQuery.test.ts
```

- [ ] **Step 3: Implement pure + async load**

`loadDaysForPeriod`: for `all`, load all IDB records; else generate date list and `getDailyRecord` each (or filter `getAllDailyRecords`). Zero-fill for charts happens in display layer.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add services/statsQuery.ts services/__tests__/statsQuery.test.ts
git commit -m "feat(stats): add period query, top-N, and insight helpers"
```

---

### Task 6: Export JSON + CSV

**Files:**
- Create: `services/statsExport.ts`
- Create: `services/__tests__/statsExport.test.ts`

**Interfaces:**

```ts
export function buildStatsJsonExport(input: {
  summary: TranslationStatsV2;
  daily: DailyStatRecord[];
}): string;

export function buildStatsCsvExport(daily: DailyStatRecord[]): string;

export function triggerDownload(filename: string, content: string, mime: string): void;
```

- [ ] **Step 1: Tests**

```ts
it('JSON includes lifetime and daily dimensions, no apiKey field', () => {
  const json = buildStatsJsonExport({ summary, daily: [dayWithHost] });
  const parsed = JSON.parse(json);
  expect(parsed.lifetime.characters).toBeDefined();
  expect(parsed.daily[0].byHost).toBeDefined();
  expect(json).not.toMatch(/apiKey/);
});

it('CSV has header and one row per day totals only', () => {
  const csv = buildStatsCsvExport([day]);
  const lines = csv.trim().split('\n');
  expect(lines[0]).toContain('date,characters,apiCalls');
  expect(lines).toHaveLength(2);
  expect(csv).not.toContain('byHost');
});
```

- [ ] **Step 2–4: Implement + pass tests + commit**

```bash
git commit -m "feat(stats): add JSON and CSV export builders"
```

CSV header exactly:

`date,characters,apiCalls,cacheHits,cacheMisses,cacheCharacters,pageSessions,subtitleCues,selectionEvents,inlineEvents,pdfEvents`

---

### Task 7: Instrument background translation paths

**Files:**
- Modify: `services/background.ts` (all `incrementStats` / `recordDailyStats` sites)
- Modify: `services/__tests__/background.translate.test.ts` (and selection tests if they assert stats)
- Remove or deprecate adapters once unused

**Interfaces:**
- Consumes: `recordUsage` from `statsCollector`
- Helper (local in background or `lib/statsHost.ts`):

```ts
function hostFromSender(sender?: chrome.runtime.MessageSender): string | undefined {
  try {
    const url = sender?.tab?.url ?? sender?.url;
    if (!url) return undefined;
    return normalizeHost(new URL(url).hostname);
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 1: Inventory call sites**

```bash
rg -n "incrementStats|recordDailyStats" services/
```

Expected sites: page translate (session + batch), subtitle chunks, selection dictionary + sentence, cache hit paths where hits are counted.

- [ ] **Step 2: Replace each with `recordUsage`**

Examples:

Page session:

```ts
recordUsage({
  mode: 'page',
  pageSession: true,
  host: hostFromSender(sender),
  sourceLanguage: message.sourceLanguage,
  targetLanguage: message.targetLanguage,
  providerId: /* active pool provider id if available */,
}).catch(() => {});
```

Page batch after translate:

```ts
recordUsage({
  mode: 'page',
  characters: totalChars,
  apiCalls: totalApiCalls,
  cacheHits: cachedResults.length,
  cacheMisses: uncachedPieces.length,
  cacheCharacters: cachedResults.reduce((s, r) => s + (/* original piece length if mapped */ 0), 0),
  host: hostFromSender(sender),
  sourceLanguage: message.sourceLanguage,
  targetLanguage: message.targetLanguage,
  providerId,
}).catch(() => {});
```

For `cacheCharacters`, sum source text lengths of cache-hit pieces (have `piece.text` in the loop — accumulate while splitting cached/uncached).

Subtitle:

```ts
recordUsage({
  mode: 'subtitle',
  characters: chunkChars,
  apiCalls: 1,
  cacheHits: chunkCues.length - uncachedIndices.length,
  cacheMisses: uncachedIndices.length,
  subtitleCues: /* translated cue count */,
  host: hostFromSender(sender),
  sourceLanguage,
  targetLanguage,
  providerId,
}).catch(() => {});
```

Selection:

```ts
recordUsage({
  mode: 'selection',
  characters: message.text.length,
  apiCalls: 1,
  host: hostFromSender(sender),
  sourceLanguage: message.sourceLanguage,
  targetLanguage: message.targetLanguage,
}).catch(() => {});
```

If PDF path is distinct in background, use `mode: 'pdf'`. If inline is not separately messaged, skip until a path exists (do not invent). Document in commit message if inline/pdf share page path temporarily.

- [ ] **Step 3: Fix tests that mock old stats APIs**

```bash
npx vitest run services/__tests__/background.translate.test.ts services/__tests__/background.selectionDictionary.test.ts
```

- [ ] **Step 4: Delete dead `incrementStats`/`recordDailyStats` if unused**

```bash
rg -n "incrementStats|recordDailyStats" --glob '!docs/**'
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(stats): wire recordUsage across translation background paths"
```

---

### Task 8: Display helpers for dashboard periods

**Files:**
- Modify: `entrypoints/options/sections/statisticsDisplay.ts`
- Create: `entrypoints/options/sections/__tests__/statisticsDisplay.test.ts`

**Interfaces:**

```ts
export function buildChartDays(
  daily: DailyStatRecord[],
  period: StatsPeriod,
  now?: Date,
  locale?: string,
): DisplayDailyStat[]; // extend with chars/apiCalls/cacheHits from totals

export function formatCompactNumber(n: number): string; // 1200 -> 1.2K
export function formatDelta(delta: number | null): string; // "+12%" | "—"
// keep getCacheEfficiency, hasDailyActivity, date formatters
```

- [ ] **Step 1–4: TDD helpers + commit**

```bash
git commit -m "feat(stats): extend display helpers for period charts and formatting"
```

Map `DailyStatRecord.totals.characters` → chart `chars` field for bar height compatibility, or redefine `DisplayDailyStat` to use `StatCounters` (prefer **new fields** matching counters to avoid dual naming long-term).

---

### Task 9: Statistics dashboard UI shell

**Files:**
- Rewrite: `entrypoints/options/sections/StatisticsSection.tsx`
- Create: `entrypoints/options/sections/__tests__/StatisticsSection.test.tsx`

**UI blocks this task:** SectionHeader (cyan), period `SegmentedControl`, Export menu placeholder button (wire Task 10), Hero, KPI grid (6 cards), Activity chart, Cache efficiency, loading skeletons, empty, error+retry. **No** breakdowns/preferences yet (stubs ok).

**Data load:**

```ts
const [period, setPeriod] = useState<StatsPeriod>('30d');
const [summary, setSummary] = useState<TranslationStatsV2 | null>(null);
const [days, setDays] = useState<DailyStatRecord[]>([]);
// load: getStatsV2 + loadDaysForPeriod(period)
// subscribe chrome.storage.onChanged for STATS_STORAGE_KEY → reload
```

- [ ] **Step 1: Component tests first**

```ts
vi.mock('@/services/statsCollector', () => ({
  getStatsV2: vi.fn(),
  resetStats: vi.fn(),
  updateStatsPreferences: vi.fn(),
  STATS_STORAGE_KEY: 'anyllm-translate-stats',
}));
vi.mock('@/services/statsQuery', () => ({
  loadDaysForPeriod: vi.fn(),
  sumLifetimeOrDays: vi.fn(),
  percentDelta: vi.fn(),
  previousPeriodDates: vi.fn(),
  topEntries: vi.fn(),
  buildInsights: vi.fn(() => []),
}));

it('shows loading skeleton then KPIs', async () => { ... });
it('shows empty guidance when lifetime zero and no days', async () => { ... });
it('shows error and retry', async () => { ... });
it('renders period radiogroup', async () => { ... });
```

- [ ] **Step 2: Implement shell UI** using Advanced-style gradient hero, cyan accents, `tabular-nums`, no purple.

- [ ] **Step 3: Pass tests**

```bash
npx vitest run entrypoints/options/sections/__tests__/StatisticsSection.test.tsx
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(stats): rebuild Statistics dashboard shell with period KPIs"
```

---

### Task 10: Breakdowns, insights, preferences, export, danger zone

**Files:**
- Modify: `entrypoints/options/sections/StatisticsSection.tsx`
- Modify: `entrypoints/options/sections/__tests__/StatisticsSection.test.tsx`
- Use: `statsExport.ts`, `updateStatsPreferences`, `DangerZone`, `Toggle`, `Select`

**UI blocks:**

1. Insights chips from `buildInsights`
2. Breakdown grid/cards: mode bars, top hosts, providers, language pairs via `topEntries`
3. Host-off empty CTA when `!preferences.hostTrackingEnabled`
4. Data controls: host tracking toggle + retention select (30/90/180)
5. Export dropdown: JSON + CSV using `buildStatsJsonExport` / `buildStatsCsvExport` + `triggerDownload`
6. DangerZone reset + modal (preserve existing safety copy patterns)

- [ ] **Step 1: Tests for host-off CTA, export click, reset modal, retention change**

- [ ] **Step 2: Implement**

- [ ] **Step 3: Pass tests**

```bash
npx vitest run entrypoints/options/sections/__tests__/StatisticsSection.test.tsx services/__tests__/statsExport.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(stats): add breakdowns, export, retention, and privacy controls"
```

---

### Task 11: Integration cleanup and verification

**Files:**
- Grep-driven cleanup of v1-only UI fields
- Update any remaining imports of `getStats` → `getStatsV2`
- `README.md` only if stats are user-documented (optional; skip if not)

- [ ] **Step 1: Full stats-related test suite**

```bash
npx vitest run services/__tests__/statsCounters.test.ts services/__tests__/statsIdb.test.ts services/__tests__/statsMigration.test.ts services/__tests__/statsRecordUsage.test.ts services/__tests__/statsQuery.test.ts services/__tests__/statsExport.test.ts entrypoints/options/sections/__tests__/StatisticsSection.test.tsx
```

Expected: all PASS.

- [ ] **Step 2: Typecheck**

```bash
npm run compile
```

Fix errors related to stats only.

- [ ] **Step 3: Manual smoke checklist (document in commit body)**

1. Open options → Statistics — skeletons then empty or migrated data  
2. Translate a page → KPIs and chart update  
3. Toggle 7d/30d/90d/all  
4. Disable host tracking → host panel CTA  
5. Export JSON + CSV  
6. Reset stats → cleared  

- [ ] **Step 4: Close beads + final commit if needed**

```bash
bd close ALT-88u --reason="Statistics analytics platform implemented per plan"
git commit -m "chore(stats): verify analytics platform and close ALT-88u"
```

- [ ] **Step 5: Push (session protocol)**

```bash
git pull --rebase
bd dolt push
git push
git status
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Schema v2 + types | 1 |
| IDB daily dimensional store | 2 |
| Migration v1→v2 | 3 |
| `recordUsage` + caps + host toggle + retention prune | 4 |
| Serialized reset clears storage + IDB | 4 |
| Period aggregates / previous delta / top-N / insights | 5 |
| Export JSON + CSV (totals) | 6 |
| Instrument all modes / providers / hosts / langs / cache chars | 7 |
| Chart zero-fill / formatters | 8 |
| Dashboard UI shell | 9 |
| Breakdowns, preferences, export UI, danger zone | 10 |
| Acceptance tests + compile | 11 |
| No purple / cyan accent | 9–10 |
| No chart library | 9 |
| Fire-and-forget recording | 7 |
| Privacy copy | 10 |

## Placeholder / consistency notes (self-review)

- `getStats` v1 API removed after Task 7/9 adapters deleted.
- Provider id: best-effort; use pool entry `id` when the translate path already resolved a provider; else omit/`unknown`.
- Inline/PDF: wire when distinct message handlers exist; otherwise attribute to nearest mode and note in Task 7 commit.
- `cacheCharacters` for page path: accumulate during cache split loop (explicit in Task 7).
- CSV columns fixed in Task 6 — do not expand to dimensions without a new task.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-09-statistics-analytics-platform.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks  
2. **Inline Execution** — This session, `executing-plans`, checkpoints between tasks  

Which approach?
