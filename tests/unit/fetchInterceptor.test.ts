import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

/**
 * FetchInterceptor captures `window.fetch` at module load time.
 * We must mock window.fetch BEFORE importing the module so the captured
 * `originalFetch` uses our mock.
 */
const mockFetch = vi.fn();

// Replace window.fetch before module load
const realFetch = window.fetch;
window.fetch = mockFetch as unknown as typeof window.fetch;

const { FetchInterceptor } = await import('@/inject/fetchInterceptor');
const { InterceptorRegistry } = await import('@/inject/interceptorRegistry');

describe('FetchInterceptor', () => {
  let registry: InstanceType<typeof InterceptorRegistry>;
  let bridge: { send: ReturnType<typeof vi.fn> };
  let interceptor: InstanceType<typeof FetchInterceptor>;

  beforeEach(() => {
    registry = new InterceptorRegistry();
    registry.registerPattern({
      platform: 'udemy',
      pattern: /\.udemycdn\.com\/.*\.vtt/,
    });
    bridge = { send: vi.fn(() => 'req-456') };
    interceptor = new FetchInterceptor(registry, bridge);
    mockFetch.mockReset();
  });

  afterEach(() => {
    interceptor.disable();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    window.fetch = realFetch;
  });

  it('HTTP error guard vs 200 interception; non-match passthrough; custom timeout', async () => {
    const errorResponse = new Response('Not Found', { status: 404, statusText: 'Not Found' });
    mockFetch.mockResolvedValue(errorResponse);

    interceptor.enable();

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

    mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
    bridge.send.mockClear();
    const passthrough = await window.fetch('https://example.com/api/data');
    expect(passthrough.status).toBe(200);
    expect(bridge.send).not.toHaveBeenCalled();

    interceptor.setTimeout(5000);
    mockFetch.mockResolvedValue(
      new Response('WEBVTT\n\ntest', { status: 200, headers: { 'Content-Type': 'text/vtt' } }),
    );
    expect(() => window.fetch('https://cdna.udemycdn.com/subs/course.vtt')).not.toThrow();
  });

  it('lifecycle: restore on disable, idempotent re-enable, foreign patch preserved', async () => {
    interceptor.enable();
    const patched = window.fetch;
    expect(patched).not.toBe(mockFetch);

    interceptor.disable();
    expect(window.fetch).not.toBe(patched);
    mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
    await window.fetch('https://example.com/x');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    interceptor.enable();
    interceptor.disable();
    interceptor.enable();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
    await window.fetch('https://example.com/api/data');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const foreignFetch = vi.fn() as unknown as typeof window.fetch;
    window.fetch = foreignFetch;
    interceptor.disable();
    expect(window.fetch).toBe(foreignFetch);
    window.fetch = mockFetch as unknown as typeof window.fetch;
  });

  it('ignores translated messages from foreign origins', async () => {
    const okResponse = new Response('WEBVTT\n\ntest', {
      status: 200,
      headers: { 'Content-Type': 'text/vtt' },
    });
    mockFetch.mockResolvedValue(okResponse);

    const messageHandlers: ((event: MessageEvent) => void)[] = [];
    const originalAdd = window.addEventListener;
    const addSpy = vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === 'message' && typeof handler === 'function') {
          messageHandlers.push(handler);
        }
      },
    );
    const removeSpy = vi.spyOn(window, 'removeEventListener').mockImplementation(
      (_type: string, handler: EventListenerOrEventListenerObject) => {
        if (typeof handler === 'function') {
          const idx = messageHandlers.indexOf(handler);
          if (idx !== -1) messageHandlers.splice(idx, 1);
        }
      },
    );

    interceptor.enable();

    const fetchPromise = window.fetch('https://cdna.udemycdn.com/subs/course.vtt');
    fetchPromise.catch(() => {});

    await vi.waitFor(() => {
      expect(bridge.send).toHaveBeenCalledWith(
        'SUBTITLE_INTERCEPTED',
        expect.objectContaining({ platform: 'udemy' }),
      );
    });

    const forgedEvent = {
      data: {
        channel: 'anyllm-translate',
        type: 'SUBTITLE_TRANSLATED',
        requestId: 'req-456',
        payload: { vttContent: 'WEBVTT\nforged' },
      },
      origin: 'https://evil.example.com',
    } as MessageEvent;
    for (const handler of [...messageHandlers]) {
      handler(forgedEvent);
    }

    expect(messageHandlers.length).toBeGreaterThan(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
    void originalAdd;
  });

  it('Content-Type secondary detection and URL pattern precedence', async () => {
    const ctRegistry = new InterceptorRegistry();
    ctRegistry.registerContentTypePatterns([
      { platform: 'generic', contentTypes: ['text/vtt', 'application/x-subtitle'] },
    ]);
    const ctInterceptor = new FetchInterceptor(ctRegistry, bridge);
    mockFetch.mockReset();

    try {
      const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi';
      const okResponse = new Response(vtt, {
        status: 200,
        headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
      });
      mockFetch.mockResolvedValue(okResponse);

      ctInterceptor.enable();
      const fetchPromise = window.fetch('https://cdn.example.com/stream/subtitles-track');

      await vi.waitFor(() => {
        expect(bridge.send).toHaveBeenCalledWith(
          'SUBTITLE_INTERCEPTED',
          expect.objectContaining({ platform: 'generic' }),
        );
      });
      fetchPromise.catch(() => {});

      ctInterceptor.disable();
      bridge.send.mockClear();

      ctRegistry.registerPattern({ platform: 'youtube', pattern: /\/api\/timedtext/ });
      ctRegistry.registerContentTypePatterns([
        { platform: 'generic', contentTypes: ['text/vtt'] },
      ]);

      mockFetch.mockResolvedValue(
        new Response(vtt, { status: 200, headers: { 'Content-Type': 'text/vtt' } }),
      );

      ctInterceptor.enable();
      const fetchPromise2 = window.fetch('https://youtube.com/api/timedtext?lang=en');

      await vi.waitFor(() => {
        expect(bridge.send).toHaveBeenCalledWith(
          'SUBTITLE_INTERCEPTED',
          expect.objectContaining({ platform: 'youtube' }),
        );
      });
      fetchPromise2.catch(() => {});
    } finally {
      ctInterceptor.disable();
    }
  });
});
