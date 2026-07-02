import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRenderer, OverlayRenderer } from '@/content/subtitleRenderer';
import type { SubtitleCue } from '@/types/subtitle';

// Mock the overlay module so the test doesn't touch the real overlay DOM logic.
vi.mock('@/content/subtitleOverlay', () => ({
  initializeOverlay: vi.fn(),
  updateCues: vi.fn(),
  cleanup: vi.fn(),
  getOverlayTextContainer: vi.fn(() => null),
}));

describe('createRenderer (overlay fallback)', () => {
  beforeEach(() => {
    // No VTTCue / addTextTrack in this environment → capability check fails → overlay.
    Object.defineProperty(globalThis, 'VTTCue', { configurable: true, value: undefined });
    Object.defineProperty(HTMLElement.prototype, 'addTextTrack', {
      configurable: true,
      value: undefined,
    });
  });

  it('returns OverlayRenderer when VTTCue/addTextTrack unavailable', () => {
    const fakeVideo = document.createElement('video');
    const renderer = createRenderer(fakeVideo);
    expect(renderer).toBeInstanceOf(OverlayRenderer);
  });
});

describe('OverlayRenderer', () => {
  it('delegates initialize/updateCues/destroy to the overlay module', async () => {
    const { initializeOverlay, updateCues, cleanup } = await import('@/content/subtitleOverlay');
    const renderer = new OverlayRenderer();
    const cues: SubtitleCue[] = [{ startTime: 1, endTime: 2, text: 'hi' }];
    await renderer.initialize(cues, {}, document.createElement('video'));
    renderer.updateCues(cues);
    renderer.destroy();
    expect(initializeOverlay).toHaveBeenCalled();
    expect(updateCues).toHaveBeenCalledWith(cues);
    expect(cleanup).toHaveBeenCalled();
  });
});
