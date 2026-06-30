import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startMaxVttPerformanceCapture,
  resetMaxVttPerformanceCapture,
  resetMaxVttPerformanceCaptureLock,
  isMaxCdnVttUrl,
  isPerformanceCaptureRunning,
  setPageFetchForTests,
  resetPageFetchForTests,
} from '@/inject/maxVttPerformanceCapture';

// ---- Resource Timing stub (jsdom has none) ---------------------------------

let resourceEntries: { name: string }[] = [];

function setResourceUrls(urls: string[]): void {
  resourceEntries = urls.map((name) => ({ name }));
}

function installPerformanceStub(): void {
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    writable: true,
    value: {
      getEntriesByType: vi.fn(() => resourceEntries),
    },
  });
}

function restorePerformance(): void {
  // vitest/jsdom exposes a real performance object; delete our override so the
  // next test starts clean. Reinstall a fresh stub only via installPerformanceStub.
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    writable: true,
    value: {
      getEntriesByType: () => [],
    },
  });
  resourceEntries = [];
}

// ---- bridge mock (typed so mock.calls is [string, unknown][]) --------------

type SendMock = ReturnType<typeof vi.fn<(type: string, payload?: unknown) => string>>;

function makeBridge(): { send: SendMock } {
  return { send: vi.fn(() => 'req-1') };
}

// ---- fetch stub ------------------------------------------------------------

function makeFetch(bodyMap: Map<string, string>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = bodyMap.get(url.split('?')[0]) ?? bodyMap.get(url);
    if (body === undefined) {
      return new Response('', { status: 404 });
    }
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/vtt' } });
  }) as unknown as typeof fetch;
}

// Active-language stub: domCueSource/hbomax read this off the player DOM. We
// patch the module's reader indirectly by injecting a button the helper scans.
function setActiveLanguage(label: string): void {
  document.body.innerHTML = '';
  if (label) {
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'player-ux-text-track-button');
    btn.setAttribute('aria-checked', 'true');
    btn.setAttribute('aria-label', label);
    document.body.appendChild(btn);
  }
}

const SEG_2 = 'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b/t/caa516/t3/2.vtt';
const SEG_3 = 'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b/t/caa516/t3/3.vtt';
const SEG_OTHER = 'https://akm.asia.prd.media.max.com/fadb6e8d-4efa-49e9-90b1-f2d88de5eb5b/t/caa516/t5/1.vtt';

const VTT_2 = `WEBVTT
X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0

00:12:04.040 --> 00:12:05.720
Sorry about that. I'm so sorry.`;

const VTT_3 = `WEBVTT

00:12:06.560 --> 00:12:07.560
Sorry.`;

const VTT_OTHER = `WEBVTT

00:12:09.080 --> 00:12:10.600
Morning, Gino.`;

describe('maxVttPerformanceCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installPerformanceStub();
    setActiveLanguage('English');
  });

  afterEach(() => {
    resetMaxVttPerformanceCapture();
    resetPageFetchForTests();
    restorePerformance();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('detects Max CDN WebVTT resource URLs', () => {
    expect(isMaxCdnVttUrl(SEG_2)).toBe(true);
    expect(isMaxCdnVttUrl('https://cdn.example.com/subs.vtt')).toBe(false);
  });

  it('emits SUBTITLE_MANIFEST_CUES for a captured segment and labels language from DOM', async () => {
    setResourceUrls([SEG_2]);
    setPageFetchForTests(makeFetch(new Map([[SEG_2, VTT_2]])));

    const bridge = makeBridge();
    startMaxVttPerformanceCapture(bridge);

    // started lifecycle fires synchronously at start
    expect(bridge.send).toHaveBeenCalledWith('SUBTITLE_MPD_PROCESSING', expect.objectContaining({
      status: 'started',
      platform: 'hbomax',
    }));

    await vi.advanceTimersByTimeAsync(1500); // first poll tick

    const cuesCall = bridge.send.mock.calls.find(
      ([type]) => type === 'SUBTITLE_MANIFEST_CUES',
    );
    expect(cuesCall).toBeTruthy();
    const payload = cuesCall ? (cuesCall[1] as { append?: boolean; platform?: string }) : {};
    expect(payload).toEqual(expect.objectContaining({
      platform: 'hbomax',
      language: 'en',
      url: SEG_2,
      cues: expect.arrayContaining([
        expect.objectContaining({ text: "Sorry about that. I'm so sorry." }),
      ]),
    }));
    // first emission carries no append flag
    expect(payload.append).toBeUndefined();

    // success lifecycle fired after the cues
    expect(bridge.send).toHaveBeenCalledWith('SUBTITLE_MPD_PROCESSING', expect.objectContaining({
      status: 'complete',
      success: true,
    }));
  });

  it('emits append:true for subsequent segments of the same track', async () => {
    setResourceUrls([SEG_2]);
    setPageFetchForTests(makeFetch(new Map([[SEG_2, VTT_2], [SEG_3, VTT_3]])));

    const bridge = makeBridge();
    startMaxVttPerformanceCapture(bridge);

    await vi.advanceTimersByTimeAsync(1500); // capture SEG_2 (full emit)
    bridge.send.mockClear();

    // Player fetches the next segment → Resource Timing surfaces it.
    setResourceUrls([SEG_2, SEG_3]);
    await vi.advanceTimersByTimeAsync(1500); // capture SEG_3 (append)

    expect(bridge.send).toHaveBeenCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.objectContaining({ append: true }),
    );
  });

  it('mergeCues deduplicates by startTime across segments', async () => {
    const dupBody = `WEBVTT\n\n00:12:04.040 --> 00:12:05.720\nOriginal`;
    setResourceUrls([SEG_2]);
    setPageFetchForTests(makeFetch(new Map([[SEG_2, dupBody]])));

    const bridge = makeBridge();
    startMaxVttPerformanceCapture(bridge);
    await vi.advanceTimersByTimeAsync(1500);

    // Same URL is deduped by seenUrls, so a second tick emits nothing.
    bridge.send.mockClear();
    await vi.advanceTimersByTimeAsync(1500);
    expect(bridge.send).not.toHaveBeenCalledWith('SUBTITLE_MANIFEST_CUES', expect.anything());
  });

  it('drops segments from a different track while locked onto one', async () => {
    setResourceUrls([SEG_2, SEG_OTHER]);
    setPageFetchForTests(makeFetch(new Map([
      [SEG_2, VTT_2],
      [SEG_OTHER, VTT_OTHER],
    ])));

    const bridge = makeBridge();
    startMaxVttPerformanceCapture(bridge);
    await vi.advanceTimersByTimeAsync(1500);

    // Only SEG_2 (t3) emitted; SEG_OTHER (t5) dropped because t3 is locked.
    const cuesCalls = bridge.send.mock.calls.filter(([t]) => t === 'SUBTITLE_MANIFEST_CUES');
    expect(cuesCalls).toHaveLength(1);
    expect((cuesCalls[0][1] as { url: string }).url).toBe(SEG_2);
  });

  it('resetMaxVttPerformanceCaptureLock lets a new track emit after track switch', async () => {
    setResourceUrls([SEG_2]);
    setPageFetchForTests(makeFetch(new Map([
      [SEG_2, VTT_2],
      [SEG_OTHER, VTT_OTHER],
    ])));

    const bridge = makeBridge();
    startMaxVttPerformanceCapture(bridge);
    await vi.advanceTimersByTimeAsync(1500); // t3 emits

    // Track switch resets the lock; new track t5 can now emit.
    resetMaxVttPerformanceCaptureLock();
    setResourceUrls([SEG_OTHER]);
    bridge.send.mockClear();
    await vi.advanceTimersByTimeAsync(1500);

    expect(bridge.send).toHaveBeenCalledWith(
      'SUBTITLE_MANIFEST_CUES',
      expect.objectContaining({ url: SEG_OTHER }),
    );
  });

  it('sends complete(success:false) when no VTT surfaces before the deadline', async () => {
    setResourceUrls([]); // player never fetches a VTT segment
    setPageFetchForTests(makeFetch(new Map()));

    const bridge = makeBridge();
    startMaxVttPerformanceCapture(bridge);

    // No cues yet.
    await vi.advanceTimersByTimeAsync(1500);
    expect(bridge.send).not.toHaveBeenCalledWith('SUBTITLE_MPD_PROCESSING', expect.objectContaining({
      status: 'complete',
    }));

    // Deadline fires → failure lifecycle so coordinator falls back to DOM.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(bridge.send).toHaveBeenCalledWith('SUBTITLE_MPD_PROCESSING', expect.objectContaining({
      status: 'complete',
      success: false,
    }));
  });

  it('resetMaxVttPerformanceCapture stops the poller', async () => {
    setResourceUrls([SEG_2]);
    setPageFetchForTests(makeFetch(new Map([[SEG_2, VTT_2]])));

    const bridge = makeBridge();
    startMaxVttPerformanceCapture(bridge);
    expect(isPerformanceCaptureRunning()).toBe(true);

    resetMaxVttPerformanceCapture();
    expect(isPerformanceCaptureRunning()).toBe(false);

    // Ticking after reset emits nothing.
    bridge.send.mockClear();
    await vi.advanceTimersByTimeAsync(3000);
    expect(bridge.send).not.toHaveBeenCalled();
  });

  it('ignores non-VTT bodies even if the URL matches', async () => {
    setResourceUrls([SEG_2]);
    // CDN echoes a DASH manifest body instead of VTT.
    setPageFetchForTests(makeFetch(new Map([[SEG_2, '<MPD xmlns="urn:mpeg:dash:schema:mpd"></MPD>']])));

    const bridge = makeBridge();
    startMaxVttPerformanceCapture(bridge);
    await vi.advanceTimersByTimeAsync(1500);

    expect(bridge.send).not.toHaveBeenCalledWith('SUBTITLE_MANIFEST_CUES', expect.anything());
  });
});
