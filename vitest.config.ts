/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['entrypoints/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
      ['entrypoints/**/*.test.{ts,tsx}', 'jsdom'],
      ['content/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
      ['content/**/*.test.{ts,tsx}', 'jsdom'],
      ['tests/**/*.test.{ts,tsx}', 'jsdom'],
      ['inject/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
      ['styles/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
      ['lib/**/__tests__/domUtils.test.ts', 'jsdom'],
      ['lib/**/__tests__/manifestParser.test.ts', 'jsdom'],
      ['lib/**/__tests__/maxMpdSubtitles.test.ts', 'jsdom'],
      ['lib/**/__tests__/maxSubtitleLanguages.test.ts', 'jsdom'],
      ['lib/**/__tests__/performance.test.ts', 'jsdom'],
      ['lib/**/__tests__/ttmlParser.test.ts', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['services/**', 'lib/**', 'content/**', 'types/**'],
      exclude: ['**/*.d.ts', '**/__tests__/**', '**/node_modules/**'],
    },
  },
});
