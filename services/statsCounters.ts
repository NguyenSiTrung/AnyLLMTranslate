import {
  ZERO_COUNTERS,
  type StatCounters,
} from '@/types/stats';

export { ZERO_COUNTERS } from '@/types/stats';

const COUNTER_KEYS = Object.keys(ZERO_COUNTERS) as Array<keyof StatCounters>;

export function mergeCounters(a: StatCounters, b: StatCounters): StatCounters {
  const result = { ...ZERO_COUNTERS };
  for (const key of COUNTER_KEYS) {
    result[key] = a[key] + b[key];
  }
  return result;
}

export function addPartialCounters(
  base: StatCounters,
  partial: Partial<StatCounters>,
): StatCounters {
  const result = { ...base };
  for (const key of COUNTER_KEYS) {
    const value = partial[key];
    if (value !== undefined) {
      result[key] = result[key] + value;
    }
  }
  return result;
}

export function normalizeHost(host: string | undefined): string | undefined {
  if (host === undefined || host === '') {
    return undefined;
  }
  const normalized = host.trim().toLowerCase().replace(/^www\./, '');
  return normalized === '' ? undefined : normalized;
}

export function languagePairKey(source: string, target: string): string {
  return `${source}>${target}`;
}

/**
 * Merge `partial` into `map[key]`. If the number of keys exceeds `maxKeys`,
 * keep the top `maxKeys` entries by `characters` (desc) and roll the rest
 * into `__other__`.
 */
export function mergeDimensionMap(
  map: Record<string, Partial<StatCounters>>,
  key: string,
  partial: Partial<StatCounters>,
  maxKeys: number,
): Record<string, Partial<StatCounters>> {
  const next: Record<string, Partial<StatCounters>> = { ...map };
  const existing = next[key] ?? {};
  next[key] = addPartialCounters(
    addPartialCounters(ZERO_COUNTERS, existing),
    partial,
  );

  const keys = Object.keys(next);
  if (keys.length <= maxKeys) {
    return next;
  }

  const entries = Object.entries(next).sort(([, a], [, b]) => {
    return (b.characters ?? 0) - (a.characters ?? 0);
  });

  const kept = entries.slice(0, maxKeys);
  const remainder = entries.slice(maxKeys);

  const result: Record<string, Partial<StatCounters>> = {};
  for (const [k, v] of kept) {
    result[k] = v;
  }

  let other = result.__other__
    ? addPartialCounters(ZERO_COUNTERS, result.__other__)
    : { ...ZERO_COUNTERS };

  for (const [, v] of remainder) {
    other = addPartialCounters(other, v);
  }

  result.__other__ = other;
  return result;
}
