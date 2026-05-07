/**
 * Tests: eviction scheduling in entrypoints/background.ts (FR-3)
 *
 * Phase 3 of cache-hardening_20260415.
 * Verifies that evictCache is called on SW startup,
 * chrome.alarms.create is called with the correct config,
 * and the alarm listener invokes evictCache when fired.
 *
 * NOTE: We test the scheduling logic exported from services/background.ts
 * rather than the entrypoint directly, since WXT's defineBackground is
 * not available in the Vitest jsdom environment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock cacheManager before importing the module under test
vi.mock('@/services/cacheManager', () => ({
  getCachedTranslation: vi.fn().mockResolvedValue(null),
  cacheTranslation: vi.fn().mockResolvedValue(undefined),
  evictCache: vi.fn().mockResolvedValue(5),
}));

// capture alarm listeners
const alarmListeners: Array<(alarm: chrome.alarms.Alarm) => void> = [];
const mockAlarms = {
  create: vi.fn(),
  onAlarm: {
    addListener: vi.fn((cb: (alarm: chrome.alarms.Alarm) => void) => {
      alarmListeners.push(cb);
    }),
  },
};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: { onRemoved: { addListener: vi.fn() } },
  alarms: mockAlarms,
});

// ── Import the scheduling helpers (exported for testing) ─────────────────────
import { scheduleEviction, initEvictionSchedule } from '../background';

// ── Tests ────────────────────────────────────────────────────────────────────
describe('eviction scheduling (FR-3)', () => {
  let evictCache: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    alarmListeners.length = 0;
    const mod = await import('@/services/cacheManager');
    evictCache = mod.evictCache as ReturnType<typeof vi.fn>;
  });

  it('calls evictCache once on service worker startup', async () => {
    // Act
    await scheduleEviction();
    // Wait for the loadSettings().then(evictCache) chain to resolve
    await new Promise((r) => setTimeout(r, 0));

    // Assert — called with default settings values (maxCacheSizeMB=100, cacheTTLDays=30)
    expect(evictCache).toHaveBeenCalledTimes(1);
    expect(evictCache).toHaveBeenCalledWith(100, 30);
  });

  it('registers chrome.alarms.create with correct daily schedule', async () => {
    // Act
    await scheduleEviction();

    // Assert
    expect(chrome.alarms.create).toHaveBeenCalledWith('cache-evict', {
      periodInMinutes: 1440,
    });
  });

  it('calls evictCache when the cache-evict alarm fires', async () => {
    // Arrange
    initEvictionSchedule();

    // Act — simulate alarm firing
    const cached_evict_alarm = { name: 'cache-evict' } as chrome.alarms.Alarm;
    for (const listener of alarmListeners) {
      listener(cached_evict_alarm);
    }
    // Wait for the loadSettings().then(evictCache) chain to resolve
    await new Promise((r) => setTimeout(r, 0));

    // Assert — called with default settings values
    expect(evictCache).toHaveBeenCalled();
    expect(evictCache).toHaveBeenCalledWith(100, 30);
  });

  it('does NOT call evictCache for unrelated alarm names', async () => {
    // Arrange
    initEvictionSchedule();

    // Act — simulate a different alarm firing
    const other_alarm = { name: 'some-other-alarm' } as chrome.alarms.Alarm;
    for (const listener of alarmListeners) {
      listener(other_alarm);
    }

    // Assert
    expect(evictCache).not.toHaveBeenCalled();
  });
});
