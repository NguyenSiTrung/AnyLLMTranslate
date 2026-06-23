/**
 * P1 regression: semaphore bypass in subtitle chunk translation.
 *
 * Before the fix, handleTranslateSubtitle acquired the semaphore once at the top
 * and released it in the outer `finally` — which fired when the function
 * RETURNED, while the background chunk loop was still translating. The next
 * handleTranslateSubtitle call could then acquire a slot even though chunks
 * from the prior call were still in-flight, exceeding MAX_CONCURRENT.
 *
 * After the fix, each chunk (including the synchronous first chunk) acquires
 * its own slot inside translateChunk, so MAX_CONCURRENT holds across all
 * in-flight work regardless of when the outer function returns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as BackgroundModule from '../background';

const mockStorage: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(mockStorage, items); }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: {
    onRemoved: { addListener: vi.fn() },
    sendMessage: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

// A controllable fetch that blocks until we release the latch — lets us
// observe the semaphore state WHILE a translation is in-flight (before return).
let resolveLatch: (() => void) | null = null;
function mockControllableFetch() {
  vi.stubGlobal('fetch', vi.fn(() => {
    // Block until releaseLatch is called, THEN resolve.
    return new Promise((resolve) => {
      resolveLatch = () => {
        resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({
            id: 'test',
            choices: [{ message: { role: 'assistant', content: '{"s1":"translated"}' } }],
            finish_reason: 'stop',
          }),
          text: () => Promise.resolve(''),
        });
      };
    });
  }));
}

// Sub-project 3 added a per-film pre-scan that runs (and fetches) BEFORE chunk
// 0 acquires its semaphore slot. This test observes the semaphore state during
// the chunk-0 fetch, so short-circuit the pre-scan to keep chunk 0 as the only
// latched fetch. (Pre-scan behavior is covered in background.filmGlossary.test.ts.)
vi.mock('@/services/subtitleNameScanner', () => ({
  preScanNames: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/services/filmGlossaryStore', () => ({
  loadFilmGlossary: vi.fn().mockResolvedValue(undefined),
  saveFilmGlossary: vi.fn().mockResolvedValue(undefined),
  FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary',
}));

// All background exports are imported dynamically per-test so module-level state
// resets (vi.resetModules) keep the test harness and the module under test on the
// SAME module instance (static + dynamic imports would otherwise diverge after reset).
let api: typeof BackgroundModule;

const fakeSender = (tabId: number) =>
  ({ tab: { id: tabId } }) as chrome.runtime.MessageSender;

describe('subtitle semaphore bypass (P1)', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockStorage['anyllm-translate-settings'] = JSON.stringify({
      apiKey: 'k',
      baseUrl: 'https://api.example.com/v1',
      model: 'm',
      preset: 'custom',
    });
    resolveLatch = null;
    mockControllableFetch();
    api = await import('../background');
    api.__resetSemaphoreForTest();
  });

  it('holds a semaphore slot while the first chunk is in-flight (not released on return)', async () => {
    const { handleMessage, __getSemaphoreStateForTest, MAX_CONCURRENT } = api;
    // Fire a subtitle translation with a single chunk (< CHUNK_SIZE so no async loop).
    const promise = handleMessage(
      {
        action: 'translateSubtitle',
        cues: [{ startTime: 0, endTime: 2, text: 'Hello world this is a test subtitle cue' }],
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      },
      fakeSender(1),
    );

    // Let the acquire + translate get underway (wait for fetch to be latched).
    await vi.waitFor(() => {
      expect(resolveLatch).not.toBeNull();
    });
    // Yield so the async translateChunk body reaches acquireSemaphore + fetch.
    await new Promise((r) => setTimeout(r, 10));

    // While the first chunk is in-flight, exactly one slot should be held.
    const stateDuring = __getSemaphoreStateForTest();
    expect(stateDuring.active).toBeGreaterThanOrEqual(1);
    expect(stateDuring.active).toBeLessThanOrEqual(MAX_CONCURRENT);

    // Release the latch so the translation completes.
    resolveLatch?.();
    await promise;

    // After completion, the slot must be released.
    await vi.waitFor(() => {
      expect(__getSemaphoreStateForTest().active).toBe(0);
    });
  }, 15000);
});
