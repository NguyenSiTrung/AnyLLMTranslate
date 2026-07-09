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
  recordUsage,
  resetStats,
  getStatsV2,
  updateStatsPreferences,
  retentionCutoffYmd,
  STATS_STORAGE_KEY,
} from '../statsCollector';
import { getDailyRecord, getAllDailyRecords, setDailyRecord } from '../statsIdb';
import { ZERO_COUNTERS } from '@/types/stats';

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

  it('records a single usage event without double-counting', async () => {
    await recordUsage({
      mode: 'page',
      characters: 10,
      apiCalls: 1,
      cacheHits: 5,
    });
    const stats = await getStatsV2();
    expect(stats.lifetime.characters).toBe(10);
    expect(stats.lifetime.apiCalls).toBe(1);
    expect(stats.lifetime.cacheHits).toBe(5);
  });

  describe('retention window', () => {
    it('retentionCutoffYmd keeps exactly N days including today', () => {
      // Fixed local noon avoids DST edge cases around midnight.
      const today = new Date(2026, 6, 9, 12, 0, 0); // 2026-07-09 local
      expect(retentionCutoffYmd(30, today)).toBe('2026-06-10'); // today - 29
      expect(retentionCutoffYmd(1, today)).toBe('2026-07-09');
      expect(retentionCutoffYmd(90, today)).toBe('2026-04-11');
    });

    it('recordUsage prunes so at most retentionDays daily records remain', async () => {
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
});
