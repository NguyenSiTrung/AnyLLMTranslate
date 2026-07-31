/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/inject/subtitleHandlers/registry', () => ({
  detectCurrentHandler: () => ({ platform: 'generic' }),
}));

vi.mock('@/content/playerChrome/prefs', () => ({
  loadMiniStudioSnapshot: vi.fn(async () => ({
    enabled: true,
    displayMode: 'bilingual',
    fontSize: 18,
    position: 'bottom',
    backgroundOpacity: 0.7,
    knobs: {},
    lists: [],
    activeListId: null,
    hostname: 'example.com',
    status: 'idle',
  })),
  setSubtitlesEnabled: vi.fn(),
  setAppearance: vi.fn(),
  setTabKnob: vi.fn(),
  hydrateLocalKnobs: vi.fn(),
  setActiveGlossaryList: vi.fn(),
}));

import { startPlayerChrome } from '@/content/playerChrome';
import { PLAYER_CHROME_HOST_CLASS } from '@/content/playerChrome/types';

describe('startPlayerChrome', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('mounts when video present and cleans up', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        left: 0,
        bottom: 360,
        right: 640,
        width: 640,
        height: 360,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    document.body.appendChild(video);
    const stop = startPlayerChrome();
    vi.advanceTimersByTime(0);
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeTruthy();
    stop();
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeNull();
  });
});
