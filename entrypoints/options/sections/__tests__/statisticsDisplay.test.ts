import { describe, expect, it } from 'vitest';
import { ZERO_COUNTERS, type DailyStatRecord, type StatCounters } from '@/types/stats';
import {
  buildChartDays,
  buildLast30Days,
  formatCompactDate,
  formatCompactNumber,
  formatDelta,
  formatFullDate,
  getCacheEfficiency,
  hasDailyActivity,
} from '../statisticsDisplay';

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

describe('statisticsDisplay', () => {
  describe('buildLast30Days', () => {
    it('returns exactly 30 chronological days with zero-filled gaps', () => {
      const days = buildLast30Days(
        [
          { date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 },
          { date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 },
        ],
        new Date('2026-05-06T10:00:00Z'),
      );

      expect(days).toHaveLength(30);
      expect(days[0]).toMatchObject({ date: '2026-04-07', chars: 0, apiCalls: 0, cacheHits: 0 });
      expect(days[1]).toMatchObject({ date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 });
      expect(days[29]).toMatchObject({ date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 });
    });

    it('ignores stored entries outside the 30-day display range', () => {
      const days = buildLast30Days(
        [{ date: '2026-04-01', chars: 999, apiCalls: 9, cacheHits: 9 }],
        new Date('2026-05-06T10:00:00Z'),
      );

      expect(days.some((day) => day.date === '2026-04-01')).toBe(false);
      expect(hasDailyActivity(days)).toBe(false);
    });
  });

  describe('buildChartDays', () => {
    it('zero-fills 7 local calendar days including today', () => {
      const now = new Date(2026, 6, 9, 15, 0, 0); // local Jul 9, 2026
      const days = buildChartDays(
        [emptyDay('2026-07-09', { characters: 1200, apiCalls: 3, cacheHits: 5 })],
        '7d',
        now,
      );

      expect(days).toHaveLength(7);
      expect(days[0].date).toBe('2026-07-03');
      expect(days[6].date).toBe('2026-07-09');
      expect(days[0]).toMatchObject({ chars: 0, apiCalls: 0, cacheHits: 0 });
      expect(days[6]).toMatchObject({
        date: '2026-07-09',
        chars: 1200,
        apiCalls: 3,
        cacheHits: 5,
      });
    });

    it('maps DailyStatRecord.totals.characters onto chars for chart height', () => {
      const now = new Date(2026, 6, 9);
      const days = buildChartDays(
        [emptyDay('2026-07-08', { characters: 42, apiCalls: 2, cacheHits: 1 })],
        '7d',
        now,
      );
      const hit = days.find((d) => d.date === '2026-07-08');
      expect(hit?.chars).toBe(42);
      expect(hit?.apiCalls).toBe(2);
      expect(hit?.cacheHits).toBe(1);
    });

    it('returns 30 and 90 days for those periods', () => {
      const now = new Date(2026, 6, 9);
      expect(buildChartDays([], '30d', now)).toHaveLength(30);
      expect(buildChartDays([], '90d', now)).toHaveLength(90);
    });

    it('ignores records outside the selected finite period', () => {
      const now = new Date(2026, 6, 9);
      const days = buildChartDays(
        [
          emptyDay('2026-06-01', { characters: 999 }),
          emptyDay('2026-07-09', { characters: 10 }),
        ],
        '7d',
        now,
      );
      expect(days.some((d) => d.date === '2026-06-01')).toBe(false);
      expect(days.find((d) => d.date === '2026-07-09')?.chars).toBe(10);
    });

    it('for all: zero-fills between earliest and latest retained day only', () => {
      const days = buildChartDays(
        [
          emptyDay('2026-07-01', { characters: 5, apiCalls: 1 }),
          emptyDay('2026-07-03', { characters: 15, apiCalls: 2 }),
        ],
        'all',
        new Date(2026, 6, 9),
      );

      expect(days.map((d) => d.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
      expect(days[0].chars).toBe(5);
      expect(days[1].chars).toBe(0);
      expect(days[2].chars).toBe(15);
    });

    it('for all with no records returns empty array', () => {
      expect(buildChartDays([], 'all', new Date(2026, 6, 9))).toEqual([]);
    });

    it('attaches compact and full date labels', () => {
      const now = new Date(2026, 6, 9);
      const days = buildChartDays(
        [emptyDay('2026-07-09', { characters: 1 })],
        '7d',
        now,
        'en-US',
      );
      const last = days[days.length - 1];
      expect(last.label).toBe(formatCompactDate('2026-07-09', 'en-US'));
      expect(last.fullLabel).toBe(formatFullDate('2026-07-09', 'en-US'));
    });
  });

  describe('formatCompactDate', () => {
    it('formats ISO date keys as compact localized dates', () => {
      expect(formatCompactDate('2026-05-06', 'en-US')).toBe('May 6');
    });
  });

  describe('formatFullDate', () => {
    it('includes the year', () => {
      expect(formatFullDate('2026-05-06', 'en-US')).toBe('May 6, 2026');
    });
  });

  describe('formatCompactNumber', () => {
    it('formats thousands with one decimal K', () => {
      expect(formatCompactNumber(1200)).toBe('1.2K');
    });

    it('omits trailing .0 for exact thousands', () => {
      expect(formatCompactNumber(1000)).toBe('1K');
    });

    it('leaves small numbers unabbreviated', () => {
      expect(formatCompactNumber(0)).toBe('0');
      expect(formatCompactNumber(999)).toBe('999');
    });

    it('formats millions with M', () => {
      expect(formatCompactNumber(1_500_000)).toBe('1.5M');
      expect(formatCompactNumber(1_000_000)).toBe('1M');
    });

    it('formats billions with B', () => {
      expect(formatCompactNumber(2_300_000_000)).toBe('2.3B');
    });

    it('preserves sign for negatives', () => {
      expect(formatCompactNumber(-1200)).toBe('-1.2K');
    });
  });

  describe('formatDelta', () => {
    it('returns em dash for null', () => {
      expect(formatDelta(null)).toBe('—');
    });

    it('prefixes positive deltas with + and percent', () => {
      expect(formatDelta(12)).toBe('+12%');
      expect(formatDelta(12.4)).toBe('+12%');
    });

    it('formats negative deltas without double signs', () => {
      expect(formatDelta(-5)).toBe('-5%');
      expect(formatDelta(-5.6)).toBe('-6%');
    });

    it('formats zero without a plus sign', () => {
      expect(formatDelta(0)).toBe('0%');
    });
  });

  describe('hasDailyActivity', () => {
    it('is false when all counters are zero', () => {
      expect(
        hasDailyActivity([{ date: '2026-07-01', chars: 0, apiCalls: 0, cacheHits: 0 }]),
      ).toBe(false);
    });

    it('is true when any chart counter is positive', () => {
      expect(
        hasDailyActivity([{ date: '2026-07-01', chars: 1, apiCalls: 0, cacheHits: 0 }]),
      ).toBe(true);
      expect(
        hasDailyActivity([{ date: '2026-07-01', chars: 0, apiCalls: 1, cacheHits: 0 }]),
      ).toBe(true);
      expect(
        hasDailyActivity([{ date: '2026-07-01', chars: 0, apiCalls: 0, cacheHits: 1 }]),
      ).toBe(true);
    });
  });

  describe('getCacheEfficiency', () => {
    it('returns null hit rate when there is no cache activity', () => {
      expect(getCacheEfficiency(0, 0)).toEqual({ totalOps: 0, hitRate: null });
    });

    it('rounds hit rate when cache activity exists', () => {
      expect(getCacheEfficiency(2, 1)).toEqual({ totalOps: 3, hitRate: 67 });
    });

    it('returns null for negative inputs', () => {
      expect(getCacheEfficiency(-1, 0)).toEqual({ totalOps: 0, hitRate: null });
    });
  });
});
