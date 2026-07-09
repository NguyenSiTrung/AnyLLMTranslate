import {
  DEFAULT_STATS,
  DEFAULT_STATS_V2,
  ZERO_COUNTERS,
  type DailyStat,
  type DailyStatRecord,
  type StatCounters,
  type TranslationStats,
  type TranslationStatsV2,
} from '@/types/stats';
import { setDailyRecord } from '@/services/statsIdb';

export const STATS_STORAGE_KEY = 'anyllm-translate-stats';

/** Promise chain to serialize all stats storage updates and prevent race conditions. */
let updateChain: Promise<unknown> = Promise.resolve();

/** Wrap an update function in the serialized chain. Errors propagate to the caller
 *  but do not break the chain for subsequent updates. */
function chainUpdate<T>(fn: () => Promise<T>): Promise<T> {
  const p = updateChain.then(fn);
  updateChain = p.catch(() => {});
  return p;
}

// ---------------------------------------------------------------------------
// v1 API (kept for current UI until later tasks migrate readers/writers)
// ---------------------------------------------------------------------------

export async function getStats(): Promise<TranslationStats> {
  const result = await chrome.storage.local.get(STATS_STORAGE_KEY);
  return result[STATS_STORAGE_KEY] ?? { ...DEFAULT_STATS };
}

export async function resetStats(): Promise<void> {
  return chainUpdate(async () => {
    await chrome.storage.local.remove(STATS_STORAGE_KEY);
  });
}

export async function incrementStats(
  partial: Partial<Omit<TranslationStats, 'dailyStats'>>,
): Promise<void> {
  return chainUpdate(async () => {
    const current = await getStats();
    const updated: TranslationStats = {
      ...current,
      totalCharactersTranslated:
        current.totalCharactersTranslated + (partial.totalCharactersTranslated ?? 0),
      totalApiCalls: current.totalApiCalls + (partial.totalApiCalls ?? 0),
      totalCacheHits: current.totalCacheHits + (partial.totalCacheHits ?? 0),
      totalCacheMisses: current.totalCacheMisses + (partial.totalCacheMisses ?? 0),
      totalPagesTranslated:
        current.totalPagesTranslated + (partial.totalPagesTranslated ?? 0),
      totalSubtitlesCuesTranslated:
        current.totalSubtitlesCuesTranslated + (partial.totalSubtitlesCuesTranslated ?? 0),
    };
    await chrome.storage.local.set({ [STATS_STORAGE_KEY]: updated });
  });
}

export async function recordDailyStats(
  chars: number,
  apiCalls: number,
  cacheHits: number,
): Promise<void> {
  return chainUpdate(async () => {
    const current = await getStats();
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    const daily = [...current.dailyStats];
    const idx = daily.findIndex((d) => d.date === today);
    if (idx >= 0) {
      daily[idx] = {
        date: today,
        chars: daily[idx].chars + chars,
        apiCalls: daily[idx].apiCalls + apiCalls,
        cacheHits: daily[idx].cacheHits + cacheHits,
      };
    } else {
      daily.push({ date: today, chars, apiCalls, cacheHits });
    }
    // Prune entries older than 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toLocaleDateString('en-CA');
    const pruned = daily.filter((d) => d.date >= cutoffStr);
    await chrome.storage.local.set({
      [STATS_STORAGE_KEY]: { ...current, dailyStats: pruned },
    });
  });
}

// ---------------------------------------------------------------------------
// v2 API — load + migrate
// ---------------------------------------------------------------------------

function cloneDefaultStatsV2(trackingSince?: string): TranslationStatsV2 {
  return {
    version: 2,
    trackingSince: trackingSince ?? new Date().toISOString(),
    lastActiveAt: null,
    lifetime: { ...ZERO_COUNTERS },
    recentDailySummary: [],
    preferences: {
      hostTrackingEnabled: DEFAULT_STATS_V2.preferences.hostTrackingEnabled,
      retentionDays: DEFAULT_STATS_V2.preferences.retentionDays,
    },
  };
}

function noonUtcIso(dateYmd: string): string {
  return `${dateYmd}T12:00:00.000Z`;
}

function normalizeStatsV2(raw: Partial<TranslationStatsV2> & { version?: number }): TranslationStatsV2 {
  const lifetimePartial = raw.lifetime ?? {};
  const lifetime: StatCounters = { ...ZERO_COUNTERS };
  for (const key of Object.keys(ZERO_COUNTERS) as Array<keyof StatCounters>) {
    const value = lifetimePartial[key];
    lifetime[key] = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  const prefs = raw.preferences;
  const retention = prefs?.retentionDays;
  const retentionDays: 30 | 90 | 180 =
    retention === 30 || retention === 90 || retention === 180 ? retention : 90;

  return {
    version: 2,
    trackingSince:
      typeof raw.trackingSince === 'string' && raw.trackingSince.length > 0
        ? raw.trackingSince
        : new Date().toISOString(),
    lastActiveAt:
      raw.lastActiveAt === null || typeof raw.lastActiveAt === 'string'
        ? raw.lastActiveAt
        : null,
    lifetime,
    recentDailySummary: Array.isArray(raw.recentDailySummary)
      ? raw.recentDailySummary.map((row) => ({
          date: row.date,
          totals: { ...ZERO_COUNTERS, ...row.totals },
        }))
      : [],
    preferences: {
      hostTrackingEnabled:
        typeof prefs?.hostTrackingEnabled === 'boolean'
          ? prefs.hostTrackingEnabled
          : true,
      retentionDays,
    },
  };
}

function mapV1Lifetime(v1: Partial<TranslationStats>): StatCounters {
  return {
    ...ZERO_COUNTERS,
    characters: v1.totalCharactersTranslated ?? 0,
    apiCalls: v1.totalApiCalls ?? 0,
    cacheHits: v1.totalCacheHits ?? 0,
    cacheMisses: v1.totalCacheMisses ?? 0,
    pageSessions: v1.totalPagesTranslated ?? 0,
    subtitleCues: v1.totalSubtitlesCuesTranslated ?? 0,
  };
}

function mapV1DailyToRecord(day: DailyStat): DailyStatRecord {
  return {
    date: day.date,
    totals: {
      ...ZERO_COUNTERS,
      characters: day.chars ?? 0,
      apiCalls: day.apiCalls ?? 0,
      cacheHits: day.cacheHits ?? 0,
    },
    byMode: {},
    byProvider: {},
    byHost: {},
    byLanguagePair: {},
  };
}

function buildRecentDailySummary(
  records: DailyStatRecord[],
): TranslationStatsV2['recentDailySummary'] {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-30);
  return recent.map((r) => ({
    date: r.date,
    totals: { ...r.totals },
  }));
}

/**
 * Migrate raw chrome.storage stats payload to TranslationStatsV2.
 * - undefined/null → defaults (caller decides whether to persist; preferred: no write on empty)
 * - version === 2 → normalize missing fields
 * - else → treat as v1, write daily rows to IDB, return v2 (caller persists summary)
 */
export async function migrateStatsIfNeeded(raw: unknown): Promise<TranslationStatsV2> {
  if (raw === undefined || raw === null) {
    return cloneDefaultStatsV2();
  }

  if (typeof raw !== 'object') {
    return cloneDefaultStatsV2();
  }

  const obj = raw as Record<string, unknown>;

  if (obj.version === 2) {
    return normalizeStatsV2(obj as Partial<TranslationStatsV2>);
  }

  // v1 (or unknown pre-v2 shape)
  const v1 = obj as Partial<TranslationStats>;
  const dailyStats: DailyStat[] = Array.isArray(v1.dailyStats) ? v1.dailyStats : [];
  const dailyRecords: DailyStatRecord[] = [];

  for (const day of dailyStats) {
    if (!day || typeof day.date !== 'string') continue;
    const record = mapV1DailyToRecord(day);
    dailyRecords.push(record);
    await setDailyRecord(record);
  }

  dailyRecords.sort((a, b) => a.date.localeCompare(b.date));
  const earliest = dailyRecords[0]?.date;
  const latest = dailyRecords[dailyRecords.length - 1]?.date;

  const migrated: TranslationStatsV2 = {
    version: 2,
    trackingSince: earliest ? noonUtcIso(earliest) : new Date().toISOString(),
    lastActiveAt: latest ? noonUtcIso(latest) : null,
    lifetime: mapV1Lifetime(v1),
    recentDailySummary: buildRecentDailySummary(dailyRecords),
    preferences: {
      hostTrackingEnabled: true,
      retentionDays: 90,
    },
  };

  return migrated;
}

/**
 * Load stats as v2, migrating from v1 when needed.
 * Empty storage: returns defaults without writing (persist deferred until first write).
 * v1 storage: migrates daily rows to IDB and overwrites chrome.storage with v2 summary.
 */
export async function getStatsV2(): Promise<TranslationStatsV2> {
  const result = await chrome.storage.local.get(STATS_STORAGE_KEY);
  const raw = result[STATS_STORAGE_KEY] as unknown;

  if (raw === undefined || raw === null) {
    // Preferred: return defaults without write on empty storage
    return cloneDefaultStatsV2();
  }

  if (typeof raw === 'object' && (raw as { version?: unknown }).version === 2) {
    return normalizeStatsV2(raw as Partial<TranslationStatsV2>);
  }

  // v1 → v2 migration (persist summary; dailies go to IDB inside migrateStatsIfNeeded)
  const migrated = await migrateStatsIfNeeded(raw);
  await chrome.storage.local.set({ [STATS_STORAGE_KEY]: migrated });
  return migrated;
}
