import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZERO_COUNTERS, type DailyStatRecord, type StatCounters } from '@/types/stats';

const memory = new Map<string, DailyStatRecord>();

vi.mock('../statsIdb', () => ({
  getDailyRecord: vi.fn(async (date: string) => memory.get(date)),
  getAllDailyRecords: vi.fn(async () => [...memory.values()]),
}));

import {
  listPeriodDates,
  previousPeriodDates,
  sumCounters,
  sumLifetimeOrDays,
  percentDelta,
  topEntries,
  buildInsights,
  loadDaysForPeriod,
} from '../statsQuery';

function emptyDay(date: string, totals: Partial<StatCounters> = {}): DailyStatRecord {
  return {
    date,
    totals: { ...ZERO_COUNTERS, ...totals },
    byMode: {},
    byProvider: {},
    byHost: {},
    byLanguagePair: {},
  };
}

describe('statsQuery', () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
  });

  it('period windows, aggregation helpers, percent deltas, and top entries', () => {
    const now = new Date(2026, 6, 9, 15, 0, 0); // local Jul 9, 2026
    const current = listPeriodDates('7d', now);
    expect(current).toEqual([
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
    ]);
    expect(listPeriodDates('30d', now)).toHaveLength(30);
    expect(listPeriodDates('90d', now)).toHaveLength(90);
    expect(listPeriodDates('all')).toEqual([]);

    const previous = previousPeriodDates('7d', now);
    expect(previous).toEqual([
      '2026-06-26',
      '2026-06-27',
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ]);
    expect(previous.filter((d) => current.includes(d))).toEqual([]);
    expect(previousPeriodDates('all')).toEqual([]);

    const days = [
      emptyDay('2026-07-01', { characters: 10, apiCalls: 1, cacheHits: 2 }),
      emptyDay('2026-07-02', { characters: 5, apiCalls: 3, cacheMisses: 1 }),
    ];
    expect(sumCounters(days)).toMatchObject({
      characters: 15,
      apiCalls: 4,
      cacheHits: 2,
      cacheMisses: 1,
    });
    expect(sumCounters([])).toEqual(ZERO_COUNTERS);

    const lifetime = { ...ZERO_COUNTERS, characters: 999 };
    expect(sumLifetimeOrDays(lifetime, days, 'all').characters).toBe(999);
    expect(sumLifetimeOrDays(lifetime, days, '7d').characters).toBe(15);

    expect(percentDelta(0, 0)).toBeNull();
    expect(percentDelta(50, 0)).toBe(100);
    expect(percentDelta(150, 100)).toBe(50);
    expect(percentDelta(50, 100)).toBe(-50);

    const top = topEntries(
      [
        { 'youtube.com': { characters: 100 }, 'netflix.com': { characters: 50 } },
        { 'youtube.com': { characters: 40 }, 'example.com': { characters: 80 } },
      ],
      'characters',
      2,
    );
    expect(top).toEqual([
      { key: 'youtube.com', value: 140 },
      { key: 'example.com', value: 80 },
    ]);
    expect(topEntries([], 'characters', 5)).toEqual([]);
  });

  it('buildInsights and loadDaysForPeriod cover cache mentions and period filters', async () => {
    const rich = buildInsights(
      {
        ...ZERO_COUNTERS,
        characters: 1000,
        apiCalls: 20,
        cacheHits: 8,
        cacheMisses: 2,
        pageSessions: 3,
        subtitleCues: 40,
      },
      '2026-07-01',
    );
    expect(rich.length).toBeLessThanOrEqual(3);
    expect(rich.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);

    const cacheOnly = buildInsights(
      { ...ZERO_COUNTERS, cacheHits: 75, cacheMisses: 25 },
      null,
    );
    expect(cacheOnly.some((s) => /cache/i.test(s))).toBe(true);

    const noCache = buildInsights({ ...ZERO_COUNTERS, characters: 100 }, null);
    expect(noCache.every((s) => !/cache/i.test(s) || /no cache/i.test(s))).toBe(true);

    memory.set('2026-07-09', emptyDay('2026-07-09', { characters: 1 }));
    memory.set('2026-07-08', emptyDay('2026-07-08', { characters: 2 }));
    memory.set('2026-06-01', emptyDay('2026-06-01', { characters: 99 }));
    memory.set('2026-01-01', emptyDay('2026-01-01', { characters: 1 }));

    const now = new Date(2026, 6, 9, 12, 0, 0);
    const week = await loadDaysForPeriod('7d', now);
    expect(week.map((d) => d.date).sort()).toEqual(['2026-07-08', '2026-07-09']);

    const all = await loadDaysForPeriod('all');
    expect(all).toHaveLength(4);
  });
});
