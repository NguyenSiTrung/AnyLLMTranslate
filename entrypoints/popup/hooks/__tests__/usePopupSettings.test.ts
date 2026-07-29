import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { usePopupSettings } from '../usePopupSettings';
import * as configLib from '@/lib/config';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

describe('usePopupSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock chrome.storage.onChanged
    global.chrome = {
      storage: {
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as unknown as typeof chrome;
  });

  it('starts with isLoading=true and sets isLoading=false after loadSettings completes', async () => {
    let resolveLoadSettings: (val: unknown) => void = () => {};
    const loadPromise = new Promise((resolve) => {
      resolveLoadSettings = resolve;
    });
    vi.mocked(configLib.loadSettings).mockReturnValue(
      loadPromise as ReturnType<typeof configLib.loadSettings>,
    );

    const { result } = renderHook(() => usePopupSettings());

    // Initially loading is true
    expect(result.current.isLoading).toBe(true);

    // Resolve loadSettings
    resolveLoadSettings({
      provider: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});
