export interface DailyStat {
  date: string;
  chars: number;
  apiCalls: number;
  cacheHits: number;
}

export interface TranslationStats {
  totalCharactersTranslated: number;
  totalApiCalls: number;
  totalCacheHits: number;
  totalCacheMisses: number;
  totalPagesTranslated: number;
  totalSubtitlesCuesTranslated: number;
  dailyStats: DailyStat[];
}

export const DEFAULT_STATS: TranslationStats = {
  totalCharactersTranslated: 0,
  totalApiCalls: 0,
  totalCacheHits: 0,
  totalCacheMisses: 0,
  totalPagesTranslated: 0,
  totalSubtitlesCuesTranslated: 0,
  dailyStats: [],
};

// --- Stats v2 ---

export type TranslationMode = 'page' | 'subtitle' | 'selection' | 'inline' | 'pdf';

export interface StatCounters {
  characters: number;
  apiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  cacheCharacters: number;
  pageSessions: number;
  subtitleCues: number;
  selectionEvents: number;
  inlineEvents: number;
  pdfEvents: number;
}

export interface DailyStatRecord {
  date: string;
  totals: StatCounters;
  byMode: Partial<Record<TranslationMode, Partial<StatCounters>>>;
  byProvider: Record<string, Partial<StatCounters>>;
  byHost: Record<string, Partial<StatCounters>>;
  byLanguagePair: Record<string, Partial<StatCounters>>;
}

export interface StatsPreferences {
  hostTrackingEnabled: boolean;
  retentionDays: 30 | 90 | 180;
}

export interface TranslationStatsV2 {
  version: 2;
  trackingSince: string;
  lastActiveAt: string | null;
  lifetime: StatCounters;
  recentDailySummary: Array<{ date: string; totals: StatCounters }>;
  preferences: StatsPreferences;
}

export const ZERO_COUNTERS: StatCounters = {
  characters: 0,
  apiCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheCharacters: 0,
  pageSessions: 0,
  subtitleCues: 0,
  selectionEvents: 0,
  inlineEvents: 0,
  pdfEvents: 0,
};

export const DEFAULT_STATS_V2: TranslationStatsV2 = {
  version: 2,
  trackingSince: new Date(0).toISOString(), // overwritten on first write/migrate
  lastActiveAt: null,
  lifetime: { ...ZERO_COUNTERS },
  recentDailySummary: [],
  preferences: { hostTrackingEnabled: true, retentionDays: 90 },
};
