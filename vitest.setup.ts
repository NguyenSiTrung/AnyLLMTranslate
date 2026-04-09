import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock ResizeObserver for jsdom environment
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Mock chrome API for extension tests
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
} as unknown as typeof chrome;
