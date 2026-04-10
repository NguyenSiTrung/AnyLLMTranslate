/**
 * Performance utilities — requestAnimationFrame batching and timing helpers.
 * Used to batch DOM writes and measure performance.
 */

/** Pending DOM write operations queue */
let pendingWrites: (() => void)[] = [];
let rafId: number | null = null;

/**
 * Schedule a DOM write in the next animation frame.
 * Batches multiple writes into a single frame.
 */
export function scheduleDomWrite(writeFn: () => void): void {
  pendingWrites.push(writeFn);

  if (rafId === null) {
    rafId = requestAnimationFrame(flushDomWrites);
  }
}

/** Flush all pending DOM writes */
function flushDomWrites(): void {
  rafId = null;
  const writes = pendingWrites;
  pendingWrites = [];

  for (const write of writes) {
    write();
  }
}

/** Cancel all pending DOM writes */
export function cancelPendingWrites(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pendingWrites = [];
}

/** Get count of pending writes (for testing) */
export function getPendingWriteCount(): number {
  return pendingWrites.length;
}

/**
 * Debounce a function call.
 * Returns a new function that will only execute after `delay` ms of inactivity.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
}

/**
 * Throttle a function call.
 * Ensures the function is called at most once every `interval` ms.
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  interval: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= interval) {
      lastCall = now;
      fn(...args);
    }
  };
}

/**
 * Measure execution time of an async function.
 * Returns {result, durationMs}.
 */
export async function measureAsync<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}
