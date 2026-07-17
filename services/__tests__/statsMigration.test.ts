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
