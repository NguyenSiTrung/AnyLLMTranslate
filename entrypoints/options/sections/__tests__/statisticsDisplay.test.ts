import { describe, expect, it } from 'vitest';
import {
  buildLast30Days,
  formatCompactDate,
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
  });

  describe('formatCompactDate', () => {
    it('formats ISO date keys as compact localized dates', () => {
      expect(formatCompactDate('2026-05-06', 'en-US')).toBe('May 6');
    });
  });

  describe('getCacheEfficiency', () => {
    it('returns null hit rate when there is no cache activity', () => {
      expect(getCacheEfficiency(0, 0)).toEqual({ total: 0, hitRate: null });
    });

    it('rounds hit rate when cache activity exists', () => {
      expect(getCacheEfficiency(2, 1)).toEqual({ total: 3, hitRate: 67 });
    });
  });
});
