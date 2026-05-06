import { describe, expect, it } from 'vitest';
import {
  buildLast30Days,
  formatCompactDate,
  formatFullDate,
  getCacheEfficiency,
  hasDailyActivity,
} from '../statisticsDisplay';

describe('statisticsDisplay', () => {
  describe('buildLast30Days', () => {
    it('returns exactly 30 chronological days with zero-filled gaps', () => {
      const days = buildLast30Days([
        { date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 },
        { date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 },
      ], new Date('2026-05-06T10:00:00Z'));

      expect(days).toHaveLength(30);
      expect(days[0]).toMatchObject({ date: '2026-04-07', chars: 0, apiCalls: 0, cacheHits: 0 });
      expect(days[1]).toMatchObject({ date: '2026-04-08', chars: 100, apiCalls: 1, cacheHits: 2 });
      expect(days[29]).toMatchObject({ date: '2026-05-06', chars: 500, apiCalls: 3, cacheHits: 4 });
    });

    it('ignores stored entries outside the 30-day display range', () => {
      const days = buildLast30Days([
        { date: '2026-04-01', chars: 999, apiCalls: 9, cacheHits: 9 },
      ], new Date('2026-05-06T10:00:00Z'));

      expect(days.some((day) => day.date === '2026-04-01')).toBe(false);
      expect(hasDailyActivity(days)).toBe(false);
    });

    it('returns 30 zero-filled days when given an empty array', () => {
      const days = buildLast30Days([], new Date('2026-05-06T10:00:00Z'));

      expect(days).toHaveLength(30);
      expect(days.every((d) => d.chars === 0 && d.apiCalls === 0 && d.cacheHits === 0)).toBe(true);
    });

    it('only keeps the last 30 days when input is longer than 30 days', () => {
      const longInput = Array.from({ length: 35 }, (_, i) => ({
        date: `2026-04-${String(i + 2).padStart(2, '0')}`,
        chars: i + 1,
        apiCalls: i + 1,
        cacheHits: i + 1,
      }));

      const days = buildLast30Days(longInput, new Date('2026-05-06T10:00:00Z'));

      expect(days).toHaveLength(30);
      expect(days[0].date).toBe('2026-04-07');
      expect(days[29].date).toBe('2026-05-06');
    });

    it('has no gaps when every day in the 30-day window has data', () => {
      const fullWindow = Array.from({ length: 30 }, (_, i) => {
        const date = new Date('2026-05-06T10:00:00Z');
        date.setUTCDate(date.getUTCDate() - (29 - i));
        const dateKey = date.toISOString().slice(0, 10);
        return { date: dateKey, chars: 10, apiCalls: 1, cacheHits: 1 };
      });

      const days = buildLast30Days(fullWindow, new Date('2026-05-06T10:00:00Z'));

      expect(days).toHaveLength(30);
      expect(days.every((d) => d.chars === 10 && d.apiCalls === 1 && d.cacheHits === 1)).toBe(true);
    });
  });

  describe('formatCompactDate', () => {
    it('formats ISO date keys as compact localized dates', () => {
      expect(formatCompactDate('2026-05-06', 'en-US')).toBe('May 6');
    });

    it('throws for malformed date keys', () => {
      expect(() => formatCompactDate('not-a-date', 'en-US')).toThrow(
        'Invalid dateKey format: expected YYYY-MM-DD, got "not-a-date"',
      );
    });
  });

  describe('formatFullDate', () => {
    it('formats ISO date keys as full localized dates with year', () => {
      expect(formatFullDate('2026-05-06', 'en-US')).toBe('May 6, 2026');
    });

    it('throws for malformed date keys', () => {
      expect(() => formatFullDate('06-05-2026', 'en-US')).toThrow(
        'Invalid dateKey format: expected YYYY-MM-DD, got "06-05-2026"',
      );
    });
  });

  describe('hasDailyActivity', () => {
    it('returns false for an empty array', () => {
      expect(hasDailyActivity([])).toBe(false);
    });

    it('returns false when all entries are zero', () => {
      expect(hasDailyActivity([
        { date: '2026-05-01', chars: 0, apiCalls: 0, cacheHits: 0 },
        { date: '2026-05-02', chars: 0, apiCalls: 0, cacheHits: 0 },
      ])).toBe(false);
    });

    it('returns true when only cacheHits is positive', () => {
      expect(hasDailyActivity([
        { date: '2026-05-01', chars: 0, apiCalls: 0, cacheHits: 5 },
      ])).toBe(true);
    });
  });

  describe('getCacheEfficiency', () => {
    it('returns null hit rate when there is no cache activity', () => {
      expect(getCacheEfficiency(0, 0)).toEqual({ totalOps: 0, hitRate: null });
    });

    it('rounds hit rate when cache activity exists', () => {
      expect(getCacheEfficiency(2, 1)).toEqual({ totalOps: 3, hitRate: 67 });
    });

    it('returns 0 hit rate when there are only misses', () => {
      expect(getCacheEfficiency(0, 5)).toEqual({ totalOps: 5, hitRate: 0 });
    });

    it('returns null hit rate for negative inputs', () => {
      expect(getCacheEfficiency(-1, 5)).toEqual({ totalOps: 0, hitRate: null });
      expect(getCacheEfficiency(1, -5)).toEqual({ totalOps: 0, hitRate: null });
    });
  });
});
