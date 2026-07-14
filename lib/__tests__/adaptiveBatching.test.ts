import { describe, it, expect } from 'vitest';
import {
  computeAdaptiveBudgets,
  createAdaptiveBatchState,
  recordBatchLatency,
} from '@/lib/adaptiveBatching';

describe('recordBatchLatency', () => {
  it('sets first sample directly', () => {
    const s = recordBatchLatency(createAdaptiveBatchState(), 1000);
    expect(s).toEqual({ avgLatencyMs: 1000, samples: 1 });
  });

  it('applies EMA on subsequent samples', () => {
    let s = recordBatchLatency(createAdaptiveBatchState(), 1000);
    s = recordBatchLatency(s, 2000, 0.5);
    expect(s.avgLatencyMs).toBe(1500);
    expect(s.samples).toBe(2);
  });
});

describe('computeAdaptiveBudgets', () => {
  const base = {
    maxTextGroupLengthPerRequest: 4,
    maxTextLengthPerRequest: 2000,
  };

  it('returns base budgets when no samples', () => {
    expect(computeAdaptiveBudgets(base, createAdaptiveBatchState())).toEqual(base);
  });

  it('increases budgets when faster than target', () => {
    const state = { avgLatencyMs: 1000, samples: 5 };
    const budgets = computeAdaptiveBudgets(base, state, 2500);
    expect(budgets.maxTextGroupLengthPerRequest).toBeGreaterThan(base.maxTextGroupLengthPerRequest);
    expect(budgets.maxTextLengthPerRequest).toBeGreaterThan(base.maxTextLengthPerRequest);
  });

  it('decreases budgets when slower than target', () => {
    const state = { avgLatencyMs: 8000, samples: 5 };
    const budgets = computeAdaptiveBudgets(base, state, 2500);
    expect(budgets.maxTextGroupLengthPerRequest).toBeLessThan(base.maxTextGroupLengthPerRequest);
    expect(budgets.maxTextLengthPerRequest).toBeLessThan(base.maxTextLengthPerRequest);
  });

  it('clamps to min/max bounds', () => {
    const tiny = computeAdaptiveBudgets(base, { avgLatencyMs: 100_000, samples: 3 }, 2500);
    expect(tiny.maxTextGroupLengthPerRequest).toBeGreaterThanOrEqual(1);
    expect(tiny.maxTextLengthPerRequest).toBeGreaterThanOrEqual(400);

    const huge = computeAdaptiveBudgets(base, { avgLatencyMs: 10, samples: 3 }, 2500);
    expect(huge.maxTextGroupLengthPerRequest).toBeLessThanOrEqual(12);
    expect(huge.maxTextLengthPerRequest).toBeLessThanOrEqual(6000);
  });
});
