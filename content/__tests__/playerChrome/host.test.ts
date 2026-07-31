/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolvePlayerTargets, getFullscreenMountParent } from '@/content/playerChrome/host';
import { getPlayerChromeAdapter } from '@/content/playerChrome/adapters/registry';

describe('playerChrome host', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null,
    });
  });

  it('resolvePlayerTargets returns null video when none', () => {
    const r = resolvePlayerTargets(document);
    expect(r.video).toBeNull();
  });

  it('resolvePlayerTargets picks primary video and optional player root', () => {
    const v = document.createElement('video');
    Object.defineProperty(v, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(v, 'getBoundingClientRect', {
      value: () => ({
        width: 640,
        height: 360,
        top: 0,
        left: 0,
        bottom: 360,
        right: 640,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    document.body.appendChild(v);
    const r = resolvePlayerTargets(document);
    expect(r.video).toBe(v);
    expect(r.playerRoot === v || r.playerRoot instanceof HTMLElement).toBe(true);
  });

  it('getFullscreenMountParent returns container element not video', () => {
    const shell = document.createElement('div');
    document.body.appendChild(shell);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => shell,
    });
    expect(getFullscreenMountParent(document)).toBe(shell);
  });

  it('getPlayerChromeAdapter returns null for unknown hosts', () => {
    expect(getPlayerChromeAdapter('www.example.com')).toBeNull();
  });

  it('getPlayerChromeAdapter matches youtube', () => {
    expect(getPlayerChromeAdapter('www.youtube.com')?.id).toBe('youtube');
  });
});
