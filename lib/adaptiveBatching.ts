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
}

const DEFAULT_TARGET_MS = 2500;
const MIN_GROUP = 1;
const MAX_GROUP = 12;
const MIN_CHARS = 400;
const MAX_CHARS = 6000;

/**
 * Update rolling latency average (exponential moving average after first sample).
 */
export function recordBatchLatency(
  state: AdaptiveBatchState,
  latencyMs: number,
  alpha = 0.3,
): AdaptiveBatchState {
  if (state.samples === 0) {
    return { avgLatencyMs: latencyMs, samples: 1 };
  }
  return {
    avgLatencyMs: state.avgLatencyMs * (1 - alpha) + latencyMs * alpha,
    samples: state.samples + 1,
  };
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

export function createAdaptiveBatchState(): AdaptiveBatchState {
  return { avgLatencyMs: 0, samples: 0 };
}
