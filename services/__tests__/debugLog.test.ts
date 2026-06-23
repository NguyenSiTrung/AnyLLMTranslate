/**
 * Tests: debug logging gate (Phase 1.5)
 *
 * Verifies that the debug log gate is:
 * - Cached in module scope (no per-call chrome.storage hit)
 * - Invalidated on settings change so new debugMode takes effect quickly
 * - Defaults to false (no logging) before any chrome.storage read
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDebugLoggingEnabled, invalidateDebugCache, warmDebugCache, isDebugLoggingEnabledAsync } from '../debugLog';
import { loadSettings } from '@/lib/config';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(),
}));

const mockedLoadSettings = loadSettings as unknown as ReturnType<typeof vi.fn>;

describe('services/debugLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock so invalidateDebugCache's fire-and-forget refresh resolves
    // cleanly instead of rejecting with an unconfigured mock.
    mockedLoadSettings.mockResolvedValue({ debugMode: false } as never);
    invalidateDebugCache();
  });

  it('defaults to false on first sync read (before any warmup)', () => {
    expect(isDebugLoggingEnabled()).toBe(false);
  });

  it('returns true after warmDebugCache sees debugMode=true', async () => {
    mockedLoadSettings.mockResolvedValue({ debugMode: true } as never);
    await warmDebugCache();
    expect(isDebugLoggingEnabled()).toBe(true);
  });

  it('returns false after warmDebugCache sees debugMode=false', async () => {
    mockedLoadSettings.mockResolvedValue({ debugMode: false } as never);
    await warmDebugCache();
    expect(isDebugLoggingEnabled()).toBe(false);
  });

  it('caches the value within the TTL window — second read uses cache', async () => {
    mockedLoadSettings.mockResolvedValue({ debugMode: true } as never);
    await warmDebugCache();
    expect(isDebugLoggingEnabled()).toBe(true);

    // Flip the underlying source to false, but cache still says true
    mockedLoadSettings.mockResolvedValue({ debugMode: false } as never);
    expect(isDebugLoggingEnabled()).toBe(true);
  });

  it('picks up new value after invalidateDebugCache (async refresh on next sync read)', async () => {
    mockedLoadSettings.mockResolvedValueOnce({ debugMode: true } as never);
    await warmDebugCache();
    expect(isDebugLoggingEnabled()).toBe(true);

    // invalidateDebugCache clears the TTL; the next sync read schedules a
    // background refresh that picks up the new value.
    mockedLoadSettings.mockResolvedValue({ debugMode: false } as never);
    invalidateDebugCache();
    // First sync call returns the stale cached value but triggers refresh.
    isDebugLoggingEnabled();
    await vi.waitFor(() => {
      expect(isDebugLoggingEnabled()).toBe(false);
    });
  });

  it('P2 regression: invalidateDebugCache does NOT force cachedEnabled=false on toggling ON', async () => {
    // The old impl set cachedEnabled=false inside invalidateDebugCache, which
    // meant enabling debugMode via storage.onChanged immediately reset the
    // cache to false — debug logging stayed broken until the next TTL read.
    mockedLoadSettings.mockResolvedValueOnce({ debugMode: false } as never);
    await warmDebugCache();
    expect(isDebugLoggingEnabled()).toBe(false);

    // Now the user enables debugMode; storage.onChanged fires invalidateDebugCache.
    mockedLoadSettings.mockResolvedValue({ debugMode: true } as never);
    invalidateDebugCache();
    isDebugLoggingEnabled(); // triggers background refresh
    await vi.waitFor(() => {
      expect(isDebugLoggingEnabled()).toBe(true);
    });
  });

  it('silently treats chrome.storage read errors as disabled', async () => {
    mockedLoadSettings.mockRejectedValue(new Error('storage offline'));
    expect(await isDebugLoggingEnabledAsync()).toBe(false);
    expect(isDebugLoggingEnabled()).toBe(false);
  });
});
