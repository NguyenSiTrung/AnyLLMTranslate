/**
 * Tests for subtitleOverlay — font family CSS custom property,
 * display mode data attribute, and updateConfig integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
} from '@/content/subtitleOverlay';

const MOCK_CUES = [
  { startTime: 0, endTime: 2, text: 'Xin chào', originalText: 'Hello' },
  { startTime: 2, endTime: 4, text: 'Thế giới', originalText: 'World' },
];

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

  it('defaults to system-ui when fontFamily not specified', () => {
    initializeOverlay(MOCK_CUES);

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    const fontFamily = overlay.style.getPropertyValue('--anyllm-subtitle-font-family');
    expect(fontFamily).toContain('system-ui');
  });

  it('updateConfig changes --anyllm-subtitle-font-family', () => {
    initializeOverlay(MOCK_CUES);
    updateConfig({ fontFamily: 'monospace' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.style.getPropertyValue('--anyllm-subtitle-font-family')).toBe('monospace');
  });

  it('getConfig returns updated fontFamily after updateConfig', () => {
    initializeOverlay(MOCK_CUES);
    updateConfig({ fontFamily: 'Georgia, serif' });
    expect(getConfig().fontFamily).toBe('Georgia, serif');
  });
});

describe('subtitleOverlay — displayMode wiring', () => {
  it('sets data-display-mode="bilingual" by default', () => {
    initializeOverlay(MOCK_CUES);

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.getAttribute('data-display-mode')).toBe('bilingual');
  });

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

  it('can toggle back from translation-only to bilingual', () => {
    initializeOverlay(MOCK_CUES, { displayMode: 'translation-only' });
    updateConfig({ displayMode: 'bilingual' });

    const overlay = document.querySelector('.anyllm-translate-subtitle-overlay') as HTMLElement;
    expect(overlay.getAttribute('data-display-mode')).toBe('bilingual');
  });

  it('getConfig returns updated displayMode after updateConfig', () => {
    initializeOverlay(MOCK_CUES);
    updateConfig({ displayMode: 'translation-only' });
    expect(getConfig().displayMode).toBe('translation-only');
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

  it('reparents overlay when a container is fullscreen', () => {
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
    expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
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
