/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { attachMiniStudio } from '@/content/playerChrome/miniStudio';
import { PLAYER_CHROME_PANEL_CLASS } from '@/content/playerChrome/types';
import * as prefs from '@/content/playerChrome/prefs';

describe('attachMiniStudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
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
});
