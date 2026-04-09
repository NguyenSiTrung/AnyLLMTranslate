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
        if (event === 'message') {
          registeredListeners.push({ handler });
        }
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

  function fireMessageEvent(data: unknown) {
    for (const { handler } of registeredListeners) {
      if (typeof handler === 'function') {
        handler({ data } as MessageEvent);
      } else if (typeof handler === 'object' && 'handleEvent' in handler) {
        handler.handleEvent({ data } as MessageEvent);
      }
    }
  }

  describe('sendMessage', () => {
    it('posts a message with correct channel', () => {
      const requestId = sendMessage('SUBTITLE_INTERCEPTED', { test: true });
      expect(postedMessages[0]).toEqual(
        expect.objectContaining({
          channel: 'lingua-lens',
          type: 'SUBTITLE_INTERCEPTED',
          requestId,
          payload: { test: true },
        }),
      );
    });

    it('returns a unique requestId', () => {
      const id1 = sendMessage('SUBTITLE_INTERCEPTED', {});
      const id2 = sendMessage('SUBTITLE_INTERCEPTED', {});
      expect(id1).not.toBe(id2);
    });
  });

  describe('onMessage', () => {
    it('calls handler for matching channel and type', () => {
      const handler = vi.fn();
      onMessage('SUBTITLE_TRANSLATED', handler);

      fireMessageEvent({
        channel: 'lingua-lens',
        type: 'SUBTITLE_TRANSLATED',
        requestId: 'test-123',
        payload: { vttContent: 'test' },
      });

      expect(handler).toHaveBeenCalledWith({ vttContent: 'test' }, 'test-123');
    });

    it('ignores messages from different channel', () => {
      const handler = vi.fn();
      onMessage('SUBTITLE_TRANSLATED', handler);

      fireMessageEvent({
        channel: 'other-channel',
        type: 'SUBTITLE_TRANSLATED',
        requestId: 'test-123',
        payload: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores messages of different type', () => {
      const handler = vi.fn();
      onMessage('SUBTITLE_TRANSLATED', handler);

      fireMessageEvent({
        channel: 'lingua-lens',
        type: 'SUBTITLE_INTERCEPTED',
        requestId: 'test-123',
        payload: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('returns a cleanup function that removes the listener', () => {
      const handler = vi.fn();
      const cleanup = onMessage('SUBTITLE_INTERCEPTED', handler);
      cleanup();

      fireMessageEvent({
        channel: 'lingua-lens',
        type: 'SUBTITLE_INTERCEPTED',
        requestId: 'test',
        payload: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('removes listener after once callback', () => {
      const handler = vi.fn();
      onMessage('SUBTITLE_INTERCEPTED', handler, { once: true });

      fireMessageEvent({
        channel: 'lingua-lens',
        type: 'SUBTITLE_INTERCEPTED',
        requestId: 'test',
        payload: {},
      });

      fireMessageEvent({
        channel: 'lingua-lens',
        type: 'SUBTITLE_INTERCEPTED',
        requestId: 'test2',
        payload: {},
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
