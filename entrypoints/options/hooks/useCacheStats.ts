/**
 * useCacheStats — live translation-cache usage for the Advanced tab (FR-8).
 *
 * Wraps the existing `getCacheStats()` in `services/cacheManager.ts` (which
 * reads the idb-keyval store the runtime already uses) so the Performance card
 * and hero strip can show "X entries · Y MB" instead of forcing users to tune
 * Max Cache Size blind. Queries on mount; `refresh()` re-queries (called after
 * Clear Cache succeeds).
 */

import { useState, useEffect, useCallback } from 'react';
import { getCacheStats } from '@/services/cacheManager';

export interface CacheStatsState {
  entryCount: number;
  sizeMb: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

const BYTES_PER_MB = 1024 * 1024;

export function useCacheStats(): CacheStatsState {
  const [entryCount, setEntryCount] = useState(0);
  const [sizeMb, setSizeMb] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await getCacheStats();
      setEntryCount(stats.entryCount);
      setSizeMb(stats.totalSizeBytes / BYTES_PER_MB);
    } catch {
      // Leave the last known values on error — the readout degrades gracefully.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  return { entryCount, sizeMb, loading, refresh };
}
