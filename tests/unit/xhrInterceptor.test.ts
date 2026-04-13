import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { XhrInterceptor } from '@/inject/xhrInterceptor';
import { InterceptorRegistry } from '@/inject/interceptorRegistry';

/**
 * XHR Interceptor tests use a manual event dispatch mechanism because
 * jsdom's XMLHttpRequest does not fire real readystatechange/load events.
 * We capture the handler registered via the original addEventListener
 * and invoke it manually to simulate the browser lifecycle.
 */
describe('XhrInterceptor', () => {
  let registry: InterceptorRegistry;
  let bridge: { send: ReturnType<typeof vi.fn> };
  let interceptor: XhrInterceptor;
  let messageListeners: ((event: MessageEvent) => void)[];
  /** Handlers registered via the *original* addEventListener (readystatechange on XHR) */
  let xhrInternalHandlers: Map<EventTarget, ((e: Event) => void)[]>;

  beforeEach(() => {
    registry = new InterceptorRegistry();
    registry.registerPattern({
      platform: 'youtube',
      pattern: /\/api\/timedtext/,
    });
    bridge = { send: vi.fn(() => 'req-123') };
    interceptor = new XhrInterceptor(registry, bridge);
    messageListeners = [];
    xhrInternalHandlers = new Map();

    // Capture window message listeners
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        if (type === 'message' && typeof handler === 'function') {
          messageListeners.push(handler);
        }
      },
    );
    vi.spyOn(window, 'removeEventListener').mockImplementation(
      (_type: string, handler: EventListenerOrEventListenerObject) => {
        messageListeners = messageListeners.filter((h) => h !== handler);
      },
    );

    // Capture XHR internal addEventListener calls (the original one used by handleResponse)
    // We do NOT call the real addEventListener to avoid jsdom auto-firing events
    vi.spyOn(XMLHttpRequest.prototype, 'addEventListener').mockImplementation(function (
      this: XMLHttpRequest,
      type: string,
      handler: EventListenerOrEventListenerObject,
    ) {
      if (type === 'readystatechange' && typeof handler === 'function') {
        const handlers = xhrInternalHandlers.get(this) || [];
        handlers.push(handler);
        xhrInternalHandlers.set(this, handlers);
      }
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    interceptor.disable();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function fireTranslatedMessage(requestId: string, vttContent: string) {
    const event = {
      data: {
        channel: 'anyllm-translate',
        type: 'SUBTITLE_TRANSLATED',
        requestId,
        payload: { vttContent },
      },
    } as MessageEvent;
    for (const listener of [...messageListeners]) {
      listener(event);
    }
  }

  /** Simulate browser firing readyState 4 / status 200 on an XHR instance */
  function simulateXhrComplete(xhr: XMLHttpRequest) {
    Object.defineProperty(xhr, 'readyState', { value: 4, writable: true, configurable: true });
    Object.defineProperty(xhr, 'status', { value: 200, writable: true, configurable: true });
    Object.defineProperty(xhr, 'responseText', { value: 'original-subtitle', writable: true, configurable: true });
    (xhr as XMLHttpRequest & { getResponseHeader: (h: string) => string }).getResponseHeader = () => 'text/vtt';

    // Fire all internally registered readystatechange handlers
    const handlers = xhrInternalHandlers.get(xhr) || [];
    for (const h of handlers) {
      h(new Event('readystatechange'));
    }
  }

  describe('block-and-wait behavior', () => {
    it('does NOT call original handlers before SUBTITLE_TRANSLATED arrives', () => {
      interceptor.enable();
      const xhr = new XMLHttpRequest();
      const onloadHandler = vi.fn();
      const onReadyStateHandler = vi.fn();

      xhr.onload = onloadHandler;
      xhr.onreadystatechange = onReadyStateHandler;
      xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
      xhr.send();

      // At this point the patched send() has suppressed onreadystatechange/onload
      // and registered handleResponse via originalAddEventListener.
      // But jsdom's XHR fires readystatechange events for states 1-2 etc.
      // The key assertion: after the XHR completes (readyState 4) and before
      // translation, the original handlers should NOT be called.
      onReadyStateHandler.mockClear();
      onloadHandler.mockClear();

      // Simulate browser completing the XHR
      simulateXhrComplete(xhr);

      // Original handlers should NOT be called — blocked waiting for translation
      expect(onloadHandler).not.toHaveBeenCalled();
      expect(onReadyStateHandler).not.toHaveBeenCalled();
    });

    it('calls original handlers AFTER SUBTITLE_TRANSLATED message', () => {
      interceptor.enable();
      const xhr = new XMLHttpRequest();
      const onloadHandler = vi.fn();
      const onReadyStateHandler = vi.fn();

      xhr.onload = onloadHandler;
      xhr.onreadystatechange = onReadyStateHandler;
      xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
      xhr.send();

      simulateXhrComplete(xhr);

      // Fire translated message
      fireTranslatedMessage('req-123', 'WEBVTT\ntranslated');

      expect(onReadyStateHandler).toHaveBeenCalled();
      expect(onloadHandler).toHaveBeenCalled();
    });

    it('calls handlers with original content after 5s timeout', () => {
      interceptor.enable();
      const xhr = new XMLHttpRequest();
      const onloadHandler = vi.fn();

      xhr.onload = onloadHandler;
      xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
      xhr.send();

      simulateXhrComplete(xhr);

      // Advance past 5s timeout
      vi.advanceTimersByTime(5100);

      expect(onloadHandler).toHaveBeenCalled();
    });

    it('removes window listener on timeout (no lingering handlers)', () => {
      interceptor.enable();
      const xhr = new XMLHttpRequest();
      xhr.onload = vi.fn();
      xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
      xhr.send();

      simulateXhrComplete(xhr);

      const listenerCountBefore = messageListeners.length;
      expect(listenerCountBefore).toBeGreaterThan(0);

      vi.advanceTimersByTime(5100);

      expect(messageListeners.length).toBeLessThan(listenerCountBefore);
    });
  });

  describe('addEventListener coverage', () => {
    it('captures load handlers registered via addEventListener', () => {
      interceptor.enable();
      const xhr = new XMLHttpRequest();
      const addEventHandler = vi.fn();

      xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
      xhr.addEventListener('load', addEventHandler);
      xhr.send();

      simulateXhrComplete(xhr);
      fireTranslatedMessage('req-123', 'WEBVTT\ntranslated');

      expect(addEventHandler).toHaveBeenCalled();
    });

    it('captures readystatechange handlers registered via addEventListener', () => {
      interceptor.enable();
      const xhr = new XMLHttpRequest();
      const rscHandler = vi.fn();

      xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
      xhr.addEventListener('readystatechange', rscHandler);
      xhr.send();

      simulateXhrComplete(xhr);
      fireTranslatedMessage('req-123', 'WEBVTT\ntranslated');

      expect(rscHandler).toHaveBeenCalled();
    });

    it('does not intercept addEventListener for non-subtitle XHRs', () => {
      interceptor.enable();
      const xhr = new XMLHttpRequest();
      const loadHandler = vi.fn();

      xhr.open('GET', 'https://example.com/api/data');
      xhr.addEventListener('load', loadHandler);

      expect(() => xhr.send()).not.toThrow();
    });
  });

  describe('non-subtitle requests', () => {
    it('passes through non-matching requests without interception', () => {
      interceptor.enable();
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'https://example.com/api/users');
      expect(() => xhr.send()).not.toThrow();
      expect(bridge.send).not.toHaveBeenCalled();
    });
  });
});
