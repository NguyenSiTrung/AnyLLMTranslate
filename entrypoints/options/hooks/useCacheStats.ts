/**
 * useCacheStats — live translation-cache usage for the Advanced tab (FR-8).
 *
 * Wraps `getCacheStats()` so the overview strip / Performance card can show
 * entry counts and a human-readable size (B / KB / MB). Queries on mount;
 * `refresh()` re-queries after Clear Cache.
 */

import { useState, useEffect, useCallback } from 'react';
import { formatCacheSize, getCacheStats } from '@/services/cacheManager';

export interface CacheStatsState {
  entryCount: number;
  /** Raw total bytes (for progress bars vs max cache MB). */
  totalSizeBytes: number;
  /** totalSizeBytes / 1 MiB — fractional; do not toFixed(1) for display. */
  sizeMb: number;
  /** Human-readable size, e.g. "42.3 KB" or "1.25 MB". */
  sizeLabel: string;
  loading: boolean;
  refresh: () => Promise<void>;
}

const BYTES_PER_MB = 1024 * 1024;

export function useCacheStats(): CacheStatsState {
  const [entryCount, setEntryCount] = useState(0);
  const [totalSizeBytes, setTotalSizeBytes] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await getCacheStats();
      setEntryCount(stats.entryCount);
      setTotalSizeBytes(stats.totalSizeBytes);
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

  return {
    entryCount,
    totalSizeBytes,
    sizeMb: totalSizeBytes / BYTES_PER_MB,
    sizeLabel: formatCacheSize(totalSizeBytes),
    loading,
    refresh,
  };
}
