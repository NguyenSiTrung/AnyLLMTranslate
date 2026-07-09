import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMessage, onMessage } from '@/inject/messageBridge';

describe('messageBridge', () => {
  let registeredListeners: { handler: EventListenerOrEventListenerObject }[] = [];
  let postedMessages: unknown[] = [];

  beforeEach(() => {
    registeredListeners = [];
    postedMessages = [];
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (event: string, handler: EventListenerOrEventListenerObject) => {
        if (event === 'message') registeredListeners.push({ handler });
      },
    );
    vi.spyOn(window, 'removeEventListener').mockImplementation(
      (_event: string, handler: EventListenerOrEventListenerObject) => {
        registeredListeners = registeredListeners.filter((entry) => entry.handler !== handler);
      },
    );
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      postedMessages.push(message);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fireMessageEvent(data: unknown, origin?: string) {
    const eventOrigin = origin ?? window.location.origin;
    for (const { handler } of registeredListeners) {
      if (typeof handler === 'function') {
        handler({ data, origin: eventOrigin } as MessageEvent);
      } else if (typeof handler === 'object' && 'handleEvent' in handler) {
        handler.handleEvent({ data, origin: eventOrigin } as MessageEvent);
      }
    }
  }

  it('sendMessage posts channel payload with unique requestIds', () => {
    const id1 = sendMessage('SUBTITLE_INTERCEPTED', { test: true });
    const id2 = sendMessage('SUBTITLE_INTERCEPTED', {});
    expect(id1).not.toBe(id2);
    expect(postedMessages[0]).toEqual(
      expect.objectContaining({
        channel: 'anyllm-translate',
        type: 'SUBTITLE_INTERCEPTED',
        requestId: id1,
        payload: { test: true },
      }),
    );
  });

  it('onMessage matches channel+type, rejects foreign origins/mismatches, supports once+cleanup', () => {
    const handler = vi.fn();
    const cleanup = onMessage('SUBTITLE_TRANSLATED', handler);

    fireMessageEvent({
      channel: 'anyllm-translate',
      type: 'SUBTITLE_TRANSLATED',
      requestId: 'test-123',
      payload: { vttContent: 'test' },
    });
    expect(handler).toHaveBeenCalledWith({ vttContent: 'test' }, 'test-123');

    handler.mockClear();
    fireMessageEvent({
      channel: 'other-channel',
      type: 'SUBTITLE_TRANSLATED',
      requestId: 'x',
      payload: {},
    });
    fireMessageEvent({
      channel: 'anyllm-translate',
      type: 'SUBTITLE_INTERCEPTED',
      requestId: 'x',
      payload: {},
    });
    fireMessageEvent(
      {
        channel: 'anyllm-translate',
        type: 'SUBTITLE_TRANSLATED',
        requestId: 'x',
        payload: {},
      },
      'https://evil.example.com',
    );
    expect(handler).not.toHaveBeenCalled();

    cleanup();
    fireMessageEvent({
      channel: 'anyllm-translate',
      type: 'SUBTITLE_TRANSLATED',
      requestId: 'y',
      payload: {},
    });
    expect(handler).not.toHaveBeenCalled();

    const once = vi.fn();
    onMessage('SUBTITLE_INTERCEPTED', once, { once: true });
    fireMessageEvent({
      channel: 'anyllm-translate',
      type: 'SUBTITLE_INTERCEPTED',
      requestId: 'a',
      payload: {},
    });
    fireMessageEvent({
      channel: 'anyllm-translate',
      type: 'SUBTITLE_INTERCEPTED',
      requestId: 'b',
      payload: {},
    });
    expect(once).toHaveBeenCalledTimes(1);
  });
});
