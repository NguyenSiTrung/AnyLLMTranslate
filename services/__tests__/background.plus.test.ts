import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVACY_POLICY_VERSION } from '@/lib/privacyConsent';
import { SUBTITLE_CHUNK_SIZE } from '@/lib/constants';
import type { SubtitleCue } from '@/types/subtitle';
import type * as CacheManagerModule from '@/services/cacheManager';
import type * as ProviderPoolModule from '@/services/providerPool';
import type * as SubtitleRetryModule from '@/lib/subtitleRetry';
import { OpenAICompatibleService } from '@/services/openaiCompatible';

const mockStorage: Record<string, unknown> = {};
const ACCEPTED_CONSENT = { accepted: true, acceptedAt: 1, version: PRIVACY_POLICY_VERSION };
const SETTINGS_KEY = 'anyllm-translate-settings';

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({
        [key]:
          key === SETTINGS_KEY
            ? { ...(mockStorage[key] as object | undefined), privacyConsent: ACCEPTED_CONSENT }
            : mockStorage[key],
      })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    session: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: { sendMessage: vi.fn().mockResolvedValue(undefined), onRemoved: { addListener: vi.fn() } },
  alarms: { create: vi.fn(), get: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn(), removeListener: vi.fn() } },
});

const preScanNames = vi.fn();
vi.mock('@/services/subtitleNameScanner', () => ({
  preScanNames: (...args: unknown[]) => preScanNames(...args),
}));

const loadScoped = vi.fn();
const saveScoped = vi.fn();
vi.mock('@/services/filmGlossaryStore', () => ({
  loadFilmGlossary: vi.fn().mockResolvedValue(undefined),
  saveFilmGlossary: vi.fn().mockResolvedValue(undefined),
  loadScopedFilmGlossary: (...args: unknown[]) => loadScoped(...args),
  saveScopedFilmGlossary: (...args: unknown[]) => saveScoped(...args),
  FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary',
  SCOPED_FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary-scoped',
}));

// The subtitle cache store is IndexedDB, absent in jsdom — ByKey reads miss and
// writes are no-ops, matching the real module's behaviour here.
vi.mock('@/services/cacheManager', async (importOriginal) => {
  const actual = await importOriginal<typeof CacheManagerModule>();
  return {
    ...actual,
    getCachedTranslationByKey: vi.fn().mockResolvedValue(null),
    cacheTranslationByKey: vi.fn().mockResolvedValue(undefined),
  };
});

// Wall-clock sleeps (per-key throttle, chunk retry backoff, service backoff)
// are not what these tests assert. Substitute instant delays — dispatch order,
// retry counts, and breaker state are unchanged. Without this a 3-chunk run
// takes ~1s and the vi.waitFor default timeout (1000ms) fails.
vi.mock('@/services/providerPool', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderPoolModule>();
  class TestCoordinator extends actual.ProviderPoolCoordinator {
    constructor() {
      super({ delay: () => Promise.resolve() });
    }
  }
  return { ...actual, ProviderPoolCoordinator: TestCoordinator };
});
vi.mock('@/lib/subtitleRetry', async (importOriginal) => {
  const actual = await importOriginal<typeof SubtitleRetryModule>();
  return {
    ...actual,
    withRetry: (fn: () => Promise<unknown>, opts: Parameters<typeof actual.withRetry>[1]) =>
      actual.withRetry(fn, { ...opts, baseDelayMs: 0 }),
  };
});

function mockFetch(content: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({ id: 'test', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }),
    text: () => Promise.resolve(''),
  }));
}

function cuesOf(count: number): SubtitleCue[] {
  return Array.from({ length: count }, (_, i) => ({ startTime: i * 2, endTime: i * 2 + 2, text: `line ${i}` }));
}

const SENDER = { tab: { id: 11 } } as chrome.runtime.MessageSender;

describe('handleTranslateSubtitle — Plus preflight', () => {
  beforeEach(async () => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    mockStorage[SETTINGS_KEY] = { translationMode: 'plus' };
    preScanNames.mockReset().mockResolvedValue({ Alice: 'A-lít' });
    loadScoped.mockReset().mockResolvedValue(undefined);
    saveScoped.mockReset().mockResolvedValue(undefined);
    mockFetch(JSON.stringify({ translations: { s1: 'x' }, properNouns: {} }));
    const { __resetSettingsCacheForTest, __resetTranslationServiceForTest, __resetSubtitleSessionCounterForTest, __resetSemaphoreForTest } = await import('../background');
    __resetSettingsCacheForTest();
    __resetTranslationServiceForTest();
    __resetSubtitleSessionCounterForTest();
    __resetSemaphoreForTest();
    OpenAICompatibleService.__setRetryBackoffForTest(true);
  });

  it('downgrades when the caller did not declare a complete track', async () => {
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus' },
      SENDER,
    )) as { mode?: string; downgradeReason?: string; cues?: SubtitleCue[] };

    expect(res.mode).toBe('progressive');
    expect(res.downgradeReason).toBe('ineligible');
    // The progressive response returns the WHOLE cue array (untranslated cues
    // keep source text), not just chunk 0.
    expect(res.cues?.length).toBe(SUBTITLE_CHUNK_SIZE * 2);
    // An ineligible Plus request is an ordinary progressive request: the
    // unscoped pre-scan still runs, and the scoped namespace is untouched.
    expect(preScanNames).toHaveBeenCalledTimes(1);
    expect(loadScoped).not.toHaveBeenCalled();
    expect(saveScoped).not.toHaveBeenCalled();
  });

  it('downgrades with empty-prep when the frozen set is empty', async () => {
    preScanNames.mockResolvedValue({});
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    )) as { mode?: string; downgradeReason?: string };

    expect(res.mode).toBe('progressive');
    expect(res.downgradeReason).toBe('empty-prep');
    expect(saveScoped).not.toHaveBeenCalled();
  });

  it('downgrades with prep-failed when the pre-scan throws', async () => {
    preScanNames.mockRejectedValue(new Error('boom'));
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    )) as { mode?: string; downgradeReason?: string };

    expect(res.mode).toBe('progressive');
    expect(res.downgradeReason).toBe('prep-failed');
  });

  it('acks a Plus run and never touches the progressive film-glossary namespace', async () => {
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    )) as { mode?: string; cues?: SubtitleCue[]; totalChunks?: number };

    expect(res.mode).toBe('plus');
    expect(res.cues).toEqual([]);
    expect(res.totalChunks).toBe(2);
    expect(preScanNames).toHaveBeenCalledTimes(1);
    expect(saveScoped).toHaveBeenCalledTimes(1);
    const [scopedKey] = saveScoped.mock.calls[0] as [string, Record<string, string>];
    expect(scopedKey).toContain(':vi:');
  });

  it('reuses a persisted scoped glossary instead of pre-scanning again', async () => {
    loadScoped.mockResolvedValue({ Alice: 'A-lít' });
    const { handleMessage } = await import('../background');
    const res = (await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    )) as { mode?: string };

    expect(res.mode).toBe('plus');
    expect(preScanNames).not.toHaveBeenCalled();
  });
});
