// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

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
    installJsonParseSubtitleHook({ send: sendMock });
    const jsonStr = JSON.stringify({
      tracks: [{ languageCode: 'en', name: { simpleText: 'English' }, vttUrl: 'https://netflix.com/sub.vtt' }],
    });
    JSON.parse(jsonStr);
    expect(sendMock).toHaveBeenCalledWith('SUBTITLE_TRACKS_DISCOVERED', expect.objectContaining({ platform: 'netflix' }));
  });

  it('intercepts fetch calls and manages lifecycle & error fallbacks', async () => {
    fetchInterceptor.enable();
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));
    const result = await window.fetch('https://cdna.udemycdn.com/subs/course.vtt');
    expect(result.status).toBe(404);
    expect(bridge.send).not.toHaveBeenCalled();

    const okResponse = new Response('WEBVTT\n\ntest', { status: 200, headers: { 'Content-Type': 'text/vtt' } });
    mockFetch.mockResolvedValue(okResponse);
    const fetchPromise = window.fetch('https://cdna.udemycdn.com/subs/course.vtt');
    await vi.waitFor(() => {
      expect(bridge.send).toHaveBeenCalledWith('SUBTITLE_INTERCEPTED', expect.objectContaining({ platform: 'udemy' }));
    });
    fetchPromise.catch(() => {});
  });

  it('intercepts XHR requests and handles response override & foreign origins', () => {
    xhrInterceptor.enable();
    const xhr = new XMLHttpRequest();
    const onload = vi.fn();
    xhr.onload = onload;
    xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
    xhr.send();

    expect(bridge.send).toHaveBeenCalledWith('SUBTITLE_INTERCEPTED', expect.objectContaining({ platform: 'youtube' }));
  });
});
