/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  createVisibilityState,
  reduceVisibility,
  PLAYER_CHROME_IDLE_HIDE_MS,
} from '@/content/playerChrome/visibility';

describe('reduceVisibility', () => {
  it('shows on activity and hides after idle timeout when panel closed', () => {
    let s = createVisibilityState(0);
    expect(s.visual).toBe('hidden');
    expect(s.destroyed).toBe(false);

    s = reduceVisibility(s, { type: 'activity', nowMs: 1000 });
    expect(s.visual).toBe('shown');
    expect(s.lastActivityMs).toBe(1000);

    s = reduceVisibility(s, {
      type: 'idleTick',
      nowMs: 1000 + PLAYER_CHROME_IDLE_HIDE_MS - 1,
    });
    expect(s.visual).toBe('shown');

    s = reduceVisibility(s, {
      type: 'idleTick',
      nowMs: 1000 + PLAYER_CHROME_IDLE_HIDE_MS,
    });
    expect(s.visual).toBe('hidden');
  });

  it('adapterVisible true shows; false hides when panel not forced', () => {
    let s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'adapterVisible', visible: true, nowMs: 50 });
    expect(s.visual).toBe('shown');
    s = reduceVisibility(s, { type: 'adapterVisible', visible: false, nowMs: 60 });
    expect(s.visual).toBe('hidden');
  });

  it('panel open forces shown and ignores idle hide', () => {
    let s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'activity', nowMs: 10 });
    s = reduceVisibility(s, { type: 'panelOpened' });
    expect(s.visual).toBe('shownForced');

    s = reduceVisibility(s, {
      type: 'idleTick',
      nowMs: 10 + PLAYER_CHROME_IDLE_HIDE_MS * 5,
    });
    expect(s.visual).toBe('shownForced');

    s = reduceVisibility(s, { type: 'adapterVisible', visible: false, nowMs: 9999 });
    expect(s.visual).toBe('shownForced');
  });

  it('panel close with pointer over player returns to shown and resets activity', () => {
    let s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'panelOpened' });
    s = reduceVisibility(s, {
      type: 'panelClosed',
      pointerOverPlayer: true,
      nowMs: 5000,
    });
    expect(s.visual).toBe('shown');
    expect(s.lastActivityMs).toBe(5000);
  });

  it('panel close without pointer hides', () => {
    let s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'panelOpened' });
    s = reduceVisibility(s, {
      type: 'panelClosed',
      pointerOverPlayer: false,
      nowMs: 5000,
    });
    expect(s.visual).toBe('hidden');
  });

  it('teardown marks destroyed and stays destroyed', () => {
    let s = createVisibilityState(0);
    s = reduceVisibility(s, { type: 'activity', nowMs: 1 });
    s = reduceVisibility(s, { type: 'teardown' });
    expect(s.destroyed).toBe(true);
    s = reduceVisibility(s, { type: 'activity', nowMs: 2 });
    expect(s.destroyed).toBe(true);
    expect(s.visual).toBe('hidden');
  });
});
