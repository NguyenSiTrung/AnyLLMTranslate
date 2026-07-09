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

  describe('listPeriodDates', () => {
    it('returns 7 dates for 7d including today', () => {
      const now = new Date(2026, 6, 9, 15, 0, 0); // local Jul 9, 2026
      const dates = listPeriodDates('7d', now);
      expect(dates).toHaveLength(7);
      expect(dates[dates.length - 1]).toBe('2026-07-09');
      expect(dates[0]).toBe('2026-07-03');
    });

    it('returns empty array for all', () => {
      expect(listPeriodDates('all')).toEqual([]);
    });

    it('returns 30 and 90 dates for those periods', () => {
      const now = new Date(2026, 6, 9);
      expect(listPeriodDates('30d', now)).toHaveLength(30);
      expect(listPeriodDates('90d', now)).toHaveLength(90);
    });
  });

  describe('previousPeriodDates', () => {
    it('previous 7d does not overlap current 7d', () => {
      const now = new Date(2026, 6, 9, 15, 0, 0);
      const current = listPeriodDates('7d', now);
      const previous = previousPeriodDates('7d', now);
      expect(previous).toHaveLength(7);
      const overlap = previous.filter((d) => current.includes(d));
      expect(overlap).toEqual([]);
      expect(previous[previous.length - 1]).toBe('2026-07-02');
      expect(previous[0]).toBe('2026-06-26');
    });

    it('returns empty for all', () => {
      expect(previousPeriodDates('all')).toEqual([]);
    });
  });

  describe('sumCounters', () => {
    it('sums totals across days', () => {
      const days = [
        emptyDay('2026-07-01', { characters: 10, apiCalls: 1, cacheHits: 2 }),
        emptyDay('2026-07-02', { characters: 5, apiCalls: 3, cacheMisses: 1 }),
      ];
      const sum = sumCounters(days);
      expect(sum.characters).toBe(15);
      expect(sum.apiCalls).toBe(4);
      expect(sum.cacheHits).toBe(2);
      expect(sum.cacheMisses).toBe(1);
    });

    it('returns zeros for empty list', () => {
      expect(sumCounters([])).toEqual(ZERO_COUNTERS);
    });
  });

  describe('sumLifetimeOrDays', () => {
    it('returns lifetime for all period', () => {
      const lifetime = { ...ZERO_COUNTERS, characters: 999 };
      const days = [emptyDay('2026-07-01', { characters: 1 })];
      expect(sumLifetimeOrDays(lifetime, days, 'all').characters).toBe(999);
    });

    it('sums days for finite periods', () => {
      const lifetime = { ...ZERO_COUNTERS, characters: 999 };
      const days = [
        emptyDay('2026-07-01', { characters: 10 }),
        emptyDay('2026-07-02', { characters: 5 }),
      ];
      expect(sumLifetimeOrDays(lifetime, days, '7d').characters).toBe(15);
    });
  });

  describe('percentDelta', () => {
    it('returns null when previous and current are both 0', () => {
      expect(percentDelta(0, 0)).toBeNull();
    });

    it('returns 100 when previous is 0 and current > 0', () => {
      expect(percentDelta(50, 0)).toBe(100);
    });

    it('computes percent change when previous > 0', () => {
      expect(percentDelta(150, 100)).toBe(50);
      expect(percentDelta(50, 100)).toBe(-50);
    });
  });

  describe('topEntries', () => {
    it('merges multiple day maps and ranks by metric', () => {
      const day1 = {
        'youtube.com': { characters: 100 },
        'netflix.com': { characters: 50 },
      };
      const day2 = {
        'youtube.com': { characters: 40 },
        'example.com': { characters: 80 },
      };
      const top = topEntries([day1, day2], 'characters', 2);
      expect(top).toEqual([
        { key: 'youtube.com', value: 140 },
        { key: 'example.com', value: 80 },
      ]);
    });

    it('returns empty when maps are empty', () => {
      expect(topEntries([], 'characters', 5)).toEqual([]);
    });
  });

  describe('buildInsights', () => {
    it('returns at most 3 strings', () => {
      const totals = {
        ...ZERO_COUNTERS,
        characters: 1000,
        apiCalls: 20,
        cacheHits: 8,
        cacheMisses: 2,
        pageSessions: 3,
        subtitleCues: 40,
      };
      const insights = buildInsights(totals, '2026-07-01');
      expect(insights.length).toBeLessThanOrEqual(3);
      expect(insights.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
    });

    it('mentions cache when hit rate is known', () => {
      const totals = {
        ...ZERO_COUNTERS,
        cacheHits: 75,
        cacheMisses: 25,
      };
      const insights = buildInsights(totals, null);
      expect(insights.some((s) => /cache/i.test(s))).toBe(true);
    });

    it('returns empty or non-cache insights when no cache activity', () => {
      const totals = { ...ZERO_COUNTERS, characters: 100 };
      const insights = buildInsights(totals, null);
      expect(insights.every((s) => !/cache/i.test(s) || /no cache/i.test(s))).toBe(true);
    });
  });

  describe('loadDaysForPeriod', () => {
    it('loads only existing records for a finite period', async () => {
      memory.set('2026-07-09', emptyDay('2026-07-09', { characters: 1 }));
      memory.set('2026-07-08', emptyDay('2026-07-08', { characters: 2 }));
      // older day outside 7d window
      memory.set('2026-06-01', emptyDay('2026-06-01', { characters: 99 }));

      const now = new Date(2026, 6, 9, 12, 0, 0);
      const days = await loadDaysForPeriod('7d', now);
      const dates = days.map((d) => d.date).sort();
      expect(dates).toEqual(['2026-07-08', '2026-07-09']);
      expect(days.every((d) => d.date !== '2026-06-01')).toBe(true);
    });

    it('loads all records for all period', async () => {
      memory.set('2026-01-01', emptyDay('2026-01-01', { characters: 1 }));
      memory.set('2026-07-09', emptyDay('2026-07-09', { characters: 2 }));
      const days = await loadDaysForPeriod('all');
      expect(days).toHaveLength(2);
    });
  });
});
