/**
 * Unit tests for per-key rate limit summary + preset matching.
 */

import { describe, it, expect } from 'vitest';
import {
  formatKeyRateLimitSummary,
  matchKeyRateLimitPreset,
  getKeyRateLimitPresetValues,
  KEY_RATE_LIMIT_PRESETS,
} from '@/lib/keyRateLimits';
import {
  DEFAULT_KEY_MAX_RPM,
  DEFAULT_KEY_CONCURRENCY_LIMIT,
  DEFAULT_KEY_INTERVAL_MS,
} from '@/types/config';

describe('keyRateLimits', () => {
  it('formats summaries, matches presets, detects custom, and defines four preset values', () => {
    expect(
      formatKeyRateLimitSummary({ maxRpm: 20, concurrencyLimit: 1, interval: 500 }),
    ).toBe('20/min · 1 at once · 500 ms gap');
    expect(
      formatKeyRateLimitSummary({ maxRpm: 0, concurrencyLimit: 0, interval: 0 }),
    ).toBe('Unlimited rate · No concurrency cap · No gap');
    expect(
      formatKeyRateLimitSummary({ maxRpm: 30, concurrencyLimit: 0, interval: 100 }),
    ).toBe('30/min · No concurrency cap · 100 ms gap');

    expect(
      matchKeyRateLimitPreset({
        maxRpm: DEFAULT_KEY_MAX_RPM,
        concurrencyLimit: DEFAULT_KEY_CONCURRENCY_LIMIT,
        interval: DEFAULT_KEY_INTERVAL_MS,
      }),
    ).toBe('safe');
    expect(matchKeyRateLimitPreset(getKeyRateLimitPresetValues('balanced'))).toBe('balanced');
    expect(matchKeyRateLimitPreset(getKeyRateLimitPresetValues('aggressive'))).toBe('aggressive');
    expect(matchKeyRateLimitPreset(getKeyRateLimitPresetValues('unlimited'))).toBe('unlimited');
    expect(
      matchKeyRateLimitPreset({ maxRpm: 15, concurrencyLimit: 1, interval: 500 }),
    ).toBeNull();

    expect(KEY_RATE_LIMIT_PRESETS.map((p) => p.id)).toEqual([
      'safe',
      'balanced',
      'aggressive',
      'unlimited',
    ]);
    expect(getKeyRateLimitPresetValues('safe')).toEqual({
      maxRpm: 20,
      concurrencyLimit: 1,
      interval: 500,
    });
    expect(getKeyRateLimitPresetValues('balanced')).toEqual({
      maxRpm: 40,
      concurrencyLimit: 2,
      interval: 250,
    });
    expect(getKeyRateLimitPresetValues('aggressive')).toEqual({
      maxRpm: 60,
      concurrencyLimit: 4,
      interval: 100,
    });
    expect(getKeyRateLimitPresetValues('unlimited')).toEqual({
      maxRpm: 0,
      concurrencyLimit: 0,
      interval: 0,
    });
  });
});
