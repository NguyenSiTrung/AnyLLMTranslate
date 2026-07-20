/**
 * Adaptive batch size from rolling latency (FR-9, opt-in).
 * Pure helpers — wire only when `enableAdaptiveBatching` is true.
 */

export interface AdaptiveBatchBudgets {
  maxTextGroupLengthPerRequest: number;
  maxTextLengthPerRequest: number;
}

export interface AdaptiveBatchState {
  /** Rolling average of recent batch latencies (ms). */
  avgLatencyMs: number;
  samples: number;
  /**
   * FR-12: optional isolation key (provider/model). When set, multi-key maps
   * store per-key EMAs so one slow model does not shrink batches for others.
   */
  key?: string;
}

const DEFAULT_TARGET_MS = 2500;
const MIN_GROUP = 1;
const MAX_GROUP = 12;
const MIN_CHARS = 400;
const MAX_CHARS = 6000;

/** Build a stable adaptive-metrics key from provider + model (+ optional class). */
export function adaptiveMetricsKey(
  providerId: string | undefined,
  model: string | undefined,
  requestClass = 'page',
): string {
  return `${providerId ?? 'default'}|${model ?? 'default'}|${requestClass}`;
}

/**
 * Update rolling latency average (exponential moving average after first sample).
 */
export function recordBatchLatency(
  state: AdaptiveBatchState,
  latencyMs: number,
  alpha = 0.3,
): AdaptiveBatchState {
  if (state.samples === 0) {
    return { avgLatencyMs: latencyMs, samples: 1, key: state.key };
  }
  return {
    avgLatencyMs: state.avgLatencyMs * (1 - alpha) + latencyMs * alpha,
    samples: state.samples + 1,
    key: state.key,
  };
}

/**
 * FR-12: multi-key adaptive state map. Records latency under `key` and returns
 * the updated map (immutable-style shallow copy of the map entry).
 */
export function recordBatchLatencyForKey(
  map: Map<string, AdaptiveBatchState>,
  key: string,
  latencyMs: number,
  alpha = 0.3,
): Map<string, AdaptiveBatchState> {
  const prev = map.get(key) ?? createAdaptiveBatchState(key);
  const next = recordBatchLatency({ ...prev, key }, latencyMs, alpha);
  const out = new Map(map);
  out.set(key, next);
  return out;
}

export function getAdaptiveStateForKey(
  map: Map<string, AdaptiveBatchState>,
  key: string,
): AdaptiveBatchState {
  return map.get(key) ?? createAdaptiveBatchState(key);
}

/**
 * Derive effective group/char budgets from base settings and rolling latency.
 * Faster responses → allow larger batches; slower → shrink to reduce timeouts.
 */
export function computeAdaptiveBudgets(
  base: AdaptiveBatchBudgets,
  state: AdaptiveBatchState,
  targetLatencyMs = DEFAULT_TARGET_MS,
): AdaptiveBatchBudgets {
  if (state.samples === 0 || state.avgLatencyMs <= 0) {
    return { ...base };
  }

  // Ratio < 1 means faster than target → scale up; > 1 → scale down.
  const ratio = targetLatencyMs / state.avgLatencyMs;
  // Clamp scale to avoid wild swings.
  const scale = Math.min(1.75, Math.max(0.4, ratio));

  const baseGroup = base.maxTextGroupLengthPerRequest || 4;
  const baseChars = base.maxTextLengthPerRequest || 2000;

  const group = Math.round(baseGroup * scale);
  const chars = Math.round(baseChars * scale);

  return {
    maxTextGroupLengthPerRequest: Math.min(MAX_GROUP, Math.max(MIN_GROUP, group)),
    maxTextLengthPerRequest: Math.min(MAX_CHARS, Math.max(MIN_CHARS, chars)),
  };
}

export function createAdaptiveBatchState(key?: string): AdaptiveBatchState {
  return { avgLatencyMs: 0, samples: 0, ...(key !== undefined ? { key } : {}) };
}
