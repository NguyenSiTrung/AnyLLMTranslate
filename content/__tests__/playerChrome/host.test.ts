/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { isPlausibleControlBar } from '@/content/playerChrome/host';

function mockRect(el: HTMLElement, r: Record<string, number>): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: r.top,
      left: r.left ?? 0,
      bottom: r.bottom,
      right: r.right ?? 0,
      width: r.width,
      height: r.height,
      x: r.left ?? 0,
      y: r.top,
      toJSON: () => ({}),
    }),
  });
}

describe('isPlausibleControlBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('accepts a node in the video bottom band and rejects player-spanning or top-anchored nodes', () => {
    const video = document.createElement('video');
    mockRect(video, { top: 100, bottom: 460, right: 740, width: 640, height: 360 });
    document.body.appendChild(video);

    const bar = document.createElement('div');
    mockRect(bar, { top: 400, bottom: 460, right: 740, width: 640, height: 60 });
    document.body.appendChild(bar);
    expect(isPlausibleControlBar(bar, video)).toBe(true);

    // Player root spans the whole video — must NOT be treated as a control bar.
    const playerRoot = document.createElement('div');
    mockRect(playerRoot, { top: 100, bottom: 460, right: 740, width: 640, height: 360 });
    document.body.appendChild(playerRoot);
    expect(isPlausibleControlBar(playerRoot, video)).toBe(false);

    // A top-anchored lookalike (top bar) must not qualify either.
    const topBar = document.createElement('div');
    mockRect(topBar, { top: 100, bottom: 160, right: 740, width: 640, height: 60 });
    document.body.appendChild(topBar);
    expect(isPlausibleControlBar(topBar, video)).toBe(false);
  });

  it('rejects disconnected and zero-size nodes, and trusts selectors while video geometry is unknown', () => {
    const video = document.createElement('video');
    mockRect(video, { top: 100, bottom: 460, right: 740, width: 640, height: 360 });
    document.body.appendChild(video);

    const detached = document.createElement('div');
    mockRect(detached, { top: 400, bottom: 460, right: 740, width: 640, height: 60 });
    expect(isPlausibleControlBar(detached, video)).toBe(false);

    const hidden = document.createElement('div');
    mockRect(hidden, { top: 400, bottom: 460, right: 740, width: 0, height: 0 });
    document.body.appendChild(hidden);
    expect(isPlausibleControlBar(hidden, video)).toBe(false);

    // Player not laid out yet — can't judge geometry, keep the selector's verdict.
    const unknownVideo = document.createElement('video');
    mockRect(unknownVideo, { top: 0, bottom: 0, right: 0, width: 0, height: 0 });
    const bar = document.createElement('div');
    mockRect(bar, { top: 400, bottom: 460, right: 740, width: 640, height: 60 });
    document.body.appendChild(bar);
    expect(isPlausibleControlBar(bar, unknownVideo)).toBe(true);
  });
});
