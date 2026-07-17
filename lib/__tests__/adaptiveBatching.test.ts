import { describe, it, expect } from 'vitest';
import {
  computeAdaptiveBudgets,
  createAdaptiveBatchState,
  recordBatchLatency,
} from '@/lib/adaptiveBatching';

describe('adaptiveBatching', () => {
  it('records latency EMA and adapts budgets up/down with clamps', () => {
    const first = recordBatchLatency(createAdaptiveBatchState(), 1000);
    expect(first).toEqual({ avgLatencyMs: 1000, samples: 1 });
    const ema = recordBatchLatency(first, 2000, 0.5);
    expect(ema.avgLatencyMs).toBe(1500);
    expect(ema.samples).toBe(2);

    const base = {
      maxTextGroupLengthPerRequest: 4,
      maxTextLengthPerRequest: 2000,
    };
    expect(computeAdaptiveBudgets(base, createAdaptiveBatchState())).toEqual(base);

    const faster = computeAdaptiveBudgets(base, { avgLatencyMs: 1000, samples: 5 }, 2500);
    expect(faster.maxTextGroupLengthPerRequest).toBeGreaterThan(base.maxTextGroupLengthPerRequest);
    expect(faster.maxTextLengthPerRequest).toBeGreaterThan(base.maxTextLengthPerRequest);

    const slower = computeAdaptiveBudgets(base, { avgLatencyMs: 8000, samples: 5 }, 2500);
    expect(slower.maxTextGroupLengthPerRequest).toBeLessThan(base.maxTextGroupLengthPerRequest);
    expect(slower.maxTextLengthPerRequest).toBeLessThan(base.maxTextLengthPerRequest);

    const tiny = computeAdaptiveBudgets(base, { avgLatencyMs: 100_000, samples: 3 }, 2500);
    expect(tiny.maxTextGroupLengthPerRequest).toBeGreaterThanOrEqual(1);
    expect(tiny.maxTextLengthPerRequest).toBeGreaterThanOrEqual(400);

    const huge = computeAdaptiveBudgets(base, { avgLatencyMs: 10, samples: 3 }, 2500);
    expect(huge.maxTextGroupLengthPerRequest).toBeLessThanOrEqual(12);
    expect(huge.maxTextLengthPerRequest).toBeLessThanOrEqual(6000);
  });
});
