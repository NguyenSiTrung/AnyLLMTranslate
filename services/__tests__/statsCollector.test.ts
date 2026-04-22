import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStats, incrementStats, recordDailyStats, resetStats } from '@/services/statsCollector';
import { DEFAULT_STATS } from '@/types/stats';

let mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: mockStorage[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string) => {
        mockStorage = Object.fromEntries(
          Object.entries(mockStorage).filter(([k]) => k !== key),
        );
        return Promise.resolve();
      }),
    },
  },
});

beforeEach(() => {
  mockStorage = {};
  vi.clearAllMocks();
});

describe('statsCollector', () => {
  describe('getStats', () => {
    it('should return defaults when storage is empty', async () => {
      // Arrange — storage is empty

      // Act
      const stats = await getStats();

      // Assert
      expect(stats).toEqual(DEFAULT_STATS);
    });
  });

  describe('incrementStats', () => {
    it('should add to cumulative counters', async () => {
      // Arrange — empty storage

      // Act
      await incrementStats({ totalCharactersTranslated: 100, totalApiCalls: 1 });

      // Assert
      const stats = await getStats();
      expect(stats.totalCharactersTranslated).toBe(100);
      expect(stats.totalApiCalls).toBe(1);
      expect(stats.totalCacheHits).toBe(0);
    });

    it('should accumulate across multiple calls', async () => {
      // Arrange
      await incrementStats({ totalCharactersTranslated: 50, totalApiCalls: 1 });

      // Act
      await incrementStats({ totalCharactersTranslated: 75, totalApiCalls: 2, totalCacheHits: 3 });

      // Assert
      const stats = await getStats();
      expect(stats.totalCharactersTranslated).toBe(125);
      expect(stats.totalApiCalls).toBe(3);
      expect(stats.totalCacheHits).toBe(3);
    });

    it('should handle concurrent increments without losing updates', async () => {
      // Arrange — empty storage

      // Act — fire 10 increments concurrently
      await Promise.all(
        Array.from({ length: 10 }, () => incrementStats({ totalApiCalls: 1, totalCharactersTranslated: 10 })),
      );

      // Assert
      const stats = await getStats();
      expect(stats.totalApiCalls).toBe(10);
      expect(stats.totalCharactersTranslated).toBe(100);
    });
  });

  describe('recordDailyStats', () => {
    it('should create an entry for today', async () => {
      // Arrange
      const today = new Date().toISOString().slice(0, 10);

      // Act
      await recordDailyStats(200, 2, 1);

      // Assert
      const stats = await getStats();
      expect(stats.dailyStats).toHaveLength(1);
      expect(stats.dailyStats[0]).toEqual({ date: today, chars: 200, apiCalls: 2, cacheHits: 1 });
    });

    it('should update existing entry for today', async () => {
      // Arrange
      await recordDailyStats(100, 1, 0);

      // Act
      await recordDailyStats(150, 2, 1);

      // Assert
      const stats = await getStats();
      expect(stats.dailyStats).toHaveLength(1);
      expect(stats.dailyStats[0].chars).toBe(250);
      expect(stats.dailyStats[0].apiCalls).toBe(3);
      expect(stats.dailyStats[0].cacheHits).toBe(1);
    });

    it('should handle concurrent daily stats without losing updates', async () => {
      // Arrange — empty storage

      // Act — fire 10 concurrent daily updates
      await Promise.all(
        Array.from({ length: 10 }, () => recordDailyStats(10, 1, 0)),
      );

      // Assert
      const stats = await getStats();
      expect(stats.dailyStats).toHaveLength(1);
      expect(stats.dailyStats[0].chars).toBe(100);
      expect(stats.dailyStats[0].apiCalls).toBe(10);
    });

    it('should prune entries beyond 30 days', async () => {
      // Arrange — seed 30 existing entries
      const dailyStats = Array.from({ length: 30 }, (_, i) => ({
        date: `2025-01-${String(i + 1).padStart(2, '0')}`,
        chars: 10,
        apiCalls: 1,
        cacheHits: 0,
      }));
      mockStorage['anyllm-translate-stats'] = { ...DEFAULT_STATS, dailyStats };

      // Act — add one more (today)
      await recordDailyStats(50, 1, 0);

      // Assert
      const stats = await getStats();
      expect(stats.dailyStats.length).toBeLessThanOrEqual(30);
      // Oldest entry (2025-01-01) should have been pruned
      expect(stats.dailyStats.find(d => d.date === '2025-01-01')).toBeUndefined();
    });
  });

  describe('resetStats', () => {
    it('should clear all stats', async () => {
      // Arrange
      await incrementStats({ totalCharactersTranslated: 500, totalApiCalls: 10 });

      // Act
      await resetStats();

      // Assert
      const stats = await getStats();
      expect(stats).toEqual(DEFAULT_STATS);
    });
  });
});
