/**
 * Pure helpers for per-key rate limit summary + presets (Providers → Keys UI).
 */

import {
  DEFAULT_KEY_CONCURRENCY_LIMIT,
  DEFAULT_KEY_INTERVAL_MS,
  DEFAULT_KEY_MAX_RPM,
} from '@/types/config';

export type KeyRateLimitPresetId =
  | 'safe'
  | 'balanced'
  | 'aggressive'
  | 'unlimited';

export interface KeyRateLimitValues {
  maxRpm: number;
  concurrencyLimit: number;
  interval: number;
}

export interface KeyRateLimitPreset {
  id: KeyRateLimitPresetId;
  label: string;
  values: KeyRateLimitValues;
}

export const KEY_RATE_LIMIT_PRESETS: readonly KeyRateLimitPreset[] = [
  {
    id: 'safe',
    label: 'Safe',
    values: {
      maxRpm: DEFAULT_KEY_MAX_RPM,
      concurrencyLimit: DEFAULT_KEY_CONCURRENCY_LIMIT,
      interval: DEFAULT_KEY_INTERVAL_MS,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    values: { maxRpm: 40, concurrencyLimit: 2, interval: 250 },
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    values: { maxRpm: 60, concurrencyLimit: 4, interval: 100 },
  },
  {
    id: 'unlimited',
    label: 'Unlimited',
    values: { maxRpm: 0, concurrencyLimit: 0, interval: 0 },
  },
] as const;

export function formatKeyRateLimitSummary(values: KeyRateLimitValues): string {
  const rate = values.maxRpm > 0 ? `${values.maxRpm}/min` : 'Unlimited rate';
  const concurrent =
    values.concurrencyLimit > 0
      ? `${values.concurrencyLimit} at once`
      : 'No concurrency cap';
  const gap = values.interval > 0 ? `${values.interval} ms gap` : 'No gap';
  return `${rate} · ${concurrent} · ${gap}`;
}

export function matchKeyRateLimitPreset(
  values: KeyRateLimitValues,
): KeyRateLimitPresetId | null {
  for (const preset of KEY_RATE_LIMIT_PRESETS) {
    if (
      preset.values.maxRpm === values.maxRpm &&
      preset.values.concurrencyLimit === values.concurrencyLimit &&
      preset.values.interval === values.interval
    ) {
      return preset.id;
    }
  }
  return null;
}

export function getKeyRateLimitPresetValues(
  id: KeyRateLimitPresetId,
): KeyRateLimitValues {
  const preset = KEY_RATE_LIMIT_PRESETS.find((p) => p.id === id);
  if (!preset) {
    throw new Error(`Unknown key rate limit preset: ${id}`);
  }
  return { ...preset.values };
}
