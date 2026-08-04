import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn(async (key: string) => memory.get(key)),
  set: vi.fn(async (key: string, val: unknown) => {
    memory.set(key, val);
  }),
  del: vi.fn(async (key: string) => {
    memory.delete(key);
  }),
  entries: vi.fn(async () => [...memory.entries()]),
  clear: vi.fn(async () => {
    memory.clear();
  }),
}));

import { runYoutubeLinkPrealign } from '../youtubeLinkPrealign';
import { getAsrRealignEntry } from '../youtubeAsrRealignStore';
import { prepareYoutubeAsrAiInput, type AsrTimedUnit } from '@/lib/youtubeAsrResegment';
import {
  buildAsrRealignCacheKey,
  hashAsrRealignContent,
} from '@/lib/youtubeAsrRealignCache';
import { buildJson3TimedtextUrl } from '@/lib/youtubeWatchPage';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import type { SubtitleCue } from '@/types/subtitle';

const VIDEO_ID = 'abc123';
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const ASR_BASE_URL = `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en&kind=asr`;
const HUMAN_BASE_URL = `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en`;

const JSON3_BODY = JSON.stringify({
  events: [
    {
      tStartMs: 0,
      dDurationMs: 1000,
      segs: [
        { utf8: 'hello', tOffsetMs: 0 },
        { utf8: ' world', tOffsetMs: 500 },
      ],
    },
    {
      tStartMs: 1000,
      dDurationMs: 1000,
      segs: [{ utf8: 'again', tOffsetMs: 0 }],
    },
  ],
});

const REALIGNED_CUES: SubtitleCue[] = [
  { startTime: 0, endTime: 1, text: 'hello world' },
  { startTime: 1, endTime: 2, text: 'again' },
];

interface PlayerResponseOverrides {
  playabilityStatus?: Record<string, unknown>;
  videoDetails?: Record<string, unknown>;
  captions?: unknown;
}

function playerResponse(overrides: PlayerResponseOverrides = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    playabilityStatus: { status: 'OK' },
    videoDetails: { videoId: VIDEO_ID, title: 'Sample Video - YouTube' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: HUMAN_BASE_URL,
            name: { simpleText: 'English' },
            languageCode: 'en',
          },
          {
            baseUrl: ASR_BASE_URL,
            name: { simpleText: 'English (auto-generated)' },
            languageCode: 'en',
            kind: 'asr',
          },
        ],
      },
    },
  };
  const out = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

function watchHtml(pr: unknown): string {
  return `<!doctype html><html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(
    pr,
  )};</script></body></html>`;
}

function fakeResponse(
  body: string,
  init: { ok?: boolean; status?: number } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.ok === false ? 'Not Found' : 'OK',
    text: async () => body,
    headers: { get: () => 'text/html' },
  } as unknown as Response;
}

function makeDeps(options: {
  watchBody?: string;
  watchOk?: boolean;
  json3Body?: string;
  json3Ok?: boolean;
  resegmentImpl?: (
    units: AsrTimedUnit[],
    language: string,
    onProgress?: (current: number, total: number) => void,
  ) => Promise<{ success: boolean; cues?: SubtitleCue[]; error?: string }>;
} = {}) {
  const fetchFn = vi.fn(async (url: string) => {
    if (url.includes('/watch')) {
      return fakeResponse(options.watchBody ?? watchHtml(playerResponse()), {
        ok: options.watchOk,
        status: options.watchOk === false ? 404 : 200,
      });
    }
    if (url.includes('/api/timedtext')) {
      return fakeResponse(options.json3Body ?? JSON3_BODY, {
        ok: options.json3Ok,
        status: options.json3Ok === false ? 500 : 200,
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const resegment = vi.fn(
    options.resegmentImpl ??
      (async (
        _units: AsrTimedUnit[],
        _language: string,
        onProgress?: (current: number, total: number) => void,
      ) => {
        onProgress?.(1, 1);
        return { success: true, cues: REALIGNED_CUES };
      }),
  );
  const translate = vi.fn();
  const resolveService = vi.fn(async () => ({
    resegmentYoutubeAsr: resegment,
    translate,
  }));
  const broadcastProgress = vi.fn();
  const broadcastCacheUpdated = vi.fn();

  return {
    deps: { fetchFn, resolveService, broadcastProgress, broadcastCacheUpdated },
    fetchFn,
    resegment,
    translate,
    resolveService,
    broadcastProgress,
    broadcastCacheUpdated,
  };
}

describe('runYoutubeLinkPrealign', () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async (_algo: string, data: ArrayBuffer) => {
          const bytes = new Uint8Array(data);
          const out = new Uint8Array(32);
          for (let i = 0; i < bytes.length; i++) out[i % 32] ^= bytes[i];
          return out.buffer;
        }),
      },
    });
  });

  it('rejects an invalid / non-YouTube URL without fetching', async () => {
    const { deps, fetchFn } = makeDeps();
    const result = await runYoutubeLinkPrealign('https://example.com/watch?v=x', deps);
    expect(result).toMatchObject({ success: false, errorCode: 'invalid-url' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps a non-OK watch-page fetch to video-unavailable', async () => {
    const { deps } = makeDeps({ watchOk: false });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'video-unavailable' });
  });

  it('maps a consent/bot page (no player response) to fetch-blocked', async () => {
    const { deps } = makeDeps({
      watchBody: '<html><body><form action="https://consent.youtube.com/save">x</form></body></html>',
    });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'fetch-blocked' });
  });

  it('maps an UNPLAYABLE playabilityStatus to video-unavailable', async () => {
    const { deps } = makeDeps({
      watchBody: watchHtml(playerResponse({ playabilityStatus: { status: 'UNPLAYABLE' } })),
    });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'video-unavailable' });
  });

  it('maps missing captions to no-captions', async () => {
    const { deps } = makeDeps({ watchBody: watchHtml(playerResponse({ captions: undefined })) });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'no-captions' });
  });

  it('maps human-uploaded-only tracks to no-asr', async () => {
    const { deps } = makeDeps({
      watchBody: watchHtml(
        playerResponse({
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  baseUrl: HUMAN_BASE_URL,
                  name: { simpleText: 'English' },
                  languageCode: 'en',
                },
              ],
            },
          },
        }),
      ),
    });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'no-asr' });
  });

  it('maps a failed timedtext fetch to fetch-blocked', async () => {
    const { deps } = makeDeps({ json3Ok: false });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'fetch-blocked' });
  });

  it('realigns and saves on the happy path (title stripped, thumbnail, watch URL)', async () => {
    const { deps, fetchFn, resegment, translate, broadcastProgress, broadcastCacheUpdated } =
      makeDeps();

    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: true, outcome: 'realigned' });

    // Watch HTML fetched from the canonical watch URL; timedtext fetched as fmt=json3.
    expect(fetchFn.mock.calls[0]?.[0]).toBe(WATCH_URL);
    const timedtextUrl = String(fetchFn.mock.calls[1]?.[0]);
    expect(timedtextUrl).toContain('/api/timedtext');
    expect(timedtextUrl).toContain('fmt=json3');
    expect(timedtextUrl).toContain('kind=asr');

    // LLM ran once with word-level units; language from the track.
    expect(resegment).toHaveBeenCalledTimes(1);
    const [units, language] = resegment.mock.calls[0] as unknown as [AsrTimedUnit[], string];
    expect(language).toBe('en');
    expect(units.length).toBe(3);
    expect(units[0]).toMatchObject({ text: 'hello', startMs: 0 });

    // Entry saved with metadata; listed key format ai:{videoId}:{lang}:{hash}.
    const keys = [...memory.keys()];
    expect(keys).toHaveLength(1);
    const key = keys[0]!;
    expect(key).toMatch(/^ai:abc123:en:[0-9a-f]{64}$/);
    const entry = await getAsrRealignEntry(key);
    expect(entry).toMatchObject({
      videoId: VIDEO_ID,
      language: 'en',
      mode: 'ai',
      title: 'Sample Video',
      thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/mqdefault.jpg`,
      youtubeUrl: WATCH_URL,
      cueCount: REALIGNED_CUES.length,
    });
    expect(entry?.cues).toEqual(REALIGNED_CUES);

    // Progress + cache-updated broadcasts fired.
    expect(broadcastProgress).toHaveBeenCalledWith(VIDEO_ID, 1, 1);
    expect(broadcastCacheUpdated).toHaveBeenCalledTimes(1);

    // AC-5: no translation is issued by this flow.
    expect(translate).not.toHaveBeenCalled();
  });

  it('reports already-saved on a cache hit and makes zero LLM calls', async () => {
    const { deps, resegment, broadcastCacheUpdated } = makeDeps();

    const first = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(first).toMatchObject({ success: true, outcome: 'realigned' });
    expect(resegment).toHaveBeenCalledTimes(1);

    const second = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(second).toMatchObject({ success: true, outcome: 'already-saved' });
    expect(resegment).toHaveBeenCalledTimes(1);
    // No new save → no second cache-updated broadcast.
    expect(broadcastCacheUpdated).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent runs through the single-flight inflight map', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { deps, resegment } = makeDeps({
      resegmentImpl: async () => {
        await gate;
        return { success: true, cues: REALIGNED_CUES };
      },
    });

    const p1 = runYoutubeLinkPrealign(WATCH_URL, deps);
    const p2 = runYoutubeLinkPrealign(WATCH_URL, deps);
    await new Promise((r) => setTimeout(r, 20));
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toMatchObject({ success: true, outcome: 'realigned' });
    expect(r2).toMatchObject({ success: true, outcome: 'realigned' });
    expect(resegment).toHaveBeenCalledTimes(1);
  });

  it('maps an empty provider pool to provider-not-configured', async () => {
    const { deps } = makeDeps({
      resegmentImpl: async () => ({
        success: false,
        error: 'Translation pool is empty — no providers configured.',
      }),
    });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'provider-not-configured' });
    expect(memory.size).toBe(0);
  });

  it('maps a generic LLM failure to llm-failure and writes nothing', async () => {
    const { deps } = makeDeps({
      resegmentImpl: async () => ({ success: false, error: 'Empty response from LLM' }),
    });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'llm-failure' });
    expect(memory.size).toBe(0);
  });

  it('maps an ASR body with no usable text to no-captions', async () => {
    const { deps } = makeDeps({ json3Body: JSON.stringify({ events: [] }) });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'no-captions' });
  });

  it('hash parity: Settings-flow units + contentHash match the playback pipeline', async () => {
    // FR-9 / AC-2: for the same caption body, the Settings pre-align flow and
    // the proactive playback path must derive identical units and contentHash,
    // so both compute the same ai:{videoId}:{lang}:{hash} cache key.
    const { deps, resegment } = makeDeps();

    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: true, outcome: 'realigned' });

    const [settingsUnits, settingsLang] = resegment.mock.calls[0] as unknown as [
      AsrTimedUnit[],
      string,
    ];
    const settingsKey = [...memory.keys()][0]!;

    // Replicate the playback path exactly as activateYoutubeTrackViaPipelineInner
    // + applyYoutubeAsrPipeline build units from the fetched json3 body.
    const playbackUrl = buildJson3TimedtextUrl(ASR_BASE_URL);
    const handler = new YouTubeHandler();
    const contentType =
      /[?&]fmt=json3(?:&|$)/i.test(playbackUrl) || JSON3_BODY.trimStart().startsWith('{')
        ? 'application/json'
        : 'text/xml';
    const playbackRawCues = handler.transformResponse(JSON3_BODY, contentType, playbackUrl);
    const playbackUnits = prepareYoutubeAsrAiInput({ body: JSON3_BODY, cues: playbackRawCues });
    const playbackHash = await hashAsrRealignContent(playbackUnits);
    const playbackKey = buildAsrRealignCacheKey(VIDEO_ID, settingsLang || 'en', playbackHash);

    expect(playbackUnits).toEqual(settingsUnits);
    expect(playbackKey).toBe(settingsKey);
  });

  it('rejects a timedtext baseUrl outside youtube.com (youtube-only guard)', async () => {
    const { deps, fetchFn } = makeDeps({
      watchBody: watchHtml(
        playerResponse({
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                {
                  baseUrl: 'https://evil.example.com/api/timedtext?v=x&kind=asr',
                  name: { simpleText: 'English (auto-generated)' },
                  languageCode: 'en',
                  kind: 'asr',
                },
              ],
            },
          },
        }),
      ),
    });
    const result = await runYoutubeLinkPrealign(WATCH_URL, deps);
    expect(result).toMatchObject({ success: false, errorCode: 'fetch-blocked' });
    // Only the watch HTML fetch may have happened.
    expect(fetchFn.mock.calls.every((c) => String(c[0]).includes('youtube.com'))).toBe(true);
  });
});
