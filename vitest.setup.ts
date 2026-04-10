import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock ResizeObserver for jsdom environment
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Mock WXT defineContentScript
global.defineContentScript = vi.fn();

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
