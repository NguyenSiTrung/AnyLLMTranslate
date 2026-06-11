/**
 * Tests: rate-limiting semaphore queue/timeout determinism
 *
 * Phase 2 Tasks 3-4 of deep-analysis-hardening. Verifies slot handoff to queued
 * waiters and that a timed-out queued waiter never leaks an active slot.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('chrome', {
  storage: {
    local: { get: vi.fn(), set: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: { onRemoved: { addListener: vi.fn() } },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

import {
  acquireSemaphore,
  releaseSemaphore,
  __resetSemaphoreForTest,
  __getSemaphoreStateForTest,
} from '../background';

const MAX_CONCURRENT = 3;
const MAX_QUEUE = 10;

describe('translation semaphore', () => {
  beforeEach(() => {
    __resetSemaphoreForTest();
    vi.useRealTimers();
  });

  it('admits up to MAX_CONCURRENT immediately', async () => {
    for (let i = 0; i < MAX_CONCURRENT; i++) await acquireSemaphore();
    expect(__getSemaphoreStateForTest()).toEqual({ active: MAX_CONCURRENT, queued: 0 });
  });

  it('queues acquisitions beyond MAX_CONCURRENT', async () => {
    for (let i = 0; i < MAX_CONCURRENT; i++) await acquireSemaphore();

    let resolved = false;
    const pending = acquireSemaphore().then(() => { resolved = true; });
    await Promise.resolve();

    expect(resolved).toBe(false);
    expect(__getSemaphoreStateForTest()).toEqual({ active: MAX_CONCURRENT, queued: 1 });

    // Hand the slot off so the pending acquire resolves.
    releaseSemaphore();
    await pending;
    expect(resolved).toBe(true);
    // Slot transferred, not freed — active count unchanged, queue drained.
    expect(__getSemaphoreStateForTest()).toEqual({ active: MAX_CONCURRENT, queued: 0 });
  });

  it('returns active count to zero when releases exceed waiters', async () => {
    for (let i = 0; i < MAX_CONCURRENT; i++) await acquireSemaphore();
    for (let i = 0; i < MAX_CONCURRENT; i++) releaseSemaphore();
    expect(__getSemaphoreStateForTest()).toEqual({ active: 0, queued: 0 });
  });

  it('throws when the queue is full', async () => {
    for (let i = 0; i < MAX_CONCURRENT; i++) await acquireSemaphore();
    const pendings: Promise<unknown>[] = [];
    for (let i = 0; i < MAX_QUEUE; i++) {
      pendings.push(acquireSemaphore().catch(() => {}));
    }
    await Promise.resolve();
    expect(__getSemaphoreStateForTest().queued).toBe(MAX_QUEUE);

    await expect(acquireSemaphore()).rejects.toThrow(/Too many translation requests/);

    // Drain pendings to avoid dangling timers.
    for (let i = 0; i < MAX_QUEUE; i++) releaseSemaphore();
    await Promise.all(pendings);
  });

  it('does not leak an active slot when a queued waiter times out', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < MAX_CONCURRENT; i++) await acquireSemaphore();

    let rejected = false;
    const timedOut = acquireSemaphore().catch(() => { rejected = true; });
    expect(__getSemaphoreStateForTest().queued).toBe(1);

    // Advance past the queue timeout — the waiter rejects and leaves the queue.
    await vi.advanceTimersByTimeAsync(30001);
    await timedOut;
    expect(rejected).toBe(true);
    expect(__getSemaphoreStateForTest()).toEqual({ active: MAX_CONCURRENT, queued: 0 });

    // Releasing the three active slots must bring active back to exactly 0 —
    // the timed-out waiter must not have consumed a release.
    for (let i = 0; i < MAX_CONCURRENT; i++) releaseSemaphore();
    expect(__getSemaphoreStateForTest()).toEqual({ active: 0, queued: 0 });

    vi.useRealTimers();
  });

  it('serves a live waiter even after another waiter timed out', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < MAX_CONCURRENT; i++) await acquireSemaphore();

    const timedOut = acquireSemaphore().catch(() => 'timeout');
    await vi.advanceTimersByTimeAsync(30001);
    await timedOut;

    // A fresh waiter joins after the timeout.
    let served = false;
    const live = acquireSemaphore().then(() => { served = true; });
    expect(__getSemaphoreStateForTest().queued).toBe(1);

    releaseSemaphore();
    await live;
    expect(served).toBe(true);
    expect(__getSemaphoreStateForTest()).toEqual({ active: MAX_CONCURRENT, queued: 0 });

    vi.useRealTimers();
  });
});
