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

  it('loads statuses when enabled', async () => {
    const { result } = renderHook(() => usePoolKeyStatuses(true));
    await flushMicrotasks();
    expect(result.current.statuses?.k1).toBeDefined();
    expect(result.current.liveAvailable).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'GET_POOL_KEY_STATUSES',
    });
  });

  it('does not poll when disabled', async () => {
    vi.useFakeTimers();
    renderHook(() => usePoolKeyStatuses(false));
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('marks live unavailable on failure response', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: false,
      error: 'nope',
    });

    const { result } = renderHook(() => usePoolKeyStatuses(true));
    await flushMicrotasks();
    expect(result.current.liveAvailable).toBe(false);
  });
});
