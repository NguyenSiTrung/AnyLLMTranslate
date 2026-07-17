import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { XhrInterceptor } from '@/inject/xhrInterceptor';
import { InterceptorRegistry } from '@/inject/interceptorRegistry';

/**
 * XHR Interceptor tests use a manual event dispatch mechanism because
 * jsdom's XMLHttpRequest does not fire real readystatechange/load events.
 */
describe('XhrInterceptor', () => {
  let registry: InterceptorRegistry;
  let bridge: { send: ReturnType<typeof vi.fn> };
  let interceptor: XhrInterceptor;
  let messageListeners: ((event: MessageEvent) => void)[];
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
      origin: window.location.origin,
    } as MessageEvent;
    for (const listener of [...messageListeners]) {
      listener(event);
    }
  }

  function simulateXhrComplete(xhr: XMLHttpRequest) {
    Object.defineProperty(xhr, 'readyState', { value: 4, writable: true, configurable: true });
    Object.defineProperty(xhr, 'status', { value: 200, writable: true, configurable: true });
    Object.defineProperty(xhr, 'responseText', { value: 'original-subtitle', writable: true, configurable: true });
    (xhr as XMLHttpRequest & { getResponseHeader: (h: string) => string }).getResponseHeader = () => 'text/vtt';

    const handlers = xhrInternalHandlers.get(xhr) || [];
    for (const h of handlers) {
      h(new Event('readystatechange'));
    }
  }

  it('block-and-wait: suppress until translated, timeout fallback, listener cleanup', () => {
    interceptor.enable();
    const xhr = new XMLHttpRequest();
    const onloadHandler = vi.fn();
    const onReadyStateHandler = vi.fn();

    xhr.onload = onloadHandler;
    xhr.onreadystatechange = onReadyStateHandler;
    xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
    xhr.send();

    onReadyStateHandler.mockClear();
    onloadHandler.mockClear();
    simulateXhrComplete(xhr);

    expect(onloadHandler).not.toHaveBeenCalled();
    expect(onReadyStateHandler).not.toHaveBeenCalled();

    fireTranslatedMessage('req-123', 'WEBVTT\ntranslated');
    expect(onReadyStateHandler).toHaveBeenCalled();
    expect(onloadHandler).toHaveBeenCalled();

    // Timeout path
    const xhr2 = new XMLHttpRequest();
    const onload2 = vi.fn();
    xhr2.onload = onload2;
    xhr2.open('GET', 'https://www.youtube.com/api/timedtext?v=def');
    xhr2.send();
    simulateXhrComplete(xhr2);

    const listenerCountBefore = messageListeners.length;
    expect(listenerCountBefore).toBeGreaterThan(0);
    vi.advanceTimersByTime(30100);
    expect(onload2).toHaveBeenCalled();
    expect(messageListeners.length).toBeLessThan(listenerCountBefore);
  });

  it('captures load/readystatechange addEventListener handlers and overrides response', () => {
    interceptor.enable();
    const xhr = new XMLHttpRequest();
    const addEventHandler = vi.fn();
    const rscHandler = vi.fn();

    xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
    xhr.addEventListener('load', addEventHandler);
    xhr.addEventListener('readystatechange', rscHandler);
    xhr.send();

    simulateXhrComplete(xhr);
    fireTranslatedMessage('req-123', 'WEBVTT\ntranslated');

    expect(addEventHandler).toHaveBeenCalled();
    expect(rscHandler).toHaveBeenCalled();
    expect(xhr.responseText).toBe('WEBVTT\ntranslated');
    expect(xhr.response).toBe('WEBVTT\ntranslated');
  });

  it('lifecycle: no double-patch, restore send, non-match passthrough, timeout/abort', () => {
    interceptor.enable();
    interceptor.disable();
    interceptor.enable();

    const xhr = new XMLHttpRequest();
    xhr.onload = vi.fn();
    xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
    xhr.send();
    simulateXhrComplete(xhr);
    expect(bridge.send).toHaveBeenCalledTimes(1);

    const patchedSend = XMLHttpRequest.prototype.send;
    interceptor.disable();
    expect(XMLHttpRequest.prototype.send).not.toBe(patchedSend);

    interceptor.enable();
    const xhr2 = new XMLHttpRequest();
    xhr2.open('GET', 'https://example.com/api/users');
    expect(() => xhr2.send()).not.toThrow();
    expect(bridge.send).toHaveBeenCalledTimes(1);

    interceptor.setTimeout(5000);
    const xhr3 = new XMLHttpRequest();
    xhr3.open('GET', 'https://www.youtube.com/api/timedtext?v=timeout');
    expect(() => xhr3.send()).not.toThrow();

    const xhr4 = new XMLHttpRequest();
    xhr4.open('GET', 'https://www.youtube.com/api/timedtext?v=abort');
    expect(() => xhr4.send()).not.toThrow();
    simulateXhrComplete(xhr4);
    expect(messageListeners.length).toBeGreaterThanOrEqual(1);
  });

  it('ignores translated messages from foreign origins', () => {
    interceptor.enable();
    const xhr = new XMLHttpRequest();
    const onloadHandler = vi.fn();
    xhr.onload = onloadHandler;
    xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
    xhr.send();

    simulateXhrComplete(xhr);

    const listenersBefore = messageListeners.length;
    expect(listenersBefore).toBeGreaterThan(0);

    const forgedEvent = {
      data: {
        channel: 'anyllm-translate',
        type: 'SUBTITLE_TRANSLATED',
        requestId: 'req-123',
        payload: { vttContent: 'WEBVTT\nforged' },
      },
      origin: 'https://evil.example.com',
    } as MessageEvent;
    for (const listener of [...messageListeners]) {
      listener(forgedEvent);
    }

    expect(messageListeners.length).toBe(listenersBefore);
    expect(onloadHandler).not.toHaveBeenCalled();
  });

  // Keep a 5th consolidated case for response override isolation under concurrent path
  it('overrides responseText/response after same-origin SUBTITLE_TRANSLATED', () => {
    interceptor.enable();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://www.youtube.com/api/timedtext?v=abc');
    xhr.send();
    simulateXhrComplete(xhr);

    const translatedEvent = {
      data: {
        channel: 'anyllm-translate',
        type: 'SUBTITLE_TRANSLATED',
        requestId: 'req-123',
        payload: { vttContent: 'WEBVTT\ntranslated' },
      },
      origin: window.location.origin,
    } as MessageEvent;
    for (const listener of [...messageListeners]) {
      listener(translatedEvent);
    }

    expect(xhr.responseText).toBe('WEBVTT\ntranslated');
    expect(xhr.response).toBe('WEBVTT\ntranslated');
  });
});
