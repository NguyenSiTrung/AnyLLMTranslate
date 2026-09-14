import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import {
  getDailyRecord,
  setDailyRecord,
  getAllDailyRecords,
  clearAllDailyRecords,
  deleteDailyRecordsBefore,
} from '../statsIdb';
import {
  recordUsage,
  resetStats,
  getStatsV2,
  updateStatsPreferences,
  retentionCutoffYmd,
  STATS_STORAGE_KEY,
} from '../statsCollector';
import {
  mergeCounters,
  normalizeHost,
  languagePairKey,
  mergeDimensionMap,
} from '../statsCounters';
import { buildStatsJsonExport, buildStatsCsvExport } from '../statsExport';
import {
  ZERO_COUNTERS,
  DEFAULT_STATS_V2,
  type DailyStatRecord,
  type TranslationStatsV2,
} from '@/types/stats';

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

const CSV_HEADER =
  'date,characters,apiCalls,cacheHits,cacheMisses,cacheCharacters,pageSessions,subtitleCues,selectionEvents,inlineEvents,pdfEvents';

function makeSummary(overrides: Partial<TranslationStatsV2> = {}): TranslationStatsV2 {
  return {
    ...DEFAULT_STATS_V2,
    trackingSince: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-07-09T12:00:00.000Z',
    lifetime: {
      ...ZERO_COUNTERS,
      characters: 1200,
      apiCalls: 10,
      cacheHits: 4,
      cacheMisses: 6,
    },
    preferences: { hostTrackingEnabled: true, retentionDays: 90 },
    ...overrides,
  };
}

function makeDay(
  date: string,
  totals: Partial<typeof ZERO_COUNTERS> = {},
  byHost: DailyStatRecord['byHost'] = {},
): DailyStatRecord {
  return {
    date,
    totals: { ...ZERO_COUNTERS, ...totals },
    byMode: {},
    byProvider: {},
    byHost,
    byLanguagePair: {},
  };
}

describe('statsIdb', () => {
  beforeEach(() => {
    memoryIdb.clear();
    vi.clearAllMocks();
  });

  it('CRUD lifecycle: round-trips records, lists all days, deletes before cutoff, and clears the store', async () => {
    // Round-trip + list all stored days.
    const day = emptyDay('2026-07-01');
    day.totals.characters = 42;
    await setDailyRecord(day);
    await expect(getDailyRecord('2026-07-01')).resolves.toEqual(day);

    const a = emptyDay('2026-06-01');
    const b = emptyDay('2026-07-01');
    b.totals.characters = 42;
    await setDailyRecord(a);
    await setDailyRecord(b);
    const all = await getAllDailyRecords();
    expect(all).toHaveLength(2);
    expect(all).toEqual(expect.arrayContaining([a, b]));

    // Delete before cutoff + clear-all empties the store.
    const n = await deleteDailyRecordsBefore('2026-06-15');
    expect(n).toBe(1);
    await expect(getDailyRecord('2026-06-01')).resolves.toBeUndefined();
    await expect(getDailyRecord('2026-07-01')).resolves.toBeDefined();

    await clearAllDailyRecords();
    await expect(getDailyRecord('2026-07-01')).resolves.toBeUndefined();
  });
});

describe('stats migration', () => {
  beforeEach(() => {
    memoryIdb.clear();
    for (const k of Object.keys(chromeLocal)) delete chromeLocal[k];
    vi.clearAllMocks();
  });

  it('returns defaults when empty and migrates v1 lifetime/daily into v2 + IDB', async () => {
    const empty = await getStatsV2();
    expect(empty.version).toBe(2);
    expect(empty.lifetime.characters).toBe(0);
    expect(empty.preferences.retentionDays).toBe(90);

    // Clear defaults written by the empty path so migration sees raw v1.
    memoryIdb.clear();
    for (const k of Object.keys(chromeLocal)) delete chromeLocal[k];
    vi.clearAllMocks();

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

describe('recordUsage', () => {
  beforeEach(() => {
    memoryIdb.clear();
    for (const k of Object.keys(chromeLocal)) delete chromeLocal[k];
    vi.clearAllMocks();
    // Restore default chrome.storage.local.set after serialization tests
    (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockImplementation(
      async (data: Record<string, unknown>) => {
        Object.assign(chromeLocal, data);
      },
    );
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (key: string) =>
        chromeLocal[key] !== undefined ? { [key]: chromeLocal[key] } : {},
    );
    (chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockImplementation(
      async (key: string) => {
        delete chromeLocal[key];
      },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('updates lifetime/today dimensions without double-counting; skips byHost when disabled', async () => {
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
    expect(stats.lifetime.apiCalls).toBe(1);
    expect(stats.lifetime.cacheHits).toBe(2);
    expect(stats.lastActiveAt).toBeTruthy();

    const today = new Date().toLocaleDateString('en-CA');
    const day = await getDailyRecord(today);
    expect(day?.totals.characters).toBe(100);
    expect(day?.byMode.page?.characters).toBe(100);
    expect(day?.byProvider['prov-1']?.apiCalls).toBe(1);
    expect(day?.byHost['example.com']?.characters).toBe(100);
    expect(day?.byLanguagePair['en>vi']?.characters).toBe(100);

    // Host tracking disabled path (fresh day after reset)
    await resetStats();
    await updateStatsPreferences({ hostTrackingEnabled: false });
    await recordUsage({
      mode: 'selection',
      characters: 10,
      apiCalls: 1,
      host: 'news.example.com',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    const day2 = await getDailyRecord(today);
    expect(day2?.byHost ?? {}).toEqual({});
    expect(day2?.totals.selectionEvents).toBe(1);
  });

  it('resetStats clears storage/IDB and serializes behind pending recordUsage', async () => {
    await recordUsage({ mode: 'page', characters: 1, apiCalls: 1 });
    await resetStats();
    const cleared = await getStatsV2();
    expect(cleared.lifetime.characters).toBe(0);
    expect(await getAllDailyRecords()).toEqual([]);

    // Same deferred chrome.storage.local.set pattern as hybrid polish plan.
    // Wait until recordUsage reaches set (async get/IDB run first) so shift is not a no-op.
    const setDeferred: Array<() => void> = [];
    const setMock = chrome.storage.local.set as unknown as ReturnType<typeof vi.fn>;
    setMock.mockImplementation((items: Record<string, unknown>) =>
      new Promise<void>((resolve) => {
        setDeferred.push(() => {
          Object.assign(chromeLocal, items);
          resolve();
        });
      }),
    );
    const p1 = recordUsage({ mode: 'page', characters: 5, apiCalls: 1 });
    const p2 = resetStats();
    await vi.waitFor(() => {
      expect(setDeferred.length).toBeGreaterThan(0);
    });
    setDeferred.shift()?.();
    await p1;
    while (setDeferred.length) setDeferred.shift()?.();
    await p2;
    const stats = await getStatsV2();
    expect(stats.lifetime.characters).toBe(0);
  });

  it('retentionCutoffYmd and recordUsage prune so at most retentionDays remain', async () => {
    // Fixed local noon avoids DST edge cases around midnight.
    const todayFixed = new Date(2026, 6, 9, 12, 0, 0); // 2026-07-09 local
    expect(retentionCutoffYmd(30, todayFixed)).toBe('2026-06-10'); // today - 29
    expect(retentionCutoffYmd(1, todayFixed)).toBe('2026-07-09');
    expect(retentionCutoffYmd(90, todayFixed)).toBe('2026-04-11');

    await updateStatsPreferences({ retentionDays: 30 });

    const today = new Date();
    // Seed 45 historical days including today (today will be overwritten by recordUsage).
    for (let i = 0; i < 45; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = d.toLocaleDateString('en-CA');
      await setDailyRecord({
        date,
        totals: { ...ZERO_COUNTERS, characters: 1, apiCalls: 1 },
        byMode: {},
        byProvider: {},
        byHost: {},
        byLanguagePair: {},
      });
    }

    expect((await getAllDailyRecords()).length).toBe(45);

    await recordUsage({ mode: 'page', characters: 1, apiCalls: 1 });

    const remaining = await getAllDailyRecords();
    expect(remaining.length).toBeLessThanOrEqual(30);
    expect(remaining.length).toBe(30);

    const todayYmd = today.toLocaleDateString('en-CA');
    const cutoff = retentionCutoffYmd(30, today);
    for (const day of remaining) {
      expect(day.date >= cutoff).toBe(true);
      expect(day.date <= todayYmd).toBe(true);
    }
  });
});

describe('statsCounters', () => {
  it('merges counters, normalizes hosts, pair keys, and rolls excess dims into __other__', () => {
    const a = { ...ZERO_COUNTERS, characters: 10, apiCalls: 1 };
    const b = { ...ZERO_COUNTERS, characters: 5, cacheHits: 2 };
    expect(mergeCounters(a, b).characters).toBe(15);
    expect(mergeCounters(a, b).apiCalls).toBe(1);
    expect(mergeCounters(a, b).cacheHits).toBe(2);

    expect(normalizeHost('WWW.YouTube.com')).toBe('youtube.com');
    expect(normalizeHost(undefined)).toBeUndefined();
    expect(normalizeHost('')).toBeUndefined();
    expect(languagePairKey('auto', 'vi')).toBe('auto>vi');

    let next: Record<string, Partial<typeof ZERO_COUNTERS>> = {};
    for (let i = 0; i < 27; i++) {
      next = mergeDimensionMap(next, `host${i}.com`, { characters: i + 1 }, 25);
    }
    expect(Object.keys(next).length).toBeLessThanOrEqual(26);
    expect(next.__other__).toBeDefined();
  });
});

describe('statsExport', () => {
  it('buildStatsJsonExport includes lifetime/daily dims, omits version/recentDailySummary, never leaks apiKey; buildStatsCsvExport emits header-only for empty and one totals row per day in order without byHost', () => {
    const summary = makeSummary({
      recentDailySummary: [
        { date: '2026-07-09', totals: { ...ZERO_COUNTERS, characters: 5 } },
      ],
    });
    const dayWithHost = makeDay(
      '2026-07-09',
      { characters: 100, apiCalls: 2 },
      { 'example.com': { characters: 100, apiCalls: 2 } },
    );

    const json = buildStatsJsonExport({ summary, daily: [dayWithHost] });
    const parsed = JSON.parse(json);

    expect(parsed.lifetime.characters).toBeDefined();
    expect(parsed.lifetime.characters).toBe(1200);
    expect(parsed.preferences).toEqual({
      hostTrackingEnabled: true,
      retentionDays: 90,
    });
    expect(parsed.trackingSince).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.lastActiveAt).toBe('2026-07-09T12:00:00.000Z');
    expect(parsed.daily).toHaveLength(1);
    expect(parsed.daily[0].byHost).toBeDefined();
    expect(parsed.daily[0].byHost['example.com']).toEqual({
      characters: 100,
      apiCalls: 2,
    });
    expect(parsed.version).toBeUndefined();
    expect(parsed.recentDailySummary).toBeUndefined();
    expect(Object.keys(parsed).sort()).toEqual(
      ['daily', 'lastActiveAt', 'lifetime', 'preferences', 'trackingSince'].sort(),
    );
    expect(json).not.toMatch(/apiKey/);

    const dirty = {
      ...makeSummary(),
      apiKey: 'sk-secret',
    } as TranslationStatsV2 & { apiKey: string };
    const dirtyJson = buildStatsJsonExport({ summary: dirty, daily: [] });
    expect(dirtyJson).not.toMatch(/apiKey/);
    expect(dirtyJson).not.toMatch(/sk-secret/);

    expect(buildStatsCsvExport([]).trim()).toBe(CSV_HEADER);

    const day = makeDay('2026-07-08', {
      characters: 50,
      apiCalls: 3,
      cacheHits: 1,
      cacheMisses: 2,
      cacheCharacters: 20,
      pageSessions: 1,
      subtitleCues: 4,
      selectionEvents: 0,
      inlineEvents: 1,
      pdfEvents: 0,
    });
    day.byHost = { 'youtube.com': { characters: 50 } };

    const single = buildStatsCsvExport([day]);
    const singleLines = single.trim().split('\n');
    expect(singleLines[0]).toContain('date,characters,apiCalls');
    expect(singleLines[0]).toBe(CSV_HEADER);
    expect(singleLines).toHaveLength(2);
    expect(single).not.toContain('byHost');
    expect(single).not.toContain('youtube.com');
    expect(singleLines[1]).toBe('2026-07-08,50,3,1,2,20,1,4,0,1,0');

    const days = [
      makeDay('2026-07-01', { characters: 1 }),
      makeDay('2026-07-02', { characters: 2, apiCalls: 1 }),
    ];
    const multi = buildStatsCsvExport(days).trim().split('\n');
    expect(multi).toHaveLength(3);
    expect(multi[1]).toBe('2026-07-01,1,0,0,0,0,0,0,0,0,0');
    expect(multi[2]).toBe('2026-07-02,2,1,0,0,0,0,0,0,0,0');
  });
});
