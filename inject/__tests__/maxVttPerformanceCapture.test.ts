/**
 * Max (HBO Max) Performance-API VTT capture — state-machine tests.
 *
 * Covers track identity, representation switching, fetch retry/seen marking,
 * stall watchdog, deadline behaviour and the delta-append protocol.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/maxSubtitleLanguages', () => ({
  readMaxActiveSubtitleLanguage: () => 'en',
}));

import {
  resolveTrackIdentity,
  startMaxVttPerformanceCapture,
  resetMaxVttPerformanceCapture,
  resetMaxVttCaptureForSeek,
  setPerformanceObserverCtorForTests,
  setPageFetchForTests,
  CAPTURE_STALL_MS,
  WATCHDOG_INTERVAL_MS,
  MAX_VTT_CAPTURE_DEADLINE_MS,
  FULL_RESYNC_EVERY,
  RESOURCE_TIMING_BUFFER_SIZE,
  SEGMENT_RECOVERY_COOLDOWN_MS,
  isMaxCdnSubtitleUrl,
} from '@/inject/maxVttPerformanceCapture';
import { MAX_MANIFEST_CUES } from '@/lib/constants';
import type { MessageBridgeSender } from '@/inject/messageBridge';
import type { SubtitleManifestCuesPayload } from '@/types/subtitle';

class FakeObserver {
  static instances: FakeObserver[] = [];
  cb: (list: { getEntries: () => PerformanceEntry[] }) => void;
  constructor(cb: (list: { getEntries: () => PerformanceEntry[] }) => void) {
    this.cb = cb;
    FakeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
  takeRecords(): PerformanceEntry[] { return []; }
  emit(url: string) {
    this.cb({ getEntries: () => [{ name: url } as PerformanceEntry] });
  }
}

function makeBridge() {
  const sent: Array<{ type: string; payload: unknown }> = [];
  const bridge: MessageBridgeSender = {
    send: (type, payload) => {
      sent.push({ type, payload });
      return 'request-id';
    },
  };
  return { bridge, sent };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('resolveTrackIdentity', () => {
  it('prefers the t<digit> representation id', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/t/caa516/t3/8.vtt?x=1')).toBe('t3');
  });

  it('falls back to the /t/<dir>/ component for directory-style tracks', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/t/t6/1.vtt?x=1')).toBe('t6');
  });

  it('uses the /t/ component nearest the segment file when the path nests several', () => {
    expect(resolveTrackIdentity('https://host.example/a/t/lead/t1/main/t3/8.vtt')).toBe('t3');
  });

  it('ignores a /t/ marker that only appears in the query string', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/other/1.vtt?path=/t/t6/')).toBeNull();
  });

  it('returns null when there is no /t/ marker', () => {
    expect(resolveTrackIdentity('https://cf.asia.prd.media.max.com/a/other/1.vtt')).toBeNull();
  });
});

function vtt(...texts: string[]): string {
  return (
    'WEBVTT\n\n' +
    texts
      .map((text, i) => `00:00:0${i + 1}.000 --> 00:00:0${i + 2}.000\n${text}`)
      .join('\n\n') +
    '\n'
  );
}

describe('Max CDN subtitle URL matching', () => {
  it('accepts media.max.com, hbomax.com and max.com hosts with a /t/ marker', () => {
    expect(isMaxCdnSubtitleUrl('https://cf.eu.prd.media.max.com/a/t/t3/1.vtt?x=1')).toBe(true);
    expect(isMaxCdnSubtitleUrl('https://beam-1.prd.api.hbomax.com/a/t/t1/1.ttml')).toBe(true);
    expect(isMaxCdnSubtitleUrl('https://media.max.com/a/t/t2/3.vtt')).toBe(true);
  });

  it('rejects unrelated hosts and extensionless URLs', () => {
    expect(isMaxCdnSubtitleUrl('https://example.com/a/t/t2/3.vtt')).toBe(false);
    expect(isMaxCdnSubtitleUrl('https://cf.asia.prd.media.max.com/a/t/t3/1.jpg')).toBe(false);
  });
});

describe('Max VTT capture — TTML segments', () => {
  it('parses a TTML subtitle segment', async () => {
    const ttml =
      '<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div>' +
      '<p begin="00:00:01.000" end="00:00:02.000">Hola</p></div></body></tt>';
    vi.spyOn(console, 'log').mockImplementation(() => {});
    FakeObserver.instances.length = 0;
    setPerformanceObserverCtorForTests(FakeObserver as unknown as typeof PerformanceObserver);
    resetMaxVttPerformanceCapture();
    const fetchMock = vi.fn().mockResolvedValue(new Response(ttml, { status: 200 }));
    setPageFetchForTests(fetchMock as unknown as typeof fetch);
    const { bridge, sent } = makeBridge();

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.eu.prd.media.max.com/a/t/t3/1.ttml');
    await flush();

    const manifest = sent.find((m) => m.type === 'SUBTITLE_MANIFEST_CUES');
    expect(manifest).toBeDefined();
    expect((manifest!.payload as { cues: Array<{ text: string }> }).cues[0]!.text).toContain('Hola');
  });
});

describe('Max VTT capture — representation identity', () => {
  let bridge: MessageBridgeSender;
  let sent: Array<{ type: string; payload: unknown }>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    FakeObserver.instances.length = 0;
    setPerformanceObserverCtorForTests(FakeObserver as unknown as typeof PerformanceObserver);
    ({ bridge, sent } = makeBridge());
    fetchMock = vi.fn();
    setPageFetchForTests(fetchMock as unknown as typeof fetch);
    resetMaxVttPerformanceCapture();
  });

  afterEach(() => {
    resetMaxVttPerformanceCapture();
    vi.restoreAllMocks();
  });

  const emissions = () =>
    sent
      .filter((m) => m.type === 'SUBTITLE_MANIFEST_CUES')
      .map((m) => m.payload as { cues: Array<{ text: string }>; append?: boolean });

  it('keeps a directory-style track together instead of dropping segment 2', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(vtt('first'), { status: 200 }))
      .mockResolvedValueOnce(new Response(vtt('first', 'second'), { status: 200 }));

    startMaxVttPerformanceCapture(bridge);
    const observer = FakeObserver.instances.at(-1)!;
    observer.emit('https://cf.asia.prd.media.max.com/a/t/t6/1.vtt?x=1');
    await flush();
    observer.emit('https://cf.asia.prd.media.max.com/a/t/t6/2.vtt?x=1');
    await flush();

    const out = emissions();
    expect(out).toHaveLength(2);
    expect(out[1]!.append).toBe(true);
    expect(out[1]!.cues.map((c) => c.text)).toEqual(['first', 'second']);
  });

  it('switches representation once the previous one has gone quiet', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    fetchMock
      .mockResolvedValueOnce(new Response(vtt('lead-in'), { status: 200 }))
      .mockResolvedValueOnce(new Response(vtt('main'), { status: 200 }));

    startMaxVttPerformanceCapture(bridge);
    const observer = FakeObserver.instances.at(-1)!;
    observer.emit('https://gcp.apac-free.prd.media.max.com/apac/uuid/t/3_f384f7/t1/1.vtt');
    await flush();
    vi.setSystemTime(new Date('2026-01-01T00:00:04Z'));
    observer.emit('https://gcp.asia.prd.media.max.com/a/t/caa516/t3/8.vtt');
    await flush();
    vi.useRealTimers();

    const out = emissions();
    expect(out).toHaveLength(2);
    // The switched representation starts a fresh buffer — no lead-in cue.
    expect(out[1]!.cues.map((c) => c.text)).toEqual(['main']);
  });

  it('drops a foreign representation segment inside the idle window', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(vtt('mine'), { status: 200 }))
      .mockResolvedValueOnce(new Response(vtt('theirs'), { status: 200 }));

    startMaxVttPerformanceCapture(bridge);
    const observer = FakeObserver.instances.at(-1)!;
    observer.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await flush();
    observer.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t9/1.vtt');
    await flush();

    expect(emissions()).toHaveLength(1);
  });

  it('discards an in-flight segment that resolves after a capture reset', async () => {
    let resolveFetch: ((r: Response) => void) | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    startMaxVttPerformanceCapture(bridge);
    const observer = FakeObserver.instances.at(-1)!;
    observer.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await flush();

    resetMaxVttCaptureForSeek();
    resolveFetch?.(new Response(vtt('stale'), { status: 200 }));
    await flush();

    expect(emissions()).toHaveLength(0);
  });
});

describe('Max VTT capture — fetch resilience', () => {
  let bridge: MessageBridgeSender;
  let sent: Array<{ type: string; payload: unknown }>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    FakeObserver.instances.length = 0;
    setPerformanceObserverCtorForTests(FakeObserver as unknown as typeof PerformanceObserver);
    ({ bridge, sent } = makeBridge());
    fetchMock = vi.fn();
    setPageFetchForTests(fetchMock as unknown as typeof fetch);
    resetMaxVttPerformanceCapture();
  });

  afterEach(() => {
    resetMaxVttPerformanceCapture();
    vi.restoreAllMocks();
  });

  const captureEmissions = () => sent.filter((m) => m.type === 'SUBTITLE_MANIFEST_CUES');

  it('retries a transient fetch failure and still emits the segment', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(new Response(vtt('hello'), { status: 200 }));

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await new Promise((r) => setTimeout(r, 400));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(captureEmissions()).toHaveLength(1);
  });

  it('recovers a segment once its cooldown elapses instead of losing it permanently', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new Error('403'))
      .mockRejectedValueOnce(new Error('403')) // the immediate attempt pair
      .mockResolvedValueOnce(new Response(vtt('recovered'), { status: 200 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await vi.advanceTimersByTimeAsync(0);
    expect(captureEmissions()).toHaveLength(0);

    // Cooldown (5s) elapses, then the watchdog tick re-drives the segment.
    await vi.advanceTimersByTimeAsync(SEGMENT_RECOVERY_COOLDOWN_MS + WATCHDOG_INTERVAL_MS + 1);

    // Bridge sends carry the coordinator's declared payload shape.
    const manifests = captureEmissions().map((m) => m.payload as SubtitleManifestCuesPayload);
    expect(manifests).toHaveLength(1);
    expect(manifests[0]!.cues.map((c) => c.text)).toEqual(['recovered']);
    expect(warn).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not refetch a segment that already parsed', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response(vtt('hello'), { status: 200 }));

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await vi.advanceTimersByTimeAsync(0);
    expect(captureEmissions()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(SEGMENT_RECOVERY_COOLDOWN_MS * 3 + WATCHDOG_INTERVAL_MS * 3);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(captureEmissions()).toHaveLength(1);
    vi.useRealTimers();
  });

  it('forgets recovery state on a seek reset', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('403'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    // Let the immediate attempt pair settle so the failure is recorded before
    // the seek reset — otherwise the in-flight retry would still land after it.
    await vi.advanceTimersByTimeAsync(400);

    resetMaxVttCaptureForSeek();
    const attemptsBefore = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(SEGMENT_RECOVERY_COOLDOWN_MS + WATCHDOG_INTERVAL_MS + 1);

    expect(fetchMock.mock.calls.length).toBe(attemptsBefore);
    expect(captureEmissions()).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe('Max VTT capture — stall watchdog', () => {
  let bridge: MessageBridgeSender;
  let sent: Array<{ type: string; payload: unknown }>;
  let fetchMock: ReturnType<typeof vi.fn>;

  const lifecycle = (status: string) =>
    sent.some(
      (m) =>
        m.type === 'SUBTITLE_MPD_PROCESSING' &&
        (m.payload as { status?: string }).status === status,
    );

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    FakeObserver.instances.length = 0;
    setPerformanceObserverCtorForTests(FakeObserver as unknown as typeof PerformanceObserver);
    ({ bridge, sent } = makeBridge());
    fetchMock = vi.fn().mockResolvedValue(new Response(vtt('hello'), { status: 200 }));
    setPageFetchForTests(fetchMock as unknown as typeof fetch);
    resetMaxVttPerformanceCapture();
  });

  afterEach(() => {
    resetMaxVttPerformanceCapture();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const mountVideo = (paused: boolean) => {
    document.body.innerHTML = '<video></video>';
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'paused', { value: paused, configurable: true });
  };

  it('emits a stalled lifecycle message when segments stop while the video plays', async () => {
    vi.useFakeTimers();
    mountVideo(false);

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.some((m) => m.type === 'SUBTITLE_MANIFEST_CUES')).toBe(true);

    await vi.advanceTimersByTimeAsync(WATCHDOG_INTERVAL_MS + CAPTURE_STALL_MS + 1);
    expect(lifecycle('stalled')).toBe(true);
  });

  it('does not report a stall while the video is paused', async () => {
    vi.useFakeTimers();
    mountVideo(true);

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(WATCHDOG_INTERVAL_MS + CAPTURE_STALL_MS + 1);
    expect(lifecycle('stalled')).toBe(false);
  });
});

describe('Max VTT capture — deadline waits for playback', () => {
  let bridge: MessageBridgeSender;
  let sent: Array<{ type: string; payload: unknown }>;

  const lifecycle = (status: string) =>
    sent.some(
      (m) =>
        m.type === 'SUBTITLE_MPD_PROCESSING' &&
        (m.payload as { status?: string }).status === status,
    );

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    FakeObserver.instances.length = 0;
    setPerformanceObserverCtorForTests(FakeObserver as unknown as typeof PerformanceObserver);
    ({ bridge, sent } = makeBridge());
    setPageFetchForTests(vi.fn() as unknown as typeof fetch);
    resetMaxVttPerformanceCapture();
  });

  afterEach(() => {
    resetMaxVttPerformanceCapture();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const mountVideo = (paused: boolean) => {
    document.body.innerHTML = '<video></video>';
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'paused', { value: paused, configurable: true });
  };

  it('keeps waiting while playback has not started', async () => {
    vi.useFakeTimers();
    mountVideo(true);

    startMaxVttPerformanceCapture(bridge);
    await vi.advanceTimersByTimeAsync(MAX_VTT_CAPTURE_DEADLINE_MS * 2 + 1);

    expect(lifecycle('complete')).toBe(false);
  });

  it('signals failure after the deadline once the video is playing', async () => {
    vi.useFakeTimers();
    mountVideo(false);

    startMaxVttPerformanceCapture(bridge);
    await vi.advanceTimersByTimeAsync(MAX_VTT_CAPTURE_DEADLINE_MS + 1);

    expect(lifecycle('complete')).toBe(true);
  });
});

describe('Max VTT capture — delta append protocol', () => {
  let bridge: MessageBridgeSender;
  let sent: Array<{ type: string; payload: unknown }>;
  let fetchMock: ReturnType<typeof vi.fn>;

  interface ManifestPayload {
    cues: Array<{ text: string }>;
    append?: boolean;
    seq?: number;
    full?: boolean;
  }

  const payloads = () =>
    sent
      .filter((m) => m.type === 'SUBTITLE_MANIFEST_CUES')
      .map((m) => m.payload as ManifestPayload);

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    FakeObserver.instances.length = 0;
    setPerformanceObserverCtorForTests(FakeObserver as unknown as typeof PerformanceObserver);
    ({ bridge, sent } = makeBridge());
    fetchMock = vi.fn();
    setPageFetchForTests(fetchMock as unknown as typeof fetch);
    resetMaxVttPerformanceCapture();
  });

  afterEach(() => {
    resetMaxVttPerformanceCapture();
    vi.restoreAllMocks();
  });

  it('appends only the new cues and carries an increasing seq', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(vtt('first'), { status: 200 }))
      .mockResolvedValueOnce(new Response(vtt('second'), { status: 200 }));

    startMaxVttPerformanceCapture(bridge);
    const observer = FakeObserver.instances.at(-1)!;
    observer.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await flush();
    observer.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/2.vtt');
    await flush();

    const out = payloads();
    expect(out).toHaveLength(2);
    expect(out[0]!.cues.map((c) => c.text)).toEqual(['first']);
    expect(out[1]!.cues.map((c) => c.text)).toEqual(['second']);
    expect(out[1]!.seq).toBe((out[0]!.seq ?? 0) + 1);
    expect(out[1]!.append).toBe(true);
  });

  it('re-scans resource entries when the timing buffer overflows', async () => {
    const setSize = vi.fn();
    Object.defineProperty(performance, 'setResourceTimingBufferSize', {
      value: setSize,
      configurable: true,
    });
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { name: 'https://cf.asia.prd.media.max.com/a/t/caa516/t3/9.vtt' } as PerformanceEntry,
    ]);
    const perfAdd = vi.spyOn(performance, 'addEventListener').mockImplementation(() => {});
    const winAdd = vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response(vtt('late'), { status: 200 }));

    startMaxVttPerformanceCapture(bridge);
    expect(setSize).toHaveBeenCalledWith(RESOURCE_TIMING_BUFFER_SIZE);

    const handler = (perfAdd.mock.calls.find(([type]) => type === 'resourcetimingbufferfull')?.[1] ??
      winAdd.mock.calls.find(([type]) => type === 'resourcetimingbufferfull')?.[1]) as
      | (() => void)
      | undefined;
    expect(handler).toBeTypeOf('function');
    handler?.();
    await flush();

    expect(payloads()).toHaveLength(1);
  });

  it('re-sends the full accumulated buffer every FULL_RESYNC_EVERY segments', async () => {
    let line = 0;
    fetchMock.mockImplementation(
      async () => new Response(vtt(`line ${++line}`), { status: 200 }),
    );

    startMaxVttPerformanceCapture(bridge);
    const observer = FakeObserver.instances.at(-1)!;
    for (let i = 1; i <= FULL_RESYNC_EVERY + 1; i++) {
      observer.emit(`https://cf.asia.prd.media.max.com/a/t/caa516/t3/${i}.vtt`);
      await flush();
    }

    const last = payloads().at(-1)!;
    expect(last.full).toBe(true);
    expect(last.cues).toHaveLength(FULL_RESYNC_EVERY + 1);
  });

  it('caps the rolling buffer at the most recent MAX_MANIFEST_CUES cues', async () => {
    const total = MAX_MANIFEST_CUES + 25;
    const body =
      'WEBVTT\n\n' +
      Array.from({ length: total }, (_, i) => {
        const fmt = (n: number) =>
          `00:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}.000`;
        return `${fmt(i)} --> ${fmt(i + 1)}\nline ${i}`;
      }).join('\n\n') +
      '\n';
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }));

    startMaxVttPerformanceCapture(bridge);
    FakeObserver.instances.at(-1)!.emit('https://cf.asia.prd.media.max.com/a/t/caa516/t3/1.vtt');
    await flush();

    const cues = payloads()[0]!.cues;
    expect(cues).toHaveLength(MAX_MANIFEST_CUES);
    expect(cues[0]!.text).toBe('line 25');
    expect(cues.at(-1)!.text).toBe(`line ${total - 1}`);
  });
});
