import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../background';

// Shared mock chrome state
const mockStorage: Record<string, unknown> = {};
const sessionStorageState: Record<string, unknown> = {};
const mockTabsCreate = vi.fn();
const mockTabsUpdate = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    session: {
      get: vi.fn(async (key: string) => ({ [key]: sessionStorageState[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStorageState, items);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    getURL: vi.fn((path: string) => `chrome-extension://abc/${path}`),
  },
  tabs: {
    create: mockTabsCreate,
    update: mockTabsUpdate,
    onRemoved: { addListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

function settingsWith(overrides: Record<string, unknown>) {
  mockStorage['anyllm-translate-settings'] = {
    provider: {
      preset: 'custom',
      baseUrl: 'http://x',
      apiKey: '',
      model: 'm',
      connectionStatus: 'success',
      requiresApiKey: false,
    },
    pdfSettings: { autoOpen: 'auto', openMode: 'new-tab', neverAutoOpenSites: [] },
    ...overrides,
  };
}

describe('handleMessage — PDF_DETECTED', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    for (const k of Object.keys(sessionStorageState)) delete sessionStorageState[k];
    mockTabsCreate.mockClear();
    mockTabsUpdate.mockClear();
  });

  it('opens viewer in a new tab when auto=on and provider ready', async () => {
    settingsWith({});
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'https://arxiv.org/pdf/2606.20543', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
    const arg = mockTabsCreate.mock.calls[0][0];
    expect(arg.url).toContain('pdf-viewer.html');
    expect(arg.url).toContain(encodeURIComponent('https://arxiv.org/pdf/2606.20543'));
  });

  it('opens same-tab when openMode=same-tab', async () => {
    settingsWith({
      pdfSettings: { autoOpen: 'auto', openMode: 'same-tab', neverAutoOpenSites: [] },
    });
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsUpdate).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ url: expect.stringContaining('pdf-viewer.html') }),
    );
    expect(mockTabsCreate).not.toHaveBeenCalled();
  });

  it('does NOT open when autoOpen is off', async () => {
    settingsWith({ pdfSettings: { autoOpen: 'off', openMode: 'new-tab', neverAutoOpenSites: [] } });
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsCreate).not.toHaveBeenCalled();
    expect(mockTabsUpdate).not.toHaveBeenCalled();
  });

  it('does NOT open the viewer for its own pages (loop guard)', async () => {
    settingsWith({});
    await handleMessage(
      {
        action: 'PDF_DETECTED',
        url: 'chrome-extension://abc/pdf-viewer.html?file=https://x/y.pdf',
        tabId: 9,
      },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsCreate).not.toHaveBeenCalled();
  });

  it('does NOT open twice for the same tab+url (dedupe via storage.session)', async () => {
    settingsWith({});
    const sender = { tab: { id: 9 } } as chrome.runtime.MessageSender;
    await handleMessage({ action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 9 }, sender);
    await handleMessage({ action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 9 }, sender);
    expect(mockTabsCreate).toHaveBeenCalledTimes(1);
  });

  it('respects neverAutoOpenSites', async () => {
    settingsWith({
      pdfSettings: { autoOpen: 'auto', openMode: 'new-tab', neverAutoOpenSites: ['blocked.com'] },
    });
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'https://blocked.com/p.pdf', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsCreate).not.toHaveBeenCalled();
  });

  it('does NOT open when provider is not ready', async () => {
    settingsWith({
      provider: {
        preset: 'custom',
        baseUrl: '',
        apiKey: '',
        model: '',
        connectionStatus: 'unknown',
        requiresApiKey: false,
      },
    });
    await handleMessage(
      { action: 'PDF_DETECTED', url: 'https://x/y.pdf', tabId: 9 },
      { tab: { id: 9 } } as chrome.runtime.MessageSender,
    );
    expect(mockTabsCreate).not.toHaveBeenCalled();
  });
});
