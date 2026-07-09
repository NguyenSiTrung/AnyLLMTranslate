import {
  DEFAULT_STATS,
  DEFAULT_STATS_V2,
  ZERO_COUNTERS,
  type DailyStat,
  type DailyStatRecord,
  type StatCounters,
  type StatsPreferences,
  type TranslationMode,
  type TranslationStats,
  type TranslationStatsV2,
} from '@/types/stats';
import {
  clearAllDailyRecords,
  deleteDailyRecordsBefore,
  getAllDailyRecords,
  getDailyRecord,
  setDailyRecord,
} from '@/services/statsIdb';
import {
  addPartialCounters,
  languagePairKey,
  mergeCounters,
  mergeDimensionMap,
  normalizeHost,
} from '@/services/statsCounters';

export const STATS_STORAGE_KEY = 'anyllm-translate-stats';

/** Max host keys retained per daily record (remainder rolled into `__other__`). */
const MAX_HOSTS_PER_DAY = 25;
/** Max language-pair keys retained per daily record. */
const MAX_LANGUAGE_PAIRS_PER_DAY = 40;
/** Days of totals kept in chrome.storage `recentDailySummary`. */
const RECENT_SUMMARY_DAYS = 30;

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
// Usage event + v2 write API
// ---------------------------------------------------------------------------

export interface UsageEvent {
  mode: TranslationMode;
  characters?: number;
  apiCalls?: number;
  cacheHits?: number;
  cacheMisses?: number;
  cacheCharacters?: number;
  pageSession?: boolean;
  subtitleCues?: number;
  providerId?: string;
  host?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

function emptyDay(date: string): DailyStatRecord {
  return {
    date,
    totals: { ...ZERO_COUNTERS },
    byMode: {},
    byProvider: {},
    byHost: {},
    byLanguagePair: {},
  };
}

function localDateYmd(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA');
}

function retentionCutoffYmd(retentionDays: number, today: Date = new Date()): string {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return localDateYmd(cutoff);
}

/** Build counter delta from a usage event (mode-specific event counters included). */
function countersFromEvent(event: UsageEvent): StatCounters {
  return addPartialCounters(
    { ...ZERO_COUNTERS },
    {
      characters: event.characters,
      apiCalls: event.apiCalls,
      cacheHits: event.cacheHits,
      cacheMisses: event.cacheMisses,
      cacheCharacters: event.cacheCharacters,
      pageSessions: event.pageSession ? 1 : undefined,
      subtitleCues: event.subtitleCues,
      selectionEvents: event.mode === 'selection' ? 1 : undefined,
      inlineEvents: event.mode === 'inline' ? 1 : undefined,
      pdfEvents: event.mode === 'pdf' ? 1 : undefined,
    },
  );
}

async function pruneIdbToRetention(retentionDays: number): Promise<void> {
  await deleteDailyRecordsBefore(retentionCutoffYmd(retentionDays));
}

/**
 * Load summary as v2 (migrate v1 if needed). Same semantics as getStatsV2.
 * Prefer calling inside chainUpdate for write paths.
 */
async function readSummary(): Promise<TranslationStatsV2> {
  return getStatsV2();
}

/**
 * Record a single translation usage event into lifetime summary + today's IDB day.
 * Serialized via chainUpdate with all other stats writers (including reset).
 */
export async function recordUsage(event: UsageEvent): Promise<void> {
  return chainUpdate(async () => {
    const summary = await readSummary();
    const partial = countersFromEvent(event);
    const nowIso = new Date().toISOString();
    const today = localDateYmd();

    summary.lifetime = mergeCounters(summary.lifetime, partial);
    summary.lastActiveAt = nowIso;

    const existing = await getDailyRecord(today);
    const day: DailyStatRecord = existing
      ? {
          date: existing.date,
          totals: { ...ZERO_COUNTERS, ...existing.totals },
          byMode: { ...existing.byMode },
          byProvider: { ...existing.byProvider },
          byHost: { ...existing.byHost },
          byLanguagePair: { ...existing.byLanguagePair },
        }
      : emptyDay(today);

    day.totals = mergeCounters(day.totals, partial);

    const modePartial = addPartialCounters(
      addPartialCounters(ZERO_COUNTERS, day.byMode[event.mode] ?? {}),
      partial,
    );
    day.byMode = { ...day.byMode, [event.mode]: modePartial };

    if (event.providerId) {
      day.byProvider = mergeDimensionMap(
        day.byProvider,
        event.providerId,
        partial,
        Number.MAX_SAFE_INTEGER,
      );
    }

    if (summary.preferences.hostTrackingEnabled) {
      const host = normalizeHost(event.host);
      if (host) {
        day.byHost = mergeDimensionMap(day.byHost, host, partial, MAX_HOSTS_PER_DAY);
      }
    }

    if (event.sourceLanguage && event.targetLanguage) {
      const pair = languagePairKey(event.sourceLanguage, event.targetLanguage);
      day.byLanguagePair = mergeDimensionMap(
        day.byLanguagePair,
        pair,
        partial,
        MAX_LANGUAGE_PAIRS_PER_DAY,
      );
    }

    await setDailyRecord(day);
    await pruneIdbToRetention(summary.preferences.retentionDays);

    const allDays = await getAllDailyRecords();
    summary.recentDailySummary = buildRecentDailySummary(allDays);

    await chrome.storage.local.set({ [STATS_STORAGE_KEY]: summary });
  });
}

/**
 * Merge stats preferences. When retention is lowered, prune IDB immediately.
 */
export async function updateStatsPreferences(
  partial: Partial<StatsPreferences>,
): Promise<void> {
  return chainUpdate(async () => {
    const summary = await readSummary();
    const previousRetention = summary.preferences.retentionDays;

    if (typeof partial.hostTrackingEnabled === 'boolean') {
      summary.preferences.hostTrackingEnabled = partial.hostTrackingEnabled;
    }
    if (
      partial.retentionDays === 30 ||
      partial.retentionDays === 90 ||
      partial.retentionDays === 180
    ) {
      summary.preferences.retentionDays = partial.retentionDays;
    }

    if (summary.preferences.retentionDays < previousRetention) {
      await pruneIdbToRetention(summary.preferences.retentionDays);
      const allDays = await getAllDailyRecords();
      summary.recentDailySummary = buildRecentDailySummary(allDays);
    }

    await chrome.storage.local.set({ [STATS_STORAGE_KEY]: summary });
  });
}

// ---------------------------------------------------------------------------
// v1 read API (legacy summary shape; prefer getStatsV2)
// ---------------------------------------------------------------------------

export async function getStats(): Promise<TranslationStats> {
  const result = await chrome.storage.local.get(STATS_STORAGE_KEY);
  return result[STATS_STORAGE_KEY] ?? { ...DEFAULT_STATS };
}

/** Clear chrome.storage stats key + IDB daily store. Serialized behind other writers. */
export async function resetStats(): Promise<void> {
  return chainUpdate(async () => {
    await chrome.storage.local.remove(STATS_STORAGE_KEY);
    await clearAllDailyRecords();
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
  const lifetimePartial: Partial<StatCounters> = raw.lifetime ?? {};
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
  const recent = sorted.slice(-RECENT_SUMMARY_DAYS);
  return recent.map((r) => ({
    date: r.date,
    totals: { ...ZERO_COUNTERS, ...r.totals },
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
