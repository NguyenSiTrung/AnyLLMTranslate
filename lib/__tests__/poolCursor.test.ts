import { describe, it, expect } from 'vitest';
import { createPoolCursor } from '../poolCursor';

describe('createPoolCursor', () => {
  describe('empty pool', () => {
    it('next() returns null when the pool has zero slots', () => {
      const cursor = createPoolCursor(0);
      expect(cursor.next()).toBeNull();
    });

    it('next() returns null after a reset on an empty pool', () => {
      const cursor = createPoolCursor(0);
      cursor.reset();
      expect(cursor.next()).toBeNull();
    });
  });

  describe('single slot', () => {
    it('always returns index 0', () => {
      const cursor = createPoolCursor(1);
      expect(cursor.next()).toBe(0);
      expect(cursor.next()).toBe(0);
      expect(cursor.next()).toBe(0);
    });
  });

  describe('round-robin advancement', () => {
    it('advances across slots 0,1,2 and wraps back to 0', () => {
      const cursor = createPoolCursor(3);
      expect(cursor.next()).toBe(0);
      expect(cursor.next()).toBe(1);
      expect(cursor.next()).toBe(2);
      expect(cursor.next()).toBe(0); // wraps
      expect(cursor.next()).toBe(1);
    });

    it('respects stable insertion order across many cycles', () => {
      const cursor = createPoolCursor(4);
      const sequence: number[] = [];
      for (let i = 0; i < 10; i++) {
        const idx = cursor.next();
        if (idx !== null) sequence.push(idx);
      }
      // 0,1,2,3,0,1,2,3,0,1
      expect(sequence).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
    });
  });

  describe('reset', () => {
    it('returns the cursor to index 0', () => {
      const cursor = createPoolCursor(3);
      cursor.next(); // 0
      cursor.next(); // 1
      cursor.reset();
      expect(cursor.next()).toBe(0);
    });
  });

  describe('resize (live reconfigure)', () => {
    it('setSlotCount changes the wrap boundary without losing position when shrinking', () => {
      const cursor = createPoolCursor(4);
      cursor.next(); // 0
      cursor.next(); // 1
      cursor.setSlotCount(2);
      // cursor at index 1, slot count 2 → next is (1+1)%2 = 0
      expect(cursor.next()).toBe(0);
      expect(cursor.next()).toBe(1);
    });

    it('setSlotCount handles growing', () => {
      const cursor = createPoolCursor(2);
      cursor.next(); // 0
      cursor.next(); // 1
      cursor.setSlotCount(4);
      // cursor at 1, next is (1+1)%4 = 2
      expect(cursor.next()).toBe(2);
    });

    it('setSlotCount to 0 makes next() return null', () => {
      const cursor = createPoolCursor(2);
      cursor.setSlotCount(0);
      expect(cursor.next()).toBeNull();
    });

    // FR-8 #10: cursor fairness on a LIVE slot-count change. The cursor
    // preserves relative position via `pos % newCount`, so after a resize the
    // rotation continues to cover every slot fairly over a full cycle (no slot
    // is permanently starved, no slot is double-hit within one post-resize
    // cycle). The single request immediately after a resize MAY land on a
    // different absolute index than it would have pre-resize — that is the
    // documented, accepted trade-off (a one-request skew is preferable to the
    // complexity of a clamped-position scheme).
    it('FR-8 #10: after a live resize, a full cycle still covers every slot once', () => {
      const cursor = createPoolCursor(3);
      cursor.next(); // 0
      cursor.next(); // 1
      // Live resize: 3 → 2 slots (a key was disabled mid-rotation).
      cursor.setSlotCount(2);
      const seen: number[] = [];
      for (let i = 0; i < 2; i++) seen.push(cursor.next() as number);
      // A full cycle covers both remaining slots exactly once (fair), though
      // the starting index may differ from the pre-resize sequence.
      expect(seen.sort()).toEqual([0, 1]);
    });

    it('FR-8 #10: after growing, a full cycle covers every slot once', () => {
      const cursor = createPoolCursor(2);
      cursor.next(); // 0
      cursor.setSlotCount(4); // grew by 2 slots
      const seen: number[] = [];
      for (let i = 0; i < 4; i++) seen.push(cursor.next() as number);
      expect(seen.sort()).toEqual([0, 1, 2, 3]);
    });
  });

  describe('peek', () => {
    it('returns the next index without advancing', () => {
      const cursor = createPoolCursor(3);
      expect(cursor.peek()).toBe(0);
      expect(cursor.peek()).toBe(0); // did not advance
      expect(cursor.next()).toBe(0); // still 0
      expect(cursor.peek()).toBe(1);
    });

    it('peek returns null on empty pool', () => {
      const cursor = createPoolCursor(0);
      expect(cursor.peek()).toBeNull();
    });
  });
});
