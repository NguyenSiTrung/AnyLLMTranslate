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
