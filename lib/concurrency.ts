/**
 * Bounded-concurrency runner for parallel bulk operations (FR-8).
 *
 * Mirrors the codebase's pure-helper-at-seams pattern (`lib/rateLimiter.ts`,
 * `lib/subtitleRetry.ts`): dependency-free and fake-timer-friendly via an
 * injectable `delay` so Vitest's fake timers work without real wall-clock
 * waits. The "Test all keys" path uses this to run up to N connection tests
 * concurrently while still bounding the in-flight count against provider rate
 * limits.
 */

/** Default `delay` used when none is injected — a real setTimeout. */
const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RunWithConcurrencyOptions {
  /** Max items processed concurrently. Must be >= 1. */
  concurrency: number;
  /** Injectable delay for testing (fake-timer friendly). Defaults to setTimeout. */
  delay?: (ms: number) => Promise<void>;
}

/**
 * Run `worker` over `items` with a bounded concurrency cap. Results are
 * returned in the SAME ORDER as `items`, regardless of completion order
 * (callers that want live per-item updates should do so inside `worker`).
 *
 * `worker` receives the item and its index. A rejected worker yields a
 * rejected promise at the corresponding position (use `worker`'s try/catch
 * to convert failures into result values when partial-success is desired —
 * the bulk-test path does exactly this).
 *
 * @example
 *   const results = await runWithConcurrency(urls, fetchUrl, { concurrency: 4 });
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: RunWithConcurrencyOptions,
): Promise<R[]> {
  if (options.concurrency < 1) {
    throw new Error(`runWithConcurrency: concurrency must be >= 1 (got ${options.concurrency})`);
  }
  const cap = Math.min(options.concurrency, items.length);
  if (cap === 0) return [];

  const delay = options.delay ?? defaultDelay;
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runSlot(): Promise<void> {
    while (true) {
      const myIndex = nextIndex;
      nextIndex += 1;
      if (myIndex >= items.length) return;
      // Per predecessor learning: a small yield before each pull lets fake
      // timers interleave when tests advance time. No-op under real timers.
      await delay(0);
      results[myIndex] = await worker(items[myIndex], myIndex);
    }
  }

  const slots: Promise<void>[] = [];
  for (let i = 0; i < cap; i++) slots.push(runSlot());
  await Promise.all(slots);
  return results;
}
