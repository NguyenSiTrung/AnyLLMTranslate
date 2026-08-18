// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSpaNavigationWatcher } from '@/content/spaNavigationWatcher';

describe('startSpaNavigationWatcher', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
  });

  it('detects a history URL change that bypasses the watcher wrapper', () => {
    vi.useFakeTimers();
    const onNavigation = vi.fn();
    const nativePushState = window.history.pushState;
    const cleanup = startSpaNavigationWatcher(onNavigation, { pollIntervalMs: 100 });

    nativePushState.call(window.history, {}, '', '/courses/example/lesson/next');
    expect(onNavigation).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(onNavigation).toHaveBeenCalledWith(window.location.href);
    cleanup();
  });
});
