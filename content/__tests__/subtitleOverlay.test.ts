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

describe('subtitleOverlay — fontFamily wiring', () => {
  it('sets --anyllm-subtitle-font-family CSS custom property on overlay', () => {
    initializeOverlay(MOCK_CUES, { fontFamily: 'Georgia, serif' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-font-family')).toBe('Georgia, serif');
  });

  it('updateConfig changes --anyllm-subtitle-font-family', () => {
    initializeOverlay(MOCK_CUES);
    updateConfig({ fontFamily: 'monospace' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-font-family')).toBe('monospace');
  });
});

describe('subtitleOverlay — displayMode wiring', () => {
  it('sets data-display-mode="translation-only" when specified', () => {
    initializeOverlay(MOCK_CUES, { displayMode: 'translation-only' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.getAttribute('data-display-mode')).toBe('translation-only');
  });

  it('updateConfig changes data-display-mode attribute', () => {
    initializeOverlay(MOCK_CUES, { displayMode: 'bilingual' });
    updateConfig({ displayMode: 'translation-only' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.getAttribute('data-display-mode')).toBe('translation-only');
  });

  it('updateConfig changes data-display-mode attribute', () => {
    initializeOverlay(MOCK_CUES, { displayMode: 'bilingual' });
    updateConfig({ displayMode: 'translation-only' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
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

  it('uses popover when video itself is fullscreen', () => {
    initializeOverlay(MOCK_CUES, {}, video);
    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    
    // Simulate video fullscreen
    Object.defineProperty(document, 'fullscreenElement', {
      value: video,
      configurable: true
    });
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.getAttribute('popover')).toBe('manual');
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
  });

  it('reparents overlay when a container is fullscreen (when Popover API is NOT supported)', () => {
    // Disable popover to test fallback path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).popover;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).showPopover;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).hidePopover;

    initializeOverlay(MOCK_CUES, {}, video);
    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    
    // Set initial popover so we can check it gets removed
    overlay.setAttribute('popover', 'manual');

    // Simulate container fullscreen
    Object.defineProperty(document, 'fullscreenElement', {
      value: container,
      configurable: true
    });
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(overlay.parentElement).toBe(container);
    expect(overlay.hasAttribute('popover')).toBe(false);
  });

  it('uses position:absolute inside fullscreen container after reposition (when Popover API is NOT supported)', () => {
    // Disable popover to test fallback path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).popover;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).showPopover;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).hidePopover;

    initializeOverlay(MOCK_CUES, {}, video);
    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;

    // Install fake timers BEFORE triggering the event so the scheduled
    // setTimeout calls inside handleFullscreenChange are captured.
    vi.useFakeTimers();

    // Simulate container fullscreen
    Object.defineProperty(document, 'fullscreenElement', {
      value: container,
      configurable: true
    });
    document.dispatchEvent(new Event('fullscreenchange'));

    // Advance past both reposition timeouts (50ms + 350ms)
    vi.advanceTimersByTime(400);
    vi.useRealTimers();

    expect(overlay.style.position).toBe('absolute');
    expect(overlay.style.top).toBe('0px');
    expect(overlay.style.left).toBe('0px');
    expect(overlay.style.width).toBe('100%');
    expect(overlay.style.height).toBe('100%');
  });

  it('reparents overlay into HBO player container when it is fullscreen-sized without Fullscreen API state', () => {
    container.setAttribute('data-testid', 'playerContainer');
    Object.defineProperty(window, 'innerWidth', {
      value: 800,
      configurable: true
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 600,
      configurable: true
    });

    initializeOverlay(MOCK_CUES, {}, video);
    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;

    expect(document.fullscreenElement).toBeNull();
    expect(overlay.parentElement).toBe(container);
    expect(overlay.style.position).toBe('absolute');
    expect(overlay.style.width).toBe('100%');
    expect(overlay.style.height).toBe('100%');
  });

  it('uses webkitFullscreenElement as fullscreen container fallback', () => {
    initializeOverlay(MOCK_CUES, {}, video);
    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;

    Object.defineProperty(document, 'webkitFullscreenElement', {
      value: container,
      configurable: true
    });
    document.dispatchEvent(new Event('webkitfullscreenchange'));

    expect(overlay.parentElement).toBe(container);
    expect(overlay.hasAttribute('popover')).toBe(false);
  });

  it('reverts to body on exit fullscreen', () => {
    initializeOverlay(MOCK_CUES, {}, video);
    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    
    // Put it in container first
    container.appendChild(overlay);
    overlay.setAttribute('popover', 'manual');

    // Simulate exit fullscreen
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true
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

  it('renders a long translation as at most 2 line divs (not one wrapping block)', () => {
    document.body.innerHTML = '<video src="test.mp4"></video>';

    // A cue with a long translation (well over 42 chars) and a generous window
    // so requiredRead is small relative to duration -> wide CPL, but still 2 lines.
    const longText = 'This is a rather long translated subtitle line that should wrap into two separate line divs rather than one big block';
    const cues = [{ startTime: 0, endTime: 8, text: longText, originalText: 'orig' }];
    showCue(cues);

    const translatedEl = document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
    expect(translatedEl).not.toBeNull();
    const lineDivs = translatedEl.querySelectorAll(':scope > div');
    // Must render as wrapped line divs, capped at 2.
    expect(lineDivs.length).toBeGreaterThanOrEqual(1);
    expect(lineDivs.length).toBeLessThanOrEqual(2);
    // No innerHTML was used — each line div carries only text.
    lineDivs.forEach((d) => {
      expect((d as HTMLElement).children.length).toBe(0);
    });
  });

  it('renders a short cue as a single line div (no needless wrapping)', () => {
    document.body.innerHTML = '<video src="test.mp4"></video>';

    const cues = [{ startTime: 0, endTime: 4, text: 'Hi', originalText: 'Hola' }];
    showCue(cues);

    const translatedEl = document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
    const lineDivs = translatedEl.querySelectorAll(':scope > div');
    expect(lineDivs.length).toBe(1);
    expect(lineDivs[0].textContent).toBe('Hi');

    const originalEl = document.querySelector('.anyllm-translate-subtitle-original') as HTMLElement;
    const origDivs = originalEl.querySelectorAll(':scope > div');
    expect(origDivs.length).toBe(1);
    expect(origDivs[0].textContent).toBe('Hola');
  });

  it('never exceeds 2 line divs in either block (the 2+2 cap)', () => {
    document.body.innerHTML = '<video src="test.mp4"></video>';

    // Very long text in BOTH blocks, tight window -> narrow CPL -> max wrapping.
    const veryLong = 'word '.repeat(40).trim(); // 40 words
    const cues = [{
      startTime: 0, endTime: 1,
      text: veryLong, originalText: veryLong,
    }];
    showCue(cues);

    const translatedEl = document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
    const originalEl = document.querySelector('.anyllm-translate-subtitle-original') as HTMLElement;
    expect(translatedEl.querySelectorAll(':scope > div').length).toBeLessThanOrEqual(2);
    expect(originalEl.querySelectorAll(':scope > div').length).toBeLessThanOrEqual(2);
  });

  it('uses textContent per line (XSS-safe — no innerHTML)', () => {
    document.body.innerHTML = '<video src="test.mp4"></video>';

    // A cue whose text contains HTML-like content.
    const cues = [{
      startTime: 0, endTime: 4,
      text: '<b>not bold</b>', originalText: '<img src=x>',
    }];
    showCue(cues);

    const translatedEl = document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
    // textContent renders the string literally; no <b> element is created.
    expect(translatedEl.querySelectorAll('b').length).toBe(0);
    expect(translatedEl.textContent).toContain('<b>not bold</b>');
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

  it('dedupes messages within the same chunk (no repeat on every cue)', () => {
    document.body.innerHTML = '<video src="test.mp4"></video>';
    const cues = buildMultiChunkCueArray(30);
    const video = document.querySelector('video') as HTMLVideoElement;

    initializeOverlay(cues, {}, video);

    // First cue of the second chunk fires a message.
    playToCue(cues, 25);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // Subsequent cues within the same chunk must NOT re-fire.
    playToCue(cues, 26);
    playToCue(cues, 27);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // Crossing into the next chunk boundary re-enables sending. Here we cross
    // from chunk [25,50) — there's no third chunk in a 30-cue array, so jump
    // back to chunk 0 to verify a chunk-boundary crossing still sends.
    playToCue(cues, 0);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'PRIORITIZE_SUBTITLE_CHUNK',
        cueIndex: 0,
      }),
    );
  });

  it('fires priority on seek to a new chunk', () => {
    document.body.innerHTML = '<video src="test.mp4"></video>';
    const cues = buildMultiChunkCueArray(30);
    const video = document.querySelector('video') as HTMLVideoElement;

    initializeOverlay(cues, {}, video);

    // Seek into cue 25.
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => cues[25].startTime + 0.1,
    });
    video.dispatchEvent(new Event('seeked'));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PRIORITIZE_SUBTITLE_CHUNK',
        cueIndex: 25,
      }),
    );

    // Seeking within the same chunk is deduped.
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => cues[26].startTime + 0.1,
    });
    video.dispatchEvent(new Event('seeked'));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('resets the dedup tracker when a fresh overlay is initialized', () => {
    document.body.innerHTML = '<video src="test.mp4"></video>';
    const cues = buildMultiChunkCueArray(30);
    const video = document.querySelector('video') as HTMLVideoElement;

    initializeOverlay(cues, {}, video);
    playToCue(cues, 25);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // A new overlay/session must be able to re-prioritize the same chunk.
    initializeOverlay(cues, {}, video);
    playToCue(cues, 25);
    expect(sendMessage).toHaveBeenCalledTimes(2);
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

  describe('initializeOverlay', () => {
    it('creates overlay DOM structure when video element exists', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [
        { startTime: 0, endTime: 2, text: 'Hello' },
        { startTime: 3, endTime: 5, text: 'World' },
      ];

      initializeOverlay(cues);

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay?.querySelector('.anyllm-translate-subtitle-original')).toBeTruthy();
      expect(overlay?.querySelector('.anyllm-translate-subtitle-translated')).toBeTruthy();
    });

    it('does not create overlay when no video element exists', () => {
      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      expect(overlay).toBeFalsy();
    });

    it('positions overlay over video element', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      video.style.width = '640px';
      video.style.height = '360px';
      document.body.appendChild(video);

      vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
        width: 640,
        height: 360,
        top: 0,
        left: 0,
        right: 640,
        bottom: 360,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
      expect(overlay?.style.width).toBe('640px');
      expect(overlay?.style.height).toBe('360px');
    });

    it('applies custom configuration', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues, { fontSize: 24, position: 'top' });

      const config = getConfig();
      expect(config.fontSize).toBe(24);
      expect(config.position).toBe('top');
    });
  });

  describe('updateConfig', () => {
    it('updates overlay configuration', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      updateConfig({ fontSize: 28, backgroundOpacity: 0.5 });

      const config = getConfig();
      expect(config.fontSize).toBe(28);
      expect(config.backgroundOpacity).toBe(0.5);
    });

    it('updates position class on overlay', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      updateConfig({ position: 'top' });

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      expect(overlay?.classList.contains('anyllm-translate-position-top')).toBe(true);
      expect(overlay?.classList.contains('anyllm-translate-position-bottom')).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('returns current configuration', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues, { fontSize: 18 });

      const config = getConfig();
      expect(config.fontSize).toBe(18);
      expect(config.position).toBe('bottom');
      expect(config.backgroundOpacity).toBe(0.75);
    });
  });

  describe('isOverlayActive', () => {
    it('returns false before initialization', () => {
      expect(isOverlayActive()).toBe(false);
    });

    it('returns true after initialization', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      expect(isOverlayActive()).toBe(true);
    });

    it('returns false after cleanup', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);
      cleanup();

      expect(isOverlayActive()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes overlay from DOM', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      cleanup();

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      expect(overlay).toBeFalsy();
    });

    it('detaches event listeners', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      const removeEventListenerSpy = vi.spyOn(video, 'removeEventListener');
      cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('timeupdate', expect.any(Function));
    });
  });

  describe('resetOverlayState', () => {
    it('resets overlay to default state', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues, { fontSize: 30 });

      resetOverlayState();

      expect(isOverlayActive()).toBe(false);
      const config = getConfig();
      expect(config.fontSize).toBe(20);
    });
  });

  describe('updateCues', () => {
    it('refreshes displayed text when the same cue array is mutated in place', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [
        { startTime: 0, endTime: 4, text: 'Hello', originalText: 'Hello' },
      ];
      initializeOverlay(cues, {}, video);

      Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 1 });
      video.dispatchEvent(new Event('timeupdate'));

      const translatedEl = () =>
        document.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;
      expect(translatedEl()?.textContent).toBe('Hello');

      cues[0].text = 'Xin chào';
      updateCues(cues);

      expect(translatedEl()?.textContent).toBe('Xin chào');
    });
  });

  describe('cue synchronization logic', () => {
    it('finds active cue based on video time', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [
        { startTime: 0, endTime: 2, text: 'First' },
        { startTime: 3, endTime: 5, text: 'Second' },
        { startTime: 6, endTime: 8, text: 'Third' },
      ];
      initializeOverlay(cues);

      Object.defineProperty(video, 'currentTime', {
        value: 4,
        writable: true,
      });

      video.dispatchEvent(new Event('timeupdate'));

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      const translatedText = overlay?.querySelector('.anyllm-translate-subtitle-translated');
      expect(translatedText?.textContent).toBe('Second');
    });

    it('handles no active cue when time is between cues', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [
        { startTime: 0, endTime: 2, text: 'First' },
        { startTime: 5, endTime: 7, text: 'Second' },
      ];
      initializeOverlay(cues);

      Object.defineProperty(video, 'currentTime', {
        value: 3,
        writable: true,
      });

      video.dispatchEvent(new Event('timeupdate'));

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      expect(overlay?.classList.contains('anyllm-translate-subtitle-visible')).toBe(false);
    });
  });

  describe('video targeting', () => {
    it('uses provided videoNode instead of querying DOM', () => {
      const video1 = document.createElement('video');
      video1.src = 'video1.mp4';
      video1.id = 'first';
      document.body.appendChild(video1);

      const video2 = document.createElement('video');
      video2.src = 'video2.mp4';
      video2.id = 'second';
      document.body.appendChild(video2);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues, undefined, video2);

      expect(isOverlayActive()).toBe(true);

      Object.defineProperty(video2, 'currentTime', { value: 1, writable: true });
      video2.dispatchEvent(new Event('timeupdate'));

      const overlay = document.querySelector('.anyllm-translate-subtitle-overlay');
      const translatedText = overlay?.querySelector('.anyllm-translate-subtitle-translated');
      expect(translatedText?.textContent).toBe('Hello');
    });

    it('falls back to first video when no videoNode provided', () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      document.body.appendChild(video);

      const cues: SubtitleCue[] = [{ startTime: 0, endTime: 2, text: 'Hello' }];
      initializeOverlay(cues);

      expect(isOverlayActive()).toBe(true);
    });
  });
});
