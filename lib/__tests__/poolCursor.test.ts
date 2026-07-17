import { describe, it, expect } from 'vitest';
import { createPoolCursor } from '../poolCursor';

describe('createPoolCursor', () => {
  it('empty/single, round-robin, resize fairness, and peek', () => {
    const empty = createPoolCursor(0);
    expect(empty.next()).toBeNull();
    empty.reset();
    expect(empty.next()).toBeNull();
    expect(empty.peek()).toBeNull();

    const single = createPoolCursor(1);
    expect(single.next()).toBe(0);
    expect(single.next()).toBe(0);

    const cursor = createPoolCursor(3);
    expect([cursor.next(), cursor.next(), cursor.next(), cursor.next()]).toEqual([0, 1, 2, 0]);
    cursor.reset();
    expect(cursor.next()).toBe(0);

    const four = createPoolCursor(4);
    const sequence: number[] = [];
    for (let i = 0; i < 10; i++) {
      const idx = four.next();
      if (idx !== null) sequence.push(idx);
    }
    expect(sequence).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);

    const shrink = createPoolCursor(4);
    shrink.next();
    shrink.next();
    shrink.setSlotCount(2);
    expect(shrink.next()).toBe(0);
    expect(shrink.next()).toBe(1);

    const grow = createPoolCursor(2);
    grow.next();
    grow.next();
    grow.setSlotCount(4);
    expect(grow.next()).toBe(2);

    const zero = createPoolCursor(2);
    zero.setSlotCount(0);
    expect(zero.next()).toBeNull();

    const fairShrink = createPoolCursor(3);
    fairShrink.next();
    fairShrink.next();
    fairShrink.setSlotCount(2);
    const seenShrink: number[] = [];
    for (let i = 0; i < 2; i++) seenShrink.push(fairShrink.next() as number);
    expect(seenShrink.sort()).toEqual([0, 1]);

    const fairGrow = createPoolCursor(2);
    fairGrow.next();
    fairGrow.setSlotCount(4);
    const seenGrow: number[] = [];
    for (let i = 0; i < 4; i++) seenGrow.push(fairGrow.next() as number);
    expect(seenGrow.sort()).toEqual([0, 1, 2, 3]);

    const peek = createPoolCursor(3);
    expect(peek.peek()).toBe(0);
    expect(peek.peek()).toBe(0);
    expect(peek.next()).toBe(0);
    expect(peek.peek()).toBe(1);
  });
});
