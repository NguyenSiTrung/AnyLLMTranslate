/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  updateMiniProgress,
  hideMiniProgress,
  isMiniProgressVisible,
} from '@/content/miniProgress';

describe('miniProgress', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    hideMiniProgress();
  });
  afterEach(() => {
    hideMiniProgress();
  });

  it('shows translating count and Stop', () => {
    const onStop = vi.fn();
    updateMiniProgress({
      translated: 3,
      total: 10,
      status: 'translating',
      onStop,
    });
    expect(isMiniProgressVisible()).toBe(true);
    const bar = document.querySelector('[data-anyllm-role="mini-progress"]');
    expect(bar?.textContent).toContain('3/10');
    expect(bar?.querySelector('.anyllm-mini-progress-stop')?.textContent).toBe('Stop');
  });

  it('hides when idle or total is 0', () => {
    updateMiniProgress({
      translated: 1,
      total: 2,
      status: 'translating',
      onStop: () => {},
    });
    updateMiniProgress({
      translated: 0,
      total: 0,
      status: 'idle',
      onStop: () => {},
    });
    expect(isMiniProgressVisible()).toBe(false);
  });

  it('Stop invokes callback and hides', () => {
    const onStop = vi.fn();
    updateMiniProgress({
      translated: 1,
      total: 5,
      status: 'translating',
      onStop,
    });
    (document.querySelector('.anyllm-mini-progress-stop') as HTMLButtonElement).click();
    expect(onStop).toHaveBeenCalled();
    expect(isMiniProgressVisible()).toBe(false);
  });

  it('shows realigning batch progress and saved re-align cache hit label', () => {
    updateMiniProgress({
      translated: 2,
      total: 5,
      status: 'realigning',
      onStop: () => {},
    });
    expect(isMiniProgressVisible()).toBe(true);
    expect(
      document.querySelector('.anyllm-mini-progress-label')?.textContent,
    ).toBe('Re-aligning captions… 2/5');

    updateMiniProgress({
      translated: 1,
      total: 1,
      status: 'realign-cached',
      onStop: () => {},
    });
    expect(
      document.querySelector('.anyllm-mini-progress-label')?.textContent,
    ).toBe('Using saved re-align');
  });
});
