import { DEFAULT_STATS, type TranslationStats } from '@/types/stats';

const STORAGE_KEY = 'anyllm-translate-stats';

/** Promise chain to serialize all stats storage updates and prevent race conditions. */
let updateChain = Promise.resolve();

/** Wrap an update function in the serialized chain. Errors propagate to the caller
 *  but do not break the chain for subsequent updates. */
function chainUpdate<T>(fn: () => Promise<T>): Promise<T> {
  const p = updateChain.then(fn);
  updateChain = p.catch(() => {});
  return p;
}

export async function getStats(): Promise<TranslationStats> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? { ...DEFAULT_STATS };
}

export async function resetStats(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
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
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
  });
}

export async function recordDailyStats(
  chars: number,
  apiCalls: number,
  cacheHits: number,
): Promise<void> {
  return chainUpdate(async () => {
    const current = await getStats();
    const today = new Date().toISOString().slice(0, 10);
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
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const pruned = daily.filter((d) => d.date >= cutoffStr);
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...current, dailyStats: pruned },
    });
  });
}
