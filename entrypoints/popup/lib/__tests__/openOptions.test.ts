import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openOptionsWindow } from '../openOptions';

const BASE = 'chrome-extension://test/options.html';

function mockChrome() {
  const getAll = vi.fn<() => Promise<chrome.windows.Window[]>>();
  const update = vi.fn<(id: number, opts: unknown) => Promise<chrome.windows.Window>>();
  const create = vi.fn<(opts: unknown) => Promise<chrome.windows.Window>>();
  const tabsUpdate = vi.fn<(id: number, opts: unknown) => Promise<chrome.tabs.Tab>>();

  chrome.runtime.getURL = ((path: string) => `chrome-extension://test/${path}`) as typeof chrome.runtime.getURL;
  chrome.windows = {
    getAll,
    update,
    create,
  } as unknown as typeof chrome.windows;
  chrome.tabs = {
    update: tabsUpdate,
  } as unknown as typeof chrome.tabs;

  return { getAll, update, create, tabsUpdate };
}

describe('openOptionsWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new window when no settings window exists', async () => {
    const { getAll, create } = mockChrome();
    getAll.mockResolvedValue([]);

    await openOptionsWindow();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ url: BASE, type: 'popup', focused: true }),
    );
  });

  it('focuses the existing settings window instead of creating another', async () => {
    const { getAll, update, create, tabsUpdate } = mockChrome();
    getAll.mockResolvedValue([
      {
        id: 7,
        focused: false,
        tabs: [{ id: 11, url: `${BASE}?section=general` }],
      } as unknown as chrome.windows.Window,
    ]);

    await openOptionsWindow();

    expect(update).toHaveBeenCalledWith(7, { focused: true });
    expect(tabsUpdate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('navigates the existing tab when a deep link is requested', async () => {
    const { getAll, update, tabsUpdate, create } = mockChrome();
    getAll.mockResolvedValue([
      {
        id: 7,
        focused: false,
        tabs: [{ id: 11, url: BASE }],
      } as unknown as chrome.windows.Window,
    ]);

    await openOptionsWindow('?setup=1&step=connect');

    expect(update).toHaveBeenCalledWith(7, { focused: true });
    expect(tabsUpdate).toHaveBeenCalledWith(11, {
      url: `${BASE}?setup=1&step=connect`,
      active: true,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a new window when existing windows have no options tab', async () => {
    const { getAll, create } = mockChrome();
    getAll.mockResolvedValue([
      {
        id: 7,
        focused: true,
        tabs: [{ id: 11, url: 'https://example.com/' }],
      } as unknown as chrome.windows.Window,
    ]);

    await openOptionsWindow();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('falls back to creating a window when getAll rejects', async () => {
    const { getAll, create } = mockChrome();
    getAll.mockRejectedValue(new Error('boom'));

    await openOptionsWindow();

    expect(create).toHaveBeenCalledTimes(1);
  });
});
