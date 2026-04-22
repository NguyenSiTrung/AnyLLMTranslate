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
