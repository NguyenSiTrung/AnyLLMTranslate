// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { NetflixHandler } from '@/inject/subtitleHandlers/netflix';

const mockFetch = vi.fn();
const realFetch = window.fetch;
window.fetch = mockFetch as unknown as typeof window.fetch;

const { FetchInterceptor } = await import('@/inject/fetchInterceptor');
const { XhrInterceptor } = await import('@/inject/xhrInterceptor');
const { InterceptorRegistry } = await import('@/inject/interceptorRegistry');
const { installJsonParseSubtitleHook } = await import('@/inject/jsonParseSubtitleHook');

describe('Network Interception & Registry System', () => {
  let registry: InstanceType<typeof InterceptorRegistry>;
  let bridge: { send: ReturnType<typeof vi.fn> };
  let fetchInterceptor: InstanceType<typeof FetchInterceptor>;
  let xhrInterceptor: InstanceType<typeof XhrInterceptor>;
  let uninstallJsonHook: (() => void) | null = null;

  beforeEach(() => {
    registry = new InterceptorRegistry();
    registry.registerPattern({ platform: 'udemy', pattern: /\.udemycdn\.com\/.*\.vtt/ });
    registry.registerPattern({ platform: 'youtube', pattern: /\/api\/timedtext/ });
    bridge = { send: vi.fn(() => 'req-test') };
    fetchInterceptor = new FetchInterceptor(registry, bridge);
    xhrInterceptor = new XhrInterceptor(registry, bridge);
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    fetchInterceptor.disable();
    xhrInterceptor.disable();
    uninstallJsonHook?.();
    uninstallJsonHook = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  afterAll(() => {
    window.fetch = realFetch;
  });

  it('matches URL patterns, content-types, and registers JSON hooks', () => {
    expect(registry.matchUrl('https://cdna.udemycdn.com/subs/course.vtt')).toEqual({
      platform: 'udemy',
      pattern: expect.any(RegExp),
    });
    expect(registry.matchUrl('https://example.com/other')).toBeNull();

    const sendMock = vi.fn();
    uninstallJsonHook = installJsonParseSubtitleHook([new NetflixHandler()], { send: sendMock });
    // Netflix extractTracksFromParsedJson expects timedtexttracks (not bare tracks)
    const jsonStr = JSON.stringify({
      result: {
        movieId: 'movie-1',
        timedtexttracks: [
          {
            languageCode: 'en',
            displayName: 'English',
            url: 'https://netflix.com/sub.vtt',
          },
        ],
      },
    });
    JSON.parse(jsonStr);
    expect(sendMock).toHaveBeenCalledWith(
      'SUBTITLE_TRACKS_DISCOVERED',
      expect.objectContaining({ platform: 'netflix' }),
    );
  });

  it('intercepts fetch calls and manages lifecycle & error fallbacks', async () => {
    fetchInterceptor.enable();
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));
    const result = await window.fetch('https://cdna.udemycdn.com/subs/course.vtt');
    expect(result.status).toBe(404);
    expect(bridge.send).not.toHaveBeenCalled();

    const okResponse = new Response('WEBVTT\n\ntest', {
      status: 200,
      headers: { 'Content-Type': 'text/vtt' },
    });
    mockFetch.mockResolvedValue(okResponse);
    const fetchPromise = window.fetch('https://cdna.udemycdn.com/subs/course.vtt');
    await vi.waitFor(() => {
      expect(bridge.send).toHaveBeenCalledWith(
        'SUBTITLE_INTERCEPTED',
        expect.objectContaining({ platform: 'udemy' }),
      );
    });
    fetchPromise.catch(() => {});
  });

  it('tags matching XHR URLs and intercepts successful subtitle responses', async () => {
    // Install a mock native send *before* enable so the interceptor captures it
    // as originalSend and can complete with readyState 4 / status 200 in jsdom.
    const realSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function mockNativeSend(
      this: XMLHttpRequest,
      _body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      queueMicrotask(() => {
        Object.defineProperty(this, 'readyState', { configurable: true, get: () => 4 });
        Object.defineProperty(this, 'status', { configurable: true, get: () => 200 });
        Object.defineProperty(this, 'responseText', {
          configurable: true,
          get: () => 'WEBVTT\n\ntest',
        });
        Object.defineProperty(this, 'responseType', { configurable: true, get: () => '' });
        this.getResponseHeader = () => 'text/vtt';
        this.dispatchEvent(new Event('readystatechange'));
      });
    };

    try {
      // Re-create interceptor so it captures the mock as originalSend
      xhrInterceptor.disable();
      xhrInterceptor = new XhrInterceptor(registry, bridge);
      xhrInterceptor.enable();

      const xhr = new XMLHttpRequest();
      const onload = vi.fn();
      xhr.onload = onload;
      xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
      expect(
        (xhr as XMLHttpRequest & { __anyllmTranslateMatch?: { platform: string } })
          .__anyllmTranslateMatch?.platform,
      ).toBe('youtube');
      xhr.send();

      await vi.waitFor(() => {
        expect(bridge.send).toHaveBeenCalledWith(
          'SUBTITLE_INTERCEPTED',
          expect.objectContaining({ platform: 'youtube' }),
        );
      });

      // Foreign / non-matching URL is not tagged
      const foreign = new XMLHttpRequest();
      foreign.open('GET', 'https://example.com/api/other');
      expect(
        (foreign as XMLHttpRequest & { __anyllmTranslateMatch?: unknown })
          .__anyllmTranslateMatch,
      ).toBeUndefined();
    } finally {
      xhrInterceptor.disable();
      XMLHttpRequest.prototype.send = realSend;
    }
  });
});

// ============================================================================
// Phase 6 — interceptor hardening (MAX-25/26/27)
// ============================================================================

describe('interceptor hardening (MAX-25/26/27)', () => {
  let registry: InstanceType<typeof InterceptorRegistry>;
  let bridge: { send: ReturnType<typeof vi.fn> };
  let fetchInterceptor: InstanceType<typeof FetchInterceptor>;
  let xhrInterceptor: InstanceType<typeof XhrInterceptor>;

  const SUB_URL = 'https://cdna.udemycdn.com/subs/course.vtt';
  const TRANSLATED_VTT = 'WEBVTT\n\ntranslated';

  interface NativeSendStub {
    status: number;
    body?: string;
  }

  /**
   * Replace XMLHttpRequest.prototype.send with a stub that completes the
   * request on a microtask. Must be installed before the interceptor is enabled
   * so `enable()` captures the stub as its original send.
   */
  function installNativeSend(stub: NativeSendStub): () => void {
    const realSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function mockNativeSend(this: XMLHttpRequest) {
      queueMicrotask(() => {
        Object.defineProperty(this, 'readyState', { configurable: true, get: () => 4 });
        Object.defineProperty(this, 'status', { configurable: true, get: () => stub.status });
        Object.defineProperty(this, 'responseText', {
          configurable: true,
          get: () => stub.body ?? '',
        });
        Object.defineProperty(this, 'response', {
          configurable: true,
          get: () => stub.body ?? '',
        });
        Object.defineProperty(this, 'responseType', { configurable: true, get: () => '' });
        this.getResponseHeader = () => 'text/vtt';
        this.dispatchEvent(new Event('readystatechange'));
      });
    };
    return () => {
      XMLHttpRequest.prototype.send = realSend;
    };
  }

  function enableXhrWithNativeStub(stub: NativeSendStub): () => void {
    const restoreNativeSend = installNativeSend(stub);
    xhrInterceptor = new XhrInterceptor(registry, bridge);
    xhrInterceptor.enable();
    return restoreNativeSend;
  }

  /** Deliver the coordinator's translation result over the bridge channel. */
  function deliverTranslation(requestId: string, vttContent = TRANSLATED_VTT): void {
    window.dispatchEvent(new MessageEvent('message', {
      origin: window.location.origin,
      data: {
        channel: 'anyllm-translate',
        type: 'SUBTITLE_TRANSLATED',
        requestId,
        payload: { vttContent },
      },
    }));
  }

  /** Flush the microtask/timer queue for assertions that must stay negative. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  }

  let restoreNativeSend: (() => void) | null = null;

  beforeEach(() => {
    registry = new InterceptorRegistry();
    registry.registerPattern({ platform: 'udemy', pattern: /\.udemycdn\.com\/.*\.vtt/ });
    bridge = { send: vi.fn(() => 'req-test') };
    fetchInterceptor = new FetchInterceptor(registry, bridge);
    xhrInterceptor = new XhrInterceptor(registry, bridge);
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    fetchInterceptor.disable();
    xhrInterceptor.disable();
    restoreNativeSend?.();
    restoreNativeSend = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('replays the page handlers when an intercepted XHR fails with a non-200 status', async () => {
    restoreNativeSend = enableXhrWithNativeStub({ status: 403, body: '' });

    const xhr = new XMLHttpRequest();
    // The OPENED transition fires natively from open(); only the DONE
    // transition is owned by the interceptor's replay.
    const readyStates: number[] = [];
    xhr.onreadystatechange = () => {
      readyStates.push(xhr.readyState);
    };
    const onload = vi.fn();
    const loadListener = vi.fn();
    xhr.onload = onload;
    xhr.open('GET', SUB_URL);
    xhr.addEventListener('load', loadListener);
    xhr.send();

    await vi.waitFor(() => expect(onload).toHaveBeenCalled());
    await settle();

    expect(readyStates.filter((state) => state === 4)).toHaveLength(1);
    expect(onload).toHaveBeenCalledTimes(1);
    expect(loadListener).toHaveBeenCalledTimes(1);
    expect(bridge.send).not.toHaveBeenCalled();
  });

  it('does not replay a failed XHR twice when the request is aborted', async () => {
    restoreNativeSend = enableXhrWithNativeStub({ status: 500, body: '' });

    const xhr = new XMLHttpRequest();
    const onload = vi.fn();
    xhr.onload = onload;
    xhr.open('GET', SUB_URL);
    xhr.send();

    await vi.waitFor(() => expect(onload).toHaveBeenCalled());
    xhr.dispatchEvent(new Event('abort'));
    await settle();

    expect(onload).toHaveBeenCalledTimes(1);
  });

  it('holds loadend until translation resolves and replays it exactly once', async () => {
    restoreNativeSend = enableXhrWithNativeStub({ status: 200, body: 'WEBVTT\n\noriginal' });

    const xhr = new XMLHttpRequest();
    const onloadend = vi.fn();
    const loadendListener = vi.fn();
    xhr.onloadend = onloadend;
    xhr.open('GET', SUB_URL);
    xhr.addEventListener('loadend', loadendListener);
    xhr.send();

    await vi.waitFor(() => {
      expect(bridge.send).toHaveBeenCalledWith(
        'SUBTITLE_INTERCEPTED',
        expect.objectContaining({ platform: 'udemy' }),
      );
    });

    // The page must not observe completion before the translated body is in place.
    expect(onloadend).not.toHaveBeenCalled();
    expect(loadendListener).not.toHaveBeenCalled();

    deliverTranslation('req-test');

    await vi.waitFor(() => expect(onloadend).toHaveBeenCalledTimes(1));
    expect(loadendListener).toHaveBeenCalledTimes(1);
    expect((xhr as { responseText: string }).responseText).toBe(TRANSLATED_VTT);
  });

  it('drops body-describing headers from a translated partial response', async () => {
    fetchInterceptor.enable();
    mockFetch.mockResolvedValue(new Response('WEBVTT\n\npartial', {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': 'text/vtt',
        'Content-Range': 'bytes 0-18/1000',
        'Content-Length': '19',
        'Content-Encoding': 'gzip',
      },
    }));

    const fetchPromise = window.fetch(SUB_URL);
    await vi.waitFor(() => expect(bridge.send).toHaveBeenCalled());
    deliverTranslation('req-test');

    const translated = await fetchPromise;

    expect(translated.status).toBe(206);
    expect(translated.headers.get('content-type')).toBe('text/vtt');
    expect(translated.headers.get('content-range')).toBeNull();
    expect(translated.headers.get('content-length')).toBeNull();
    expect(translated.headers.get('content-encoding')).toBeNull();
    await expect(translated.text()).resolves.toBe(TRANSLATED_VTT);
  });

  it('resolves a null-body status with the original response instead of hanging', async () => {
    fetchInterceptor.enable();
    mockFetch.mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));

    const fetchPromise = window.fetch(SUB_URL);
    let status: number | 'pending' = 'pending';
    void fetchPromise.then((response) => { status = response.status; });

    await settle();

    expect(status).toBe(204);
    expect(bridge.send).not.toHaveBeenCalled();
  });
});
