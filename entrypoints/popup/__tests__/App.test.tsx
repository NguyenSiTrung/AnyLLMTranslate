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

describe('popup unsupported pages', () => {
  it('shows disabled feedback instead of translate action on browser pages', async () => {
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
    queryTabs.mockResolvedValue([{ id: 7, url: 'chrome://settings/' }]);

    render(<App />);

    expect(await screen.findByText(/this page can't be translated/i)).toBeInTheDocument();
    expect(screen.getByText(/browser or extension pages don't allow translation/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /translate page/i })).not.toBeInTheDocument();
  });

  it('prioritizes unsupported-page feedback over provider setup recovery', async () => {
    queryTabs.mockResolvedValue([{ id: 7, url: 'chrome://extensions/' }]);

    render(<App />);

    expect(await screen.findByText(/this page can't be translated/i)).toBeInTheDocument();
    expect(screen.queryByText(/provider not ready/i)).not.toBeInTheDocument();
  });

  it('shows PDF-translation-active message and category dropdown on the extension pdf-viewer page', async () => {
    storedSettings = {
      ...DEFAULT_SETTINGS,
      enableContextAwareTranslation: true,
      provider: {
        ...DEFAULT_SETTINGS.provider,
        baseUrl: 'http://localhost:11434/v1',
        model: 'gemma3:4b',
        connectionStatus: 'success',
      },
      onboarding: { completed: true, skipped: false, lastStep: 'done' },
    };
    queryTabs.mockResolvedValue([{ id: 7, url: 'chrome-extension://test/pdf-viewer.html?file=https://example.com/paper.pdf' }]);
    sendMessage.mockImplementation(async (_tabIdOrMsg: unknown, msg?: { action: string }) => {
      const action = (msg ?? (_tabIdOrMsg as { action: string }))?.action;
      if (action === 'getCategoryOverride') return { override: undefined };
      return undefined;
    });

    render(<App />);

    expect(await screen.findByText(/pdf translation is active/i)).toBeInTheDocument();
    expect(screen.queryByText(/this page can't be translated/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /translate page/i })).not.toBeInTheDocument();
    // Category dropdown should be visible with the PDF source hostname
    expect(screen.getByText(/category/i)).toBeInTheDocument();
  });
});

describe('popup PDF detection', () => {
  // Configure a connected provider so the translate action renders (the popup
  // gates most chrome.* calls behind provider readiness).
  const connectedSettings = {
    ...DEFAULT_SETTINGS,
    provider: {
      ...DEFAULT_SETTINGS.provider,
      baseUrl: 'http://localhost:11434/v1',
      model: 'gemma3:4b',
      connectionStatus: 'success' as const,
    },
    onboarding: { completed: true, skipped: false, lastStep: 'done' as const },
  };

  it('lights up "Open current PDF" when content script reports isPdf=true (arxiv extensionless URL)', async () => {
    storedSettings = connectedSettings;
    queryTabs.mockResolvedValue([{ id: 7, url: 'https://arxiv.org/pdf/2606.20543' }]);
    sendMessage.mockImplementation(async (_tabIdOrMsg: unknown, msg?: { action: string }) => {
      // tabs.sendMessage(tabId, msg) is called with two args; runtime.sendMessage(msg) with one.
      const action = (msg ?? (_tabIdOrMsg as { action: string }))?.action;
      if (action === 'getPageContentType') return { isPdf: true };
      if (action === 'getStatus') return { status: 'idle', translatedCount: 0, totalCount: 0 };
      if (action === 'getPageCategory') return null;
      return undefined;
    });

    render(<App />);

    expect(await screen.findByText(/open current pdf/i)).toBeInTheDocument();
  });

  it('does NOT show "Open current PDF" for an HTML tab', async () => {
    storedSettings = connectedSettings;
    queryTabs.mockResolvedValue([{ id: 7, url: 'https://example.com/article' }]);
    sendMessage.mockImplementation(async (_tabIdOrMsg: unknown, msg?: { action: string }) => {
      const action = (msg ?? (_tabIdOrMsg as { action: string }))?.action;
      if (action === 'getPageContentType') return { isPdf: false };
      if (action === 'getStatus') return { status: 'idle', translatedCount: 0, totalCount: 0 };
      return undefined;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/open current pdf/i)).not.toBeInTheDocument();
    });
    // The URL-paste affordance should be present instead.
    expect(screen.getByText(/open url/i)).toBeInTheDocument();
  });

  it('falls back to URL heuristic when content script is unreachable', async () => {
    storedSettings = connectedSettings;
    // Classic .pdf suffix → URL regex fallback should fire.
    queryTabs.mockResolvedValue([{ id: 7, url: 'https://example.com/paper.pdf' }]);
    sendMessage.mockRejectedValue(new Error('content script not loaded'));

    render(<App />);

    expect(await screen.findByText(/open current pdf/i)).toBeInTheDocument();
  });
});
