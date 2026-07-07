/**
 * Tests for the useCacheStats hook (FR-8).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCacheStats } from '../useCacheStats';

vi.mock('@/services/cacheManager', () => ({
  getCacheStats: vi.fn(),
}));

import { getCacheStats } from '@/services/cacheManager';

const mockGetCacheStats = vi.mocked(getCacheStats);

describe('useCacheStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads cache stats on mount', async () => {
    mockGetCacheStats.mockResolvedValue({ entryCount: 42, totalSizeBytes: 2 * 1024 * 1024 });
    const { result } = renderHook(() => useCacheStats());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entryCount).toBe(42);
    expect(result.current.sizeMb).toBeCloseTo(2, 5);
    expect(mockGetCacheStats).toHaveBeenCalledTimes(1);
  });

  it('degrades gracefully on error (keeps last known, clears loading)', async () => {
    mockGetCacheStats.mockRejectedValueOnce(new Error('idb unavailable'));
    const { result } = renderHook(() => useCacheStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entryCount).toBe(0);
    expect(result.current.loading).toBe(false);
  });
});
