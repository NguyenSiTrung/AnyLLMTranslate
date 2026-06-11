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

  describe('lifecycle robustness', () => {
    it('restores a passthrough fetch on disable', async () => {
      interceptor.enable();
      const patched = window.fetch;
      expect(patched).not.toBe(mockFetch);

      interceptor.disable();

      // Restored fetch is the (bound) original — distinct from the patch and
      // delegates straight to the underlying mock.
      expect(window.fetch).not.toBe(patched);
      mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));
      await window.fetch('https://example.com/x');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('is idempotent across repeated enable/disable cycles', async () => {
      interceptor.enable();
      interceptor.disable();
      interceptor.enable();

      const normalResponse = new Response('OK', { status: 200 });
      mockFetch.mockResolvedValue(normalResponse);

      await window.fetch('https://example.com/api/data');

      // A single layer of patching → exactly one underlying fetch call.
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not clobber a foreign fetch patch on disable', () => {
      interceptor.enable();
      const foreignFetch = vi.fn() as unknown as typeof window.fetch;
      window.fetch = foreignFetch;

      interceptor.disable();

      expect(window.fetch).toBe(foreignFetch);
      // Restore for afterAll teardown
      window.fetch = mockFetch as unknown as typeof window.fetch;
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

  describe('origin validation (Phase 1.4)', () => {
    it('ignores translated messages from foreign origins', async () => {
      const okResponse = new Response('WEBVTT\n\ntest', {
        status: 200,
        headers: { 'Content-Type': 'text/vtt' },
      });
      mockFetch.mockResolvedValue(okResponse);

      // Capture the message handler the interceptor registers
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

      // Trigger interception but don't await (it blocks on translation)
      const fetchPromise = window.fetch('https://cdna.udemycdn.com/subs/course.vtt');
      fetchPromise.catch(() => {});

      // Wait for SUBTITLE_INTERCEPTED to be sent
      await vi.waitFor(() => {
        expect(bridge.send).toHaveBeenCalledWith(
          'SUBTITLE_INTERCEPTED',
          expect.objectContaining({ platform: 'udemy' }),
        );
      });

      // Forge a translated message from a foreign origin with the correct requestId
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

      // The forged message should have been ignored — the handler is still registered
      expect(messageHandlers.length).toBeGreaterThan(0);

      addSpy.mockRestore();
      removeSpy.mockRestore();
      // Restore the original addEventListener so interceptor.disable() works
      // (it captures the real one in the spy above).
      // Use the captured reference to ensure a clean teardown.
      // Suppress unused warning for the original reference.
      void originalAdd;
    });

    it('accepts translated messages from the same origin', async () => {
      const okResponse = new Response('WEBVTT\n\ntest', {
        status: 200,
        headers: { 'Content-Type': 'text/vtt' },
      });
      mockFetch.mockResolvedValue(okResponse);

      const messageHandlers: ((event: MessageEvent) => void)[] = [];
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
        expect(bridge.send).toHaveBeenCalled();
      });

      const handlersBefore = messageHandlers.length;
      expect(handlersBefore).toBeGreaterThan(0);

      // Genuine message from same origin with correct requestId
      const genuineEvent = {
        data: {
          channel: 'anyllm-translate',
          type: 'SUBTITLE_TRANSLATED',
          requestId: 'req-456',
          payload: { vttContent: 'WEBVTT\nreal' },
        },
        origin: window.location.origin,
      } as MessageEvent;
      for (const handler of [...messageHandlers]) {
        handler(genuineEvent);
      }

      // Same-origin message should be accepted — handler should be removed
      expect(messageHandlers.length).toBeLessThan(handlersBefore);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});
