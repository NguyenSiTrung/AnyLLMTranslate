/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFloatingShell, createNativeShell } from '@/content/playerChrome/mountFloating';
import { PLAYER_CHROME_HOST_CLASS, PLAYER_CHROME_BUTTON_CLASS } from '@/content/playerChrome/types';
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

  it('mounts floating host with shadow button and toggles visibility; prefers native mount when the adapter provides a node', () => {
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

    // Native mount: adapter-provided node hosts the chrome.
    const bar = document.createElement('div');
    bar.id = 'right-controls';
    document.body.appendChild(bar);
    const onToggle2 = vi.fn();
    const native = createNativeShell({ mountNode: bar, onToggle: onToggle2 });
    expect(bar.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeTruthy();
    expect(native.getMountMode()).toBe('native');
    native.button.click();
    expect(onToggle2).toHaveBeenCalledTimes(1);
    native.destroy();
    expect(bar.querySelector(`.${PLAYER_CHROME_HOST_CLASS}`)).toBeNull();
  });

  it('anchors bottom-right inside the video above the control band, tracks scroll, and never strands at the viewport origin', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const video = document.createElement('video');
    const mockRect = (r: Record<string, number>): void => {
      Object.defineProperty(video, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: r.top,
          left: 100,
          bottom: r.bottom,
          right: r.right,
          width: r.width,
          height: r.height,
          x: 100,
          y: r.top,
          toJSON: () => ({}),
        }),
      });
    };
    mockRect({ top: 100, bottom: 460, right: 740, width: 640, height: 360 });
    root.appendChild(video);
    const shell = createFloatingShell({ playerRoot: root, video, onToggle: vi.fn() });

    // Bottom-right INSIDE the video: bottom edge 56px above the video bottom
    // (clear of the native control band), 12px from the right edge.
    expect(shell.host.style.bottom).toBe(`${window.innerHeight - 460 + 56}px`);
    expect(shell.host.style.right).toBe(`${window.innerWidth - 740 + 12}px`);

    // Scroll tracking keeps the fixed host glued to the video.
    mockRect({ top: 60, bottom: 420, right: 740, width: 640, height: 360 });
    window.dispatchEvent(new Event('scroll'));
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    expect(shell.host.style.bottom).toBe(`${window.innerHeight - 420 + 56}px`);

    // Invalid geometry (player mounting/hidden): off-screen, never top:0;left:0.
    mockRect({ top: 0, bottom: 0, right: 0, width: 0, height: 0 });
    shell.reposition();
    expect(shell.host.style.top).toBe('-10000px');
    expect(shell.host.style.left).toBe('-10000px');
    expect(shell.host.style.bottom).toBe('auto');
    expect(shell.host.style.right).toBe('auto');

    shell.destroy();
  });
});
