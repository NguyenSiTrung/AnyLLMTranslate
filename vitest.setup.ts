import { vi } from 'vitest';

// Mock WXT defineContentScript
(globalThis as unknown as Record<string, unknown>).defineContentScript = vi.fn();

if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');

  // Mock ResizeObserver for jsdom environment
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  // Patch KeyboardEvent in jsdom to assign unique timeStamps (required for dedup tests)
  let _keyboardEventTimeStamp = 1;
  const OriginalKeyboardEvent = globalThis.KeyboardEvent;
  (globalThis as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent = class extends (OriginalKeyboardEvent as typeof KeyboardEvent) {
    constructor(type: string, eventInitDict?: KeyboardEventInit) {
      super(type, eventInitDict);
      Object.defineProperty(this, 'timeStamp', { value: _keyboardEventTimeStamp++ });
    }
  } as typeof KeyboardEvent;
}

// Mock chrome API for extension tests
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn((_name: string, callback?: (alarm?: chrome.alarms.Alarm) => void) => {
      if (callback) callback(undefined);
    }),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn((message: unknown, callback?: (response: unknown) => void) => {
      if (callback) {
        callback({ content: 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest' });
        return true;
      }
      return Promise.resolve({ content: 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nTest' });
    }),
    lastError: null,
  },
} as unknown as typeof chrome;
