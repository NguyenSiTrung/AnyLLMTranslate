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
    it('zero-fills 30 days, maps counters, and ignores out-of-range entries', () => {
      const days = buildLast30Days(
        [
          { date: '2026-04-01', chars: 999, apiCalls: 9, cacheHits: 9 },
          { date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 },
          { date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 },
        ],
        new Date('2026-05-06T10:00:00Z'),
      );

      expect(days).toHaveLength(30);
      expect(days[0]).toMatchObject({ date: '2026-04-07', chars: 0, apiCalls: 0, cacheHits: 0 });
      expect(days[1]).toMatchObject({ date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 });
      expect(days[29]).toMatchObject({ date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 });
      expect(days.some((day) => day.date === '2026-04-01')).toBe(false);
    });
  });

  describe('buildChartDays', () => {
    it('zero-fills finite periods, maps characters→chars, and drops out-of-range records', () => {
      const now = new Date(2026, 6, 9, 15, 0, 0); // local Jul 9, 2026
      const days7 = buildChartDays(
        [
          emptyDay('2026-06-01', { characters: 999 }),
          emptyDay('2026-07-08', { characters: 42, apiCalls: 2, cacheHits: 1 }),
          emptyDay('2026-07-09', { characters: 1200, apiCalls: 3, cacheHits: 5 }),
        ],
        '7d',
        now,
        'en-US',
      );

      expect(days7).toHaveLength(7);
      expect(days7[0].date).toBe('2026-07-03');
      expect(days7[6].date).toBe('2026-07-09');
      expect(days7.some((d) => d.date === '2026-06-01')).toBe(false);
      expect(days7.find((d) => d.date === '2026-07-08')).toMatchObject({
        chars: 42,
        apiCalls: 2,
        cacheHits: 1,
      });
      expect(days7[6]).toMatchObject({ date: '2026-07-09', chars: 1200, apiCalls: 3, cacheHits: 5 });
      expect(days7[6].label).toBe(formatCompactDate('2026-07-09', 'en-US'));
      expect(days7[6].fullLabel).toBe(formatFullDate('2026-07-09', 'en-US'));

      expect(buildChartDays([], '30d', now)).toHaveLength(30);
      expect(buildChartDays([], '90d', now)).toHaveLength(90);
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
      expect(days.map((d) => d.chars)).toEqual([5, 0, 15]);
      expect(buildChartDays([], 'all', new Date(2026, 6, 9))).toEqual([]);
    });
  });

  describe('formatters and activity helpers', () => {
    it('formats dates, compact numbers, and deltas', () => {
      expect(formatCompactDate('2026-05-06', 'en-US')).toBe('May 6');
      expect(formatFullDate('2026-05-06', 'en-US')).toBe('May 6, 2026');

      expect(formatCompactNumber(0)).toBe('0');
      expect(formatCompactNumber(999)).toBe('999');
      expect(formatCompactNumber(1000)).toBe('1K');
      expect(formatCompactNumber(1200)).toBe('1.2K');
      expect(formatCompactNumber(1_000_000)).toBe('1M');
      expect(formatCompactNumber(1_500_000)).toBe('1.5M');
      expect(formatCompactNumber(2_300_000_000)).toBe('2.3B');
      expect(formatCompactNumber(-1200)).toBe('-1.2K');

      expect(formatDelta(null)).toBe('—');
      expect(formatDelta(0)).toBe('0%');
      expect(formatDelta(12.4)).toBe('+12%');
      expect(formatDelta(-5.6)).toBe('-6%');
    });

    it('detects chart activity and computes cache efficiency', () => {
      expect(
        hasDailyActivity([{ date: '2026-07-01', chars: 0, apiCalls: 0, cacheHits: 0 }]),
      ).toBe(false);
      expect(
        hasDailyActivity([{ date: '2026-07-01', chars: 1, apiCalls: 0, cacheHits: 0 }]),
      ).toBe(true);
      expect(
        hasDailyActivity([{ date: '2026-07-01', chars: 0, apiCalls: 1, cacheHits: 0 }]),
      ).toBe(true);

      expect(getCacheEfficiency(0, 0)).toEqual({ totalOps: 0, hitRate: null });
      expect(getCacheEfficiency(-1, 0)).toEqual({ totalOps: 0, hitRate: null });
      expect(getCacheEfficiency(2, 1)).toEqual({ totalOps: 3, hitRate: 67 });
    });
  });
});
