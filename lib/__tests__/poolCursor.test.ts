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
