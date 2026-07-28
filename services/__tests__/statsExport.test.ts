import { describe, it, expect } from 'vitest';
import {
  ZERO_COUNTERS,
  DEFAULT_STATS_V2,
  type DailyStatRecord,
  type TranslationStatsV2,
} from '@/types/stats';
import { buildStatsJsonExport, buildStatsCsvExport } from '../statsExport';

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

describe('statsExport', () => {
  describe('buildStatsJsonExport', () => {
    it('includes lifetime/daily dims, omits version/recentDailySummary, and never leaks apiKey', () => {
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
    });
  });

  describe('buildStatsCsvExport', () => {
    it('emits header-only for empty, one totals row per day in order, without byHost', () => {
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
});
