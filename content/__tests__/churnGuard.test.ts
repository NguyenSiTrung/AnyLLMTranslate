import { describe, expect, it } from 'vitest';
import { CHURN_WINDOW_MS, ChurnGuard } from '../churnGuard';

describe('ChurnGuard (FR-11)', () => {
  it('freezes on the 4th change within the window and stays frozen', () => {
    let now = 0;
    const guard = new ChurnGuard(() => now);
    const el = document.createElement('span');
    const results = [1, 2, 3, 4, 5].map(() => {
      now += 1_000;
      return guard.recordChange(el);
    });
    expect(results).toEqual([false, false, false, true, true]);
    expect(guard.isFrozen(el)).toBe(true);
  });

  it('only counts changes inside the sliding window', () => {
    let now = 0;
    const guard = new ChurnGuard(() => now);
    const el = document.createElement('span');
    for (let i = 0; i < 10; i++) {
      now += CHURN_WINDOW_MS / 3 + 1;
      expect(guard.recordChange(el)).toBe(false);
    }
    expect(guard.isFrozen(el)).toBe(false);
  });

  it('tracks elements independently and reset() clears freezes', () => {
    const guard = new ChurnGuard(() => 0);
    const ticker = document.createElement('span');
    const other = document.createElement('p');
    for (let i = 0; i < 4; i++) guard.recordChange(ticker);
    expect(guard.recordChange(other)).toBe(false);
    expect(guard.isFrozen(ticker)).toBe(true);
    expect(guard.isFrozen(other)).toBe(false);

    guard.reset();
    expect(guard.isFrozen(ticker)).toBe(false);
    expect(guard.recordChange(ticker)).toBe(false);
  });
});
