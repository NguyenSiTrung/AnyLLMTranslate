import '@testing-library/jest-dom/vitest';

// Mock ResizeObserver for jsdom environment
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;
