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
    stylePreset: 'classic',
    styleOverrides: {},
    hasCustomStyle: false,
    knobs: {},
    lists: [],
    activeListId: null,
    hostname: 'example.com',
    status: 'idle',
  })),
  setSubtitlesEnabled: vi.fn(),
  setAppearance: vi.fn(),
  setStylePreset: vi.fn(),
  setTabKnob: vi.fn(),
  hydrateLocalKnobs: vi.fn(),
  setActiveGlossaryList: vi.fn(),
}));

import { startPlayerChrome } from '@/content/playerChrome';
import { PLAYER_CHROME_HOST_CLASS } from '@/content/playerChrome/types';
import { __setPlayerChromeAdaptersForTest } from '@/content/playerChrome/adapters/registry';
import type { PlayerChromeAdapter } from '@/content/playerChrome/adapters/types';

function mockVideoRect(video: HTMLVideoElement): void {
  Object.defineProperty(video, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: 100,
      left: 100,
      bottom: 460,
      right: 740,
      width: 640,
      height: 360,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }),
  });
}

function mockNodeRect(node: HTMLElement, r: Record<string, number>): void {
  Object.defineProperty(node, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: r.top,
      left: 0,
      bottom: r.bottom,
      right: r.right,
      width: r.width,
      height: r.height,
      x: 0,
      y: r.top,
      toJSON: () => ({}),
    }),
  });
}

describe('startPlayerChrome', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    __setPlayerChromeAdaptersForTest([]);
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

  it('mounts natively only into a genuine bottom control bar', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    mockVideoRect(video);
    document.body.appendChild(video);

    const bar = document.createElement('div');
    mockNodeRect(bar, { top: 400, bottom: 460, right: 740, width: 640, height: 60 });
    document.body.appendChild(bar);
    const adapter: PlayerChromeAdapter = {
      id: 'test',
      match: () => true,
      findNativeMount: () => bar,
    };
    __setPlayerChromeAdaptersForTest([adapter]);

    const stop = startPlayerChrome();
    vi.advanceTimersByTime(0);
    const nativeHost = bar.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`);
    expect(nativeHost).toBeTruthy();
    expect((nativeHost as HTMLElement).dataset.mountMode).toBe('native');
    stop();
  });

  it('falls back to floating when the native candidate is not in the bottom band', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    mockVideoRect(video);
    document.body.appendChild(video);

    // Player-root lookalike (spans the full video) — must be rejected.
    const lookalike = document.createElement('div');
    mockNodeRect(lookalike, { top: 100, bottom: 460, right: 740, width: 640, height: 360 });
    document.body.appendChild(lookalike);
    const adapter: PlayerChromeAdapter = {
      id: 'test',
      match: () => true,
      findNativeMount: () => lookalike,
    };
    __setPlayerChromeAdaptersForTest([adapter]);

    const stop = startPlayerChrome();
    vi.advanceTimersByTime(0);
    expect(lookalike.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeNull();
    const host = document.body.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`);
    expect(host).toBeTruthy();
    expect((host as HTMLElement).dataset.mountMode).toBe('floating');
    stop();
  });
});
