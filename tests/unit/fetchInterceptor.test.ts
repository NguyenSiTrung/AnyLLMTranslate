import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

  describe('HTTP error guard', () => {
    it('returns original response unmodified for 404 status', async () => {
      const errorResponse = new Response('Not Found', { status: 404, statusText: 'Not Found' });
      mockFetch.mockResolvedValue(errorResponse);

      interceptor.enable();

      const result = await window.fetch('https://cdna.udemycdn.com/subs/course.vtt');

      expect(result.status).toBe(404);
      expect(bridge.send).not.toHaveBeenCalled();
    });

    it('returns original response unmodified for 500 status', async () => {
      const errorResponse = new Response('Server Error', { status: 500, statusText: 'Internal Server Error' });
      mockFetch.mockResolvedValue(errorResponse);

      interceptor.enable();

      const result = await window.fetch('https://cdna.udemycdn.com/subs/course.vtt');

      expect(result.status).toBe(500);
      expect(bridge.send).not.toHaveBeenCalled();
    });

    it('proceeds with interception for 200 status', async () => {
      const okResponse = new Response('WEBVTT\n\ntest', {
        status: 200,
        headers: { 'Content-Type': 'text/vtt' },
      });
      mockFetch.mockResolvedValue(okResponse);

      interceptor.enable();

      // Start the fetch — it will block waiting for translation
      const fetchPromise = window.fetch('https://cdna.udemycdn.com/subs/course.vtt');

      // Give microtasks time to settle
      await vi.waitFor(() => {
        expect(bridge.send).toHaveBeenCalledWith(
          'SUBTITLE_INTERCEPTED',
          expect.objectContaining({ platform: 'udemy' }),
        );
      });

      // The fetch is still pending (waiting for translation message)
      // Clean up — let it timeout naturally
      fetchPromise.catch(() => {});
    });
  });

  describe('non-matching requests', () => {
    it('passes through non-subtitle requests without interception', async () => {
      const normalResponse = new Response('OK', { status: 200 });
      mockFetch.mockResolvedValue(normalResponse);

      interceptor.enable();

      const result = await window.fetch('https://example.com/api/data');

      expect(result.status).toBe(200);
      expect(bridge.send).not.toHaveBeenCalled();
    });
  });
});
