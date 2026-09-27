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

function sentActions(): string[] {
  return (chrome.tabs.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
    (call) => (call[1] as { action?: string }).action ?? '',
  );
}

function sentMessages(action: string): Array<Record<string, unknown>> {
  return (chrome.tabs.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((call) => call[1] as Record<string, unknown>)
    .filter((msg) => msg.action === action);
}

describe('handleTranslateSubtitle — Plus run', () => {
  beforeEach(async () => {
    // Same reset block as the preflight describe, plus a fetch that echoes each
    // requested id so every chunk succeeds.
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    mockStorage[SETTINGS_KEY] = { translationMode: 'plus' };
    preScanNames.mockReset().mockResolvedValue({ Alice: 'A-lít' });
    loadScoped.mockReset().mockResolvedValue(undefined);
    saveScoped.mockReset().mockResolvedValue(undefined);
    const { __resetSettingsCacheForTest, __resetTranslationServiceForTest, __resetSubtitleSessionCounterForTest, __resetSemaphoreForTest, __getActiveSessionCountForTest } = await import('../background');
    // A preflight test acks before its Plus run settles, so a run can still be
    // in flight when this describe starts. Let it finish first, otherwise its
    // progress/terminal sends land after the mockClear below and inflate this
    // test's message counts.
    await vi.waitFor(() => expect(__getActiveSessionCountForTest()).toBe(0), { timeout: 10_000 });
    vi.mocked(chrome.tabs.sendMessage).mockClear();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body?: string }) => {
      const body = JSON.parse(init.body ?? '{}') as { messages: Array<{ content: string }> };
      const userPrompt = body.messages[1]?.content ?? '';
      const ids = [...userPrompt.matchAll(/\"?(s\d+)\"?\s*:/g)].map((m) => m[1]);
      const translations: Record<string, string> = {};
      for (const id of ids) translations[id] = `vi-${id}`;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations, properNouns: {} }) }, finish_reason: 'stop' }],
        }),
        text: () => Promise.resolve(''),
      };
    }));
    __resetSettingsCacheForTest();
    __resetTranslationServiceForTest();
    __resetSubtitleSessionCounterForTest();
    __resetSemaphoreForTest();
    OpenAICompatibleService.__setRetryBackoffForTest(true);
  });

  it('sends the frozen block to every chunk, one progress per chunk, then one terminal message', async () => {
    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2 + 1), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );

    await vi.waitFor(() => expect(sentActions()).toContain('SUBTITLE_PLUS_COMPLETE'), { timeout: 10_000 });

    const progress = sentMessages('SUBTITLE_PLUS_PROGRESS');
    expect(progress).toHaveLength(3);
    expect(progress.at(-1)).toMatchObject({ completedChunks: 3, totalChunks: 3, phase: 'translating' });

    const [terminal] = sentMessages('SUBTITLE_PLUS_COMPLETE');
    expect(terminal).toMatchObject({ outcome: 'complete', partial: false, failedChunkIndices: [] });
    expect((terminal.cues as SubtitleCue[]).length).toBe(SUBTITLE_CHUNK_SIZE * 2 + 1);

    // Every chunk prompt carried the frozen block; no rolling block was sent.
    const fetchMock = fetch as unknown as { mock: { calls: Array<[string, { body: string }]> } };
    for (const [, init] of fetchMock.mock.calls) {
      const system = (JSON.parse(init.body) as { messages: Array<{ content: string }> }).messages[0].content;
      if (system.includes('proper-noun extractor')) continue;
      expect(system).toContain('Frozen terminology for this track');
      expect(system).not.toContain('Previously translated names in this content');
    }

    // FR-12 repair passes append a distinct instruction to the system prompt;
    // they are follow-ups within a chunk, not chunk requests. Compare only the
    // base prompt so this asserts the frozen system prompt is chunk-invariant.
    const systems = fetchMock.mock.calls
      .map(([, init]) => (JSON.parse(init.body) as { messages: Array<{ content: string }> }).messages[0].content)
      .filter((system) => !system.includes('Repair pass'));
    expect(new Set(systems).size).toBe(1);
  });

  it('never sends progressive chunk deltas during a Plus run', async () => {
    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );
    await vi.waitFor(() => expect(sentActions()).toContain('SUBTITLE_PLUS_COMPLETE'), { timeout: 10_000 });
    expect(sentActions()).not.toContain('SUBTITLE_CHUNK_TRANSLATED');
    expect(sentActions()).not.toContain('SUBTITLE_CHUNK_FAILED');
  });

  it('commits with partial:true and source text when one chunk fails all retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body?: string }) => {
      const body = JSON.parse(init.body ?? '{}') as { messages: Array<{ content: string }> };
      const userPrompt = body.messages[1]?.content ?? '';
      // Chunk 1 covers cues 25-49, so only its prompt contains "line 30".
      // Content-based, not call-order-based: the pool runs chunks in parallel.
      if (userPrompt.includes('line 30')) throw new Error('network down');
      const ids = [...userPrompt.matchAll(/\"?(s\d+)\"?\s*:/g)].map((m) => m[1]);
      const translations: Record<string, string> = {};
      for (const id of ids) translations[id] = `vi-${id}`;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations, properNouns: {} }) }, finish_reason: 'stop' }],
        }),
        text: () => Promise.resolve(''),
      };
    }));

    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );
    await vi.waitFor(() => expect(sentActions()).toContain('SUBTITLE_PLUS_COMPLETE'), { timeout: 10_000 });

    const [terminal] = sentMessages('SUBTITLE_PLUS_COMPLETE');
    const cues = terminal.cues as SubtitleCue[];
    expect(terminal.partial).toBe(true);
    expect(terminal.outcome).toBe('complete');
    expect(terminal.failedChunkIndices).toEqual([1]);
    // The failed chunk keeps source text; the successful chunk carries the translation.
    expect(cues[SUBTITLE_CHUNK_SIZE].text).toBe(`line ${SUBTITLE_CHUNK_SIZE}`);
    expect(cues[0].text).toBe('vi-s1');
  });

  it('sends outcome:failed when every chunk fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 2), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );
    await vi.waitFor(() => expect(sentActions()).toContain('SUBTITLE_PLUS_COMPLETE'), { timeout: 10_000 });
    const [terminal] = sentMessages('SUBTITLE_PLUS_COMPLETE');
    expect(terminal.outcome).toBe('failed');
  });

  it('sends no terminal message when the run is cancelled', async () => {
    // Gate every request so the cancel lands while chunks are genuinely in
    // flight; a fast mock would let the whole run finish first and make the
    // assertion vacuous.
    const gate: { release: () => void } = { release: () => {} };
    const wait = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    vi.stubGlobal('fetch', vi.fn(async () => {
      await wait;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations: {}, properNouns: {} }) }, finish_reason: 'stop' }],
        }),
        text: () => Promise.resolve(''),
      };
    }));

    const { handleMessage, __getActiveSessionCountForTest } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE * 4), sourceLanguage: 'en', targetLanguage: 'vi', translationMode: 'plus', completeTrack: true },
      SENDER,
    );
    await handleMessage({ action: 'CANCEL_SUBTITLE_SESSION' }, SENDER);
    gate.release();

    // Wait for the run to actually finish before asserting the absence of a
    // terminal message — otherwise a later terminal send would be missed.
    await vi.waitFor(() => expect(__getActiveSessionCountForTest()).toBe(0), { timeout: 10_000 });
    expect(sentActions()).not.toContain('SUBTITLE_PLUS_COMPLETE');
  });

  it('leaves the scoped namespace untouched on a progressive request', async () => {
    mockStorage[SETTINGS_KEY] = { translationMode: 'progressive' };
    const { handleMessage } = await import('../background');
    await handleMessage(
      { action: 'translateSubtitle', cues: cuesOf(SUBTITLE_CHUNK_SIZE), sourceLanguage: 'en', targetLanguage: 'vi' },
      SENDER,
    );
    expect(loadScoped).not.toHaveBeenCalled();
    expect(saveScoped).not.toHaveBeenCalled();
  });
});
