import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { DEFAULT_SETTINGS } from '@/types/config';

const sendMessage = vi.fn();
const createWindow = vi.fn();
const queryTabs = vi.fn();
const addStorageListener = vi.fn();
const removeStorageListener = vi.fn();
const addRuntimeListener = vi.fn();
const removeRuntimeListener = vi.fn();

let storedSettings = DEFAULT_SETTINGS;

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(async () => storedSettings),
  updateSettings: vi.fn(async (partial) => {
    storedSettings = { ...storedSettings, ...partial };
    return storedSettings;
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  storedSettings = DEFAULT_SETTINGS;
  queryTabs.mockResolvedValue([{ id: 7, url: 'https://example.com/article' }]);
  sendMessage.mockResolvedValue({ status: 'idle', translatedCount: 0, totalCount: 0 });
  global.chrome = {
    tabs: {
      query: queryTabs,
      sendMessage,
    },
    windows: {
      create: createWindow,
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage,
      onMessage: {
        addListener: addRuntimeListener,
        removeListener: removeRuntimeListener,
      },
    },
    storage: {
      onChanged: {
        addListener: addStorageListener,
        removeListener: removeStorageListener,
      },
    },
  } as unknown as typeof chrome;
});

describe('popup provider recovery', () => {
  it('shows setup recovery instead of translate action when provider is empty', async () => {
    render(<App />);

    expect(await screen.findByText(/provider not ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set up provider/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /translate page/i })).not.toBeInTheDocument();
  });

  it('shows normal translate action when provider is connected', async () => {
    storedSettings = {
      ...DEFAULT_SETTINGS,
      provider: {
        ...DEFAULT_SETTINGS.provider,
        baseUrl: 'http://localhost:11434/v1',
        model: 'gemma3:4b',
        connectionStatus: 'success',
      },
      onboarding: { completed: true, skipped: false, lastStep: 'done' },
    };

    render(<App />);

    expect(await screen.findByRole('button', { name: /translate page/i })).toBeInTheDocument();
    expect(screen.queryByText(/provider not ready/i)).not.toBeInTheDocument();
  });

  it('opens options setup flow from recovery CTA', async () => {
    render(<App />);

    const setupButton = await screen.findByRole('button', { name: /set up provider/i });
    setupButton.click();

    await waitFor(() => {
      expect(createWindow).toHaveBeenCalledWith({
        url: 'chrome-extension://test/options.html?setup=1',
        type: 'popup',
        width: 1200,
        height: 800,
        focused: true,
      });
    });
  });
});
