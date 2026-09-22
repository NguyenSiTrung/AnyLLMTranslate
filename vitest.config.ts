/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'wxt/sandbox': path.resolve(__dirname, '__mocks__/wxt/sandbox.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // Keep jsdom and Web Crypto-heavy files from timing out on oversubscribed
    // hosts while preserving bounded file-level parallelism.
    maxWorkers: 4,
    // Worker threads instead of the default child-process pool. The suite is
    // dominated by per-file setup (transform + collect + jsdom environment),
    // not by test execution, so paying a process fork per file was the single
    // largest cost: on a 4-core host the same suite measured 117s with 5
    // load-sensitive failures under `forks` and 63s all-green under `threads`.
    // `isolate` stays at its default, so each file still gets a fresh module
    // graph and no cross-file global leakage.
    pool: 'threads',
    environmentMatchGlobs: [
      ['entrypoints/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
      ['entrypoints/**/*.test.{ts,tsx}', 'jsdom'],
      ['ui/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
      ['ui/**/*.test.{ts,tsx}', 'jsdom'],
      ['content/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
      ['content/**/*.test.{ts,tsx}', 'jsdom'],
      ['tests/**/*.test.{ts,tsx}', 'jsdom'],
      ['inject/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
      ['styles/**/__tests__/**/*.test.{ts,tsx}', 'jsdom'],
      ['lib/**/__tests__/dom.test.ts', 'jsdom'],
      ['lib/**/__tests__/parsing.test.ts', 'jsdom'],
      ['lib/**/__tests__/maxSubtitles.test.ts', 'jsdom'],
      ['lib/**/__tests__/glossary.test.ts', 'jsdom'],
      ['lib/**/__tests__/siteRuleSuggest.test.ts', 'jsdom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // inject/** carries the MAIN-world Max capture + subtitle handlers; it
      // used to be excluded entirely, which hid untested interception code.
      include: ['services/**', 'lib/**', 'content/**', 'inject/**', 'types/**'],
      exclude: ['**/*.d.ts', '**/__tests__/**', '**/node_modules/**'],
    },
  },
});
