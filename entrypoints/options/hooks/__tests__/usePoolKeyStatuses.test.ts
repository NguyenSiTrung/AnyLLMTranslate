import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePoolKeyStatuses } from '../usePoolKeyStatuses';

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('usePoolKeyStatuses', () => {
  beforeEach(() => {
    vi.mocked(chrome.runtime.sendMessage).mockReset();
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
      statuses: {
        k1: {
          keyId: 'k1',
          providerId: 'p1',
          open: false,
          openUntil: 0,
          credentialInvalid: false,
          disabled: false,
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads when enabled, skips when disabled, marks unavailable on failure', async () => {
    const { result } = renderHook(() => usePoolKeyStatuses(true));
    await flushMicrotasks();
    expect(result.current.statuses?.k1).toBeDefined();
    expect(result.current.liveAvailable).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'GET_POOL_KEY_STATUSES',
    });

    vi.mocked(chrome.runtime.sendMessage).mockClear();
    vi.useFakeTimers();
    renderHook(() => usePoolKeyStatuses(false));
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    vi.useRealTimers();

    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: false,
      error: 'nope',
    });
    const { result: failed } = renderHook(() => usePoolKeyStatuses(true));
    await flushMicrotasks();
    expect(failed.current.liveAvailable).toBe(false);
  });
});
