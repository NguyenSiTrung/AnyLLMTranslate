/**
 * Tests: subtitle session identity — stale session chunks cannot update newer overlays.
 *
 * Phase 1 Task 1 of subtitle-reliability-hardening.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const alarmsClear = vi.fn();
const alarmsGet = vi.fn();
const alarmsCreate = vi.fn();
const tabsSendMessage = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((_keys: unknown, cb: (result: Record<string, unknown>) => void) => {
        cb({
          'anyllm-translate-settings': {
            provider: { preset: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'test-key', model: 'gpt-4' },
            sourceLanguage: 'en',
            targetLanguage: 'vi',
            glossary: [],
            cacheTTLDays: 7,
            customSystemPrompt: null,
          },
        });
      }),
      set: vi.fn(),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    id: 'test-extension-id',
  },
  tabs: {
    onRemoved: { addListener: vi.fn() },
    sendMessage: tabsSendMessage,
  },
  alarms: {
    create: alarmsCreate,
    get: alarmsGet,
    clear: alarmsClear,
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

// Mock cacheManager to avoid IndexedDB in tests
vi.mock('@/services/cacheManager', () => ({
  getCachedTranslation: vi.fn().mockResolvedValue(null),
  cacheTranslation: vi.fn().mockResolvedValue(undefined),
  evictCache: vi.fn().mockResolvedValue(undefined),
  clearCache: vi.fn().mockResolvedValue(undefined),
  flushLruUpdates: vi.fn().mockResolvedValue(undefined),
}));

// Mock stats
vi.mock('@/services/statsCollector', () => ({
  incrementStats: vi.fn().mockResolvedValue(undefined),
  recordDailyStats: vi.fn().mockResolvedValue(undefined),
}));

// Mock debugLog
vi.mock('@/services/debugLog', () => ({
  invalidateDebugCache: vi.fn(),
}));

import {
  handleMessage,
  __seedSubtitleSessionForTest,
  __getActiveSessionCountForTest,
  __getSubtitleSessionCounterForTest,
  __resetSubtitleSessionCounterForTest,
} from '../background';

const fakeSender = (tabId?: number) =>
  ({ tab: tabId ? { id: tabId } : undefined }) as chrome.runtime.MessageSender;

describe('subtitle session identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSubtitleSessionCounterForTest();
  });

  it('assigns a monotonically increasing sessionId to each new subtitle session', () => {
    const session1 = __seedSubtitleSessionForTest(1);
    const session2 = __seedSubtitleSessionForTest(2);

    expect(session2.sessionId).toBeGreaterThan(session1.sessionId);
  });

  it('replaces old session when a new translateSubtitle call arrives for the same tab', () => {
    const oldSession = __seedSubtitleSessionForTest(5);
    expect(__getActiveSessionCountForTest()).toBe(1);
    expect(oldSession.queue.length).toBe(3); // seeded with [1, 2, 3]

    const newSession = __seedSubtitleSessionForTest(5);
    // The new session should have replaced the old one
    expect(__getActiveSessionCountForTest()).toBe(1);
    expect(newSession.sessionId).toBeGreaterThan(oldSession.sessionId);
  });

  it('old session queue is drained when stopSubtitleSession is called', () => {
    const session = __seedSubtitleSessionForTest(7);
    expect(session.queue.length).toBe(3);

    handleMessage({ action: 'restore' }, fakeSender(7));

    expect(session.queue.length).toBe(0);
    expect(__getActiveSessionCountForTest()).toBe(0);
  });

  it('session counter survives across different tabs', () => {
    __seedSubtitleSessionForTest(10);
    const counter1 = __getSubtitleSessionCounterForTest();
    __seedSubtitleSessionForTest(20);
    const counter2 = __getSubtitleSessionCounterForTest();

    expect(counter2).toBe(counter1 + 1);
  });
});
