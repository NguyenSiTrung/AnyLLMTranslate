/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFloatingShell, createNativeShell } from '@/content/playerChrome/mountFloating';
import {
  PLAYER_CHROME_HOST_CLASS,
  PLAYER_CHROME_BUTTON_CLASS,
} from '@/content/playerChrome/types';
import { __setPlayerChromeAdaptersForTest } from '@/content/playerChrome/adapters/registry';

describe('player chrome mounts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __setPlayerChromeAdaptersForTest([]);
  });
  afterEach(() => {
    document.body.innerHTML = '';
    __setPlayerChromeAdaptersForTest([]);
  });

  it('mounts floating host with shadow button and toggles visibility', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const video = document.createElement('video');
    Object.defineProperty(video, 'getBoundingClientRect', {
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
    root.appendChild(video);
    const onToggle = vi.fn();
    const shell = createFloatingShell({ playerRoot: root, video, onToggle });
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeTruthy();
    const btn = shell.shadow.querySelector(`.${PLAYER_CHROME_BUTTON_CLASS}`) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    shell.setVisible(false);
    expect(
      shell.host.style.opacity === '0' ||
        shell.host.hidden ||
        shell.host.style.visibility === 'hidden',
    ).toBe(true);
    shell.setVisible(true);
    shell.destroy();
    expect(document.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeNull();
  });

  it('prefers native mount when adapter provides node', () => {
    const bar = document.createElement('div');
    bar.id = 'right-controls';
    document.body.appendChild(bar);
    const onToggle = vi.fn();
    const shell = createNativeShell({ mountNode: bar, onToggle });
    expect(bar.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeTruthy();
    expect(shell.getMountMode()).toBe('native');
    shell.button.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    shell.destroy();
    expect(bar.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeNull();
  });
});
