/**
 * Tests for subtitleOverlay — font family CSS custom property,
 * display mode data attribute, and updateConfig integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SubtitleCue } from '@/types/subtitle';

// ============================================================================
// DOM setup — jsdom provides document/window but not ResizeObserver
// ============================================================================

const mockResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', mockResizeObserver);

import {
  initializeOverlay,
  updateConfig,
  resetOverlayState,
  getConfig,
  updateCues,
  isOverlayActive,
  cleanup,
} from '@/content/subtitleOverlay';

const MOCK_CUES = [
  { startTime: 0, endTime: 2, text: 'Xin chào', originalText: 'Hello' },
  { startTime: 2, endTime: 4, text: 'Thế giới', originalText: 'World' },
];

/**
 * Build a cue array spanning at least two chunks (chunk size = 25, see
 * lib/constants.ts SUBTITLE_CHUNK_SIZE). Each cue is 2s long.
 */
function buildMultiChunkCueArray(count: number): typeof MOCK_CUES {
  const cues = [];
  for (let i = 0; i < count; i++) {
    cues.push({
      startTime: i * 2,
      endTime: i * 2 + 2,
      text: `Line ${i} translated`,
      originalText: `Line ${i}`,
    });
  }
  return cues;
}

beforeEach(() => {
  resetOverlayState();
  document.body.innerHTML = '<video src="test.mp4"></video>';
});

describe('subtitleOverlay — fontFamily / displayMode wiring', () => {
  it('applies and updates font-family CSS var and data-display-mode', () => {
    initializeOverlay(MOCK_CUES, { fontFamily: 'Georgia, serif', displayMode: 'translation-only' });
    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-font-family')).toBe('Georgia, serif');
    expect(overlay.getAttribute('data-display-mode')).toBe('translation-only');

    updateConfig({ fontFamily: 'monospace', displayMode: 'bilingual' });
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-font-family')).toBe('monospace');
    expect(overlay.getAttribute('data-display-mode')).toBe('bilingual');

    updateConfig({ displayMode: 'translation-only' });
    expect(overlay.getAttribute('data-display-mode')).toBe('translation-only');
  });
});

describe('subtitleOverlay — positioning', () => {
  it('uses position: fixed and uses viewport coordinates without scroll offsets', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 50,
      width: 800,
      height: 600,
      bottom: 700,
      right: 850,
      x: 50,
      y: 100,
      toJSON: () => {}
    });

    initializeOverlay(MOCK_CUES);

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.style.position).toBe('fixed');
    expect(overlay.style.top).toBe('100px');
    expect(overlay.style.left).toBe('50px');
    expect(overlay.style.width).toBe('800px');
    expect(overlay.style.height).toBe('600px');
  });
});

describe('subtitleOverlay — fullscreen reparenting', () => {
  let video: HTMLVideoElement;
  let container: HTMLDivElement;

  beforeEach(() => {
    // Add popover mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLElement.prototype as any).showPopover = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLElement.prototype as any).hidePopover = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLElement.prototype as any).popover = null;

    container = document.createElement('div');
    video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);

    vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, width: 800, height: 600, bottom: 600, right: 800, x: 0, y: 0, toJSON: () => {}
    });
  });

  afterEach(() => {
    resetOverlayState();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).showPopover;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).hidePopover;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).popover;
    
    // Clean up fullscreenElement
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true
    });
    Object.defineProperty(document, 'webkitFullscreenElement', {
      value: null,
      configurable: true
    });
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      configurable: true
    });
  });

  it('uses popover while video is fullscreen and reverts on exit', () => {
    initializeOverlay(MOCK_CUES, {}, video);
    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;

    Object.defineProperty(document, 'fullscreenElement', {
      value: video,
      configurable: true,
    });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.getAttribute('popover')).toBe('manual');
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();

    container.appendChild(overlay);
    overlay.setAttribute('popover', 'manual');
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.hasAttribute('popover')).toBe(false);
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
  });
});

// ============================================================================
// Sub-project 5b: line-wrapping renders explicit line divs
// ============================================================================
describe('subtitleOverlay — line wrapping (sub-project 5b)', () => {
  /** Helper: initialize the overlay with cues and display the first cue. */
  function showCue(cues: Array<{ startTime: number; endTime: number; text: string; originalText?: string }>): void {
    const video = document.querySelector('video') as HTMLVideoElement;
    initializeOverlay(cues, {}, video);
    // Display is driven by video.timeupdate -> handleTimeUpdate -> findActiveCue.
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => cues[0].startTime + 0.1 });
    updateCues(cues);
    video.dispatchEvent(new Event('timeupdate'));
  }

  it('wraps long translations into ≤2 line divs and keeps short cues single-line', () => {
    document.body.innerHTML = '<video src="test.mp4"></video>';
    const longText =
      'This is a rather long translated subtitle line that should wrap into two separate line divs rather than one big block';
    showCue([{ startTime: 0, endTime: 8, text: longText, originalText: 'orig' }]);
    const longLines = document
      .querySelector('.anyllm-translate-subtitle-translated')!
      .querySelectorAll(':scope > div');
    expect(longLines.length).toBeGreaterThanOrEqual(1);
    expect(longLines.length).toBeLessThanOrEqual(2);
    longLines.forEach((d) => expect((d as HTMLElement).children.length).toBe(0));

    document.body.innerHTML = '<video src="test.mp4"></video>';
    showCue([{ startTime: 0, endTime: 4, text: 'Hi', originalText: 'Hola' }]);
    const shortLines = document
      .querySelector('.anyllm-translate-subtitle-translated')!
      .querySelectorAll(':scope > div');
    expect(shortLines.length).toBe(1);
    expect(shortLines[0]!.textContent).toBe('Hi');
    expect(
      document.querySelector('.anyllm-translate-subtitle-original')!.querySelectorAll(':scope > div')[0]!
        .textContent,
    ).toBe('Hola');
  });
});

// ============================================================================
// Playback-position chunk prioritization
// ============================================================================
describe('subtitleOverlay — playback-position chunk priority', () => {
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessage = vi.fn().mockResolvedValue(undefined);
    // jsdom has no chrome runtime — stub it so the overlay can send
    // PRIORITIZE_SUBTITLE_CHUNK during playback.
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });

  /** Advance playback to the time of cue `index` and fire timeupdate. */
  function playToCue(cues: typeof MOCK_CUES, index: number): void {
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => cues[index].startTime + 0.1,
    });
    video.dispatchEvent(new Event('timeupdate'));
  }

  it('sends PRIORITIZE_SUBTITLE_CHUNK for the active cue during playback', () => {
    document.body.innerHTML = '<video src="test.mp4"></video>';
    const cues = buildMultiChunkCueArray(30); // spans chunks 0 and 25+
    const video = document.querySelector('video') as HTMLVideoElement;

    initializeOverlay(cues, {}, video);
    // No message on init — only when a cue becomes active.
    expect(sendMessage).not.toHaveBeenCalled();

    // Play to cue 25 (start of the second chunk).
    playToCue(cues, 25);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PRIORITIZE_SUBTITLE_CHUNK',
        cueIndex: 25,
      }),
    );
  });

});

// ============================================================================
// Basic overlay lifecycle — initializeOverlay, updateConfig, getConfig,
// isOverlayActive, cleanup, resetOverlayState, updateCues, cue sync, video targeting
// (merged from tests/unit/subtitleOverlay.test.ts)
// ============================================================================
describe('content/subtitleOverlay — lifecycle', () => {
  beforeEach(() => {
    resetOverlayState();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('creates/configures overlay with video, skips without video, and cleans up', () => {
    initializeOverlay([{ startTime: 0, endTime: 2, text: 'Hello' }]);
    expect(document.querySelector('.anyllm-translate-subtitle-overlay')).toBeFalsy();

    const video = document.createElement('video');
    video.src = 'test.mp4';
    document.body.appendChild(video);
    initializeOverlay(
      [
        { startTime: 0, endTime: 2, text: 'Hello' },
        { startTime: 3, endTime: 5, text: 'World' },
      ],
      { fontSize: 24, position: 'top' },
    );
    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
    expect(overlay?.querySelector('.anyllm-translate-subtitle-original')).toBeTruthy();
    expect(overlay?.querySelector('.anyllm-translate-subtitle-translated')).toBeTruthy();
    expect(getConfig()).toMatchObject({ fontSize: 24, position: 'top' });
    expect(isOverlayActive()).toBe(true);

    updateConfig({ fontSize: 28, backgroundOpacity: 0.5 });
    expect(getConfig()).toMatchObject({ fontSize: 28, backgroundOpacity: 0.5 });

    cleanup();
    expect(document.querySelector('.anyllm-translate-subtitle-overlay')).toBeFalsy();
    expect(isOverlayActive()).toBe(false);

    initializeOverlay([{ startTime: 0, endTime: 2, text: 'Hello' }], { fontSize: 30 });
    resetOverlayState();
    expect(isOverlayActive()).toBe(false);
    expect(getConfig().fontSize).toBe(20);
  });

  it('syncs active cue by time, hides between cues, mutates in place, and targets videoNode', () => {
    const video = document.createElement('video');
    video.src = 'test.mp4';
    document.body.appendChild(video);

    const cues: SubtitleCue[] = [
      { startTime: 0, endTime: 2, text: 'First' },
      { startTime: 3, endTime: 5, text: 'Second' },
      { startTime: 6, endTime: 8, text: 'Third' },
    ];
    initializeOverlay(cues, {}, video);
    Object.defineProperty(video, 'currentTime', { value: 4, writable: true, configurable: true });
    video.dispatchEvent(new Event('timeupdate'));
    expect(
      document.querySelector('.anyllm-translate-subtitle-translated')?.textContent,
    ).toBe('Second');

    Object.defineProperty(video, 'currentTime', { value: 2.5, writable: true, configurable: true });
    video.dispatchEvent(new Event('timeupdate'));
    expect(
      document
        .querySelector('.anyllm-translate-subtitle-overlay')
        ?.classList.contains('anyllm-translate-subtitle-visible'),
    ).toBe(false);

    cleanup();
    const mutable: SubtitleCue[] = [
      { startTime: 0, endTime: 4, text: 'Hello', originalText: 'Hello' },
    ];
    initializeOverlay(mutable, {}, video);
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 1 });
    video.dispatchEvent(new Event('timeupdate'));
    expect(document.querySelector('.anyllm-translate-subtitle-translated')?.textContent).toBe(
      'Hello',
    );
    mutable[0]!.text = 'Xin chào';
    updateCues(mutable);
    expect(document.querySelector('.anyllm-translate-subtitle-translated')?.textContent).toBe(
      'Xin chào',
    );

    cleanup();
    document.body.innerHTML = '';
    const video1 = document.createElement('video');
    video1.id = 'first';
    document.body.appendChild(video1);
    const video2 = document.createElement('video');
    video2.id = 'second';
    document.body.appendChild(video2);
    initializeOverlay([{ startTime: 0, endTime: 2, text: 'Hello' }], undefined, video2);
    expect(isOverlayActive()).toBe(true);
    Object.defineProperty(video2, 'currentTime', { value: 1, writable: true });
    video2.dispatchEvent(new Event('timeupdate'));
    expect(document.querySelector('.anyllm-translate-subtitle-translated')?.textContent).toBe(
      'Hello',
    );
  });
});

