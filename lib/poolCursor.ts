/**
 * Round-robin cursor for the provider pool — PURE module.
 *
 * Advances a cursor across N pool slots, wrapping back to 0 after the last.
 * Selection is per logical request: each {@link next} call yields one slot
 * index and advances the cursor. Order is stable (insertion order) so rotation
 * is predictable across calls (FR-3).
 *
 * - Empty pool (0 slots) → `next()` returns `null` (no slot to dispatch).
 * - `peek()` returns the next index WITHOUT advancing — lets callers inspect
 *   what the next dispatch would hit.
 * - `setSlotCount(n)` live-reconfigures the wrap boundary; the absolute cursor
 *   position is preserved modulo the new count so a live `rebuild()` doesn't
 *   skew rotation.
 *
 * No `Date.now` coupling — this module is pure and fake-timer-friendly
 * (NFR-1). The cursor is just an integer; deterministic across runs.
 */

export interface PoolCursor {
  /** Return the next slot index and advance the cursor. Null if pool is empty. */
  next(): number | null;
  /** Return the next slot index WITHOUT advancing. Null if pool is empty. */
  peek(): number | null;
  /** Live-reconfigure the slot count (used by coordinator.rebuild). */
  setSlotCount(n: number): void;
  /** Reset the cursor back to slot 0. */
  reset(): void;
  /** Current slot count. */
  getSlotCount(): number;
}

export function createPoolCursor(slotCount: number): PoolCursor {
  let count = Math.max(0, Math.floor(slotCount));
  // Absolute position starts BEFORE index 0 so the first next() yields 0.
  let pos = -1;

  return {
    next(): number | null {
      if (count === 0) return null;
      pos = (pos + 1) % count;
      return pos;
    },
    peek(): number | null {
      if (count === 0) return null;
      return (pos + 1) % count;
    },
    setSlotCount(n: number): void {
      const newCount = Math.max(0, Math.floor(n));
      // Preserve relative position: take the absolute position modulo the new
      // count so rotation doesn't jump. We keep `pos` as-is and rely on the
      // modulo in next()/peek() to wrap correctly.
      if (newCount === 0) {
        pos = -1;
      } else if (pos < 0) {
        pos = -1;
      } else {
        pos = pos % newCount;
      }
      count = newCount;
    },
    reset(): void {
      pos = -1;
    },
    getSlotCount(): number {
      return count;
    },
  };
}
