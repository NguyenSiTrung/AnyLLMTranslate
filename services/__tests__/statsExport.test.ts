/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ZERO_COUNTERS,
  DEFAULT_STATS_V2,
  type DailyStatRecord,
  type TranslationStatsV2,
} from '@/types/stats';
import {
  buildStatsJsonExport,
  buildStatsCsvExport,
  triggerDownload,
} from '../statsExport';

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
    it('JSON includes lifetime and daily dimensions, no apiKey field', () => {
      const summary = makeSummary();
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
      expect(json).not.toMatch(/apiKey/);
    });

    it('omits version and recentDailySummary from export payload', () => {
      const summary = makeSummary({
        recentDailySummary: [
          { date: '2026-07-09', totals: { ...ZERO_COUNTERS, characters: 5 } },
        ],
      });
      const json = buildStatsJsonExport({ summary, daily: [] });
      const parsed = JSON.parse(json);

      expect(parsed.version).toBeUndefined();
      expect(parsed.recentDailySummary).toBeUndefined();
      expect(Object.keys(parsed).sort()).toEqual(
        ['daily', 'lastActiveAt', 'lifetime', 'preferences', 'trackingSince'].sort(),
      );
    });

    it('does not leak extraneous sensitive-looking fields from summary', () => {
      const dirty = {
        ...makeSummary(),
        apiKey: 'sk-secret',
      } as TranslationStatsV2 & { apiKey: string };

      const json = buildStatsJsonExport({ summary: dirty, daily: [] });
      expect(json).not.toMatch(/apiKey/);
      expect(json).not.toMatch(/sk-secret/);
    });
  });

  describe('buildStatsCsvExport', () => {
    it('CSV has header and one row per day totals only', () => {
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

      const csv = buildStatsCsvExport([day]);
      const lines = csv.trim().split('\n');

      expect(lines[0]).toContain('date,characters,apiCalls');
      expect(lines[0]).toBe(CSV_HEADER);
      expect(lines).toHaveLength(2);
      expect(csv).not.toContain('byHost');
      expect(csv).not.toContain('youtube.com');
      expect(lines[1]).toBe('2026-07-08,50,3,1,2,20,1,4,0,1,0');
    });

    it('emits header only when daily is empty', () => {
      const csv = buildStatsCsvExport([]);
      expect(csv.trim()).toBe(CSV_HEADER);
    });

    it('emits one data row per day in order', () => {
      const days = [
        makeDay('2026-07-01', { characters: 1 }),
        makeDay('2026-07-02', { characters: 2, apiCalls: 1 }),
      ];
      const lines = buildStatsCsvExport(days).trim().split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[1]).toBe('2026-07-01,1,0,0,0,0,0,0,0,0,0');
      expect(lines[2]).toBe('2026-07-02,2,1,0,0,0,0,0,0,0,0');
    });
  });

  describe('triggerDownload', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });

    it('creates a blob URL, clicks an anchor, and revokes the URL', () => {
      const click = vi.fn();
      const anchor = {
        href: '',
        download: '',
        click,
      } as unknown as HTMLAnchorElement;

      const createElement = vi
        .spyOn(document, 'createElement')
        .mockReturnValue(anchor);

      triggerDownload('anyllm-stats-2026-07-09.json', '{"ok":true}', 'application/json');

      expect(createElement).toHaveBeenCalledWith('a');
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      const blobArg = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Blob;
      expect(blobArg).toBeInstanceOf(Blob);
      expect(blobArg.type).toBe('application/json');
      expect(anchor.href).toBe('blob:mock-url');
      expect(anchor.download).toBe('anyllm-stats-2026-07-09.json');
      expect(click).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });
});
