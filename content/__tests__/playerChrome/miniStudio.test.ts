/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/content/playerChrome/prefs', () => ({
  loadMiniStudioSnapshot: vi.fn(async () => ({
    enabled: true,
    displayMode: 'bilingual',
    fontSize: 18,
    position: 'bottom',
    backgroundOpacity: 0.7,
    knobs: {},
    lists: [{ id: 'l1', name: 'Pack', entries: [], updatedAt: 1 }],
    activeListId: null,
    hostname: 'youtube.com',
    status: 'idle',
  })),
  setSubtitlesEnabled: vi.fn(async () => {}),
  setAppearance: vi.fn(async () => {}),
  setTabKnob: vi.fn(),
  hydrateLocalKnobs: vi.fn(),
  setActiveGlossaryList: vi.fn(async () => {}),
}));

vi.mock('@/lib/config', () => ({
  onSettingsChange: vi.fn(() => () => {}),
}));

import { attachMiniStudio } from '@/content/playerChrome/miniStudio';
import { PLAYER_CHROME_PANEL_CLASS } from '@/content/playerChrome/types';
import * as prefs from '@/content/playerChrome/prefs';

describe('attachMiniStudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('opens panel, wires enable, closes on Escape', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const onOpenChange = vi.fn();
    const studio = attachMiniStudio({ shadow, anchorButton: btn, onOpenChange });
    await studio.open();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.hidden).toBe(false);

    const enable = panel.querySelector('[data-action="enable"]') as HTMLInputElement;
    enable.checked = false;
    enable.dispatchEvent(new Event('change', { bubbles: true }));
    expect(prefs.setSubtitlesEnabled).toHaveBeenCalledWith(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(studio.isOpen()).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    studio.destroy();
  });

  it('“Open full Subtitle Studio” deep-links through the background to the subtitles section', async () => {
    const sendMessage = vi.fn(async () => ({ success: true }));
    const getURL = vi.fn((p: string) => `chrome-extension://abc/${p}`);
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: { getURL, sendMessage },
    } as never;

    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const studio = attachMiniStudio({ shadow, anchorButton: btn, onOpenChange: vi.fn() });
    await studio.open();

    const optionsBtn = shadow.querySelector(
      '[data-action="open-options"]',
    ) as HTMLButtonElement;
    expect(optionsBtn).toBeTruthy();
    optionsBtn.click();

    // Opens via the background (chrome.tabs.create) so the page actually renders,
    // deep-linked to the Subtitles section rather than the default General tab.
    expect(getURL).toHaveBeenCalledWith('options.html?section=subtitles');
    expect(sendMessage).toHaveBeenCalledWith({
      action: 'OPEN_OPTIONS',
      url: 'chrome-extension://abc/options.html?section=subtitles',
    });

    studio.destroy();
  });

  it('applies snapshot to widgets, status pill, preview, and button state', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const setButtonState = vi.fn();
    const studio = attachMiniStudio({
      shadow,
      anchorButton: btn,
      onOpenChange: vi.fn(),
      setButtonState,
    });
    await studio.open();

    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    const enable = panel.querySelector('[data-action="enable"]') as HTMLInputElement;
    expect(enable.checked).toBe(true);

    const displayChecked = panel.querySelector(
      'input[data-action="displayMode"]:checked',
    ) as HTMLInputElement;
    expect(displayChecked.value).toBe('bilingual');

    const font = panel.querySelector('[data-action="fontSize"]') as HTMLInputElement;
    expect(font.value).toBe('18');
    expect(panel.querySelector('[data-role="fontValue"]')?.textContent).toBe('18');

    const pill = panel.querySelector('[data-role="status"]') as HTMLElement;
    expect(pill.dataset.status).toBe('idle');
    expect(pill.textContent).toContain('Ready');

    const cue = panel.querySelector('[data-role="previewCue"]') as HTMLElement;
    expect(cue.style.fontSize).toBe('11px'); // round(18 * 0.6)

    expect(setButtonState).toHaveBeenCalledWith('enabled');
    studio.destroy();
  });

  it('slider input updates preview live but persists only on change', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const studio = attachMiniStudio({ shadow, anchorButton: btn, onOpenChange: vi.fn() });
    await studio.open();

    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    const font = panel.querySelector('[data-action="fontSize"]') as HTMLInputElement;
    vi.mocked(prefs.setAppearance).mockClear();

    font.value = '30';
    font.dispatchEvent(new Event('input', { bubbles: true }));
    expect(panel.querySelector('[data-role="fontValue"]')?.textContent).toBe('30');
    const cue = panel.querySelector('[data-role="previewCue"]') as HTMLElement;
    expect(cue.style.fontSize).toBe('18px'); // round(30 * 0.6)
    expect(prefs.setAppearance).not.toHaveBeenCalled();

    font.dispatchEvent(new Event('change', { bubbles: true }));
    expect(prefs.setAppearance).toHaveBeenCalledWith({ fontSize: 30 });
    studio.destroy();
  });

  it('closes via the header close button', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const onOpenChange = vi.fn();
    const studio = attachMiniStudio({ shadow, anchorButton: btn, onOpenChange });
    await studio.open();

    const closeBtn = shadow.querySelector('[data-action="close"]') as HTMLButtonElement;
    closeBtn.click();
    expect(studio.isOpen()).toBe(false);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    studio.destroy();
  });

  it('maps disabled snapshot to off button state and Off pill', async () => {
    vi.mocked(prefs.loadMiniStudioSnapshot).mockResolvedValueOnce({
      enabled: false,
      displayMode: 'bilingual',
      fontSize: 18,
      position: 'bottom',
      backgroundOpacity: 0.7,
      knobs: {},
      lists: [],
      activeListId: null,
      hostname: 'youtube.com',
      status: 'disabled',
    });
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    const btn = document.createElement('button');
    shadow.appendChild(btn);
    const setButtonState = vi.fn();
    const studio = attachMiniStudio({
      shadow,
      anchorButton: btn,
      onOpenChange: vi.fn(),
      setButtonState,
    });
    await studio.open();

    const panel = shadow.querySelector(`.${PLAYER_CHROME_PANEL_CLASS}`) as HTMLElement;
    const pill = panel.querySelector('[data-role="status"]') as HTMLElement;
    expect(pill.dataset.status).toBe('disabled');
    expect(pill.textContent).toContain('Off');
    expect(setButtonState).toHaveBeenCalledWith('off');
    studio.destroy();
  });
});
