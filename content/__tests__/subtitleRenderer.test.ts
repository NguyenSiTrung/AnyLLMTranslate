import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRenderer, OverlayRenderer, canRenderNatively } from '@/content/subtitleRenderer';
import { NativeTrackRenderer } from '@/content/nativeTrackRenderer';
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

describe('createRenderer (native currently disabled)', () => {
  // Native rendering is disabled in createRenderer because real players
  // (HBO Max) populate their own native textTracks, and synthetic tracks stack
  // on top — see the NOTE on createRenderer. These tests lock the safe default.

  it('always returns OverlayRenderer, even when native capability exists', () => {
    class FakeVTTCue {
      constructor(
        public s: number,
        public e: number,
        public t: string,
      ) {}
    }
    Object.defineProperty(globalThis, 'VTTCue', {
      configurable: true,
      value: FakeVTTCue,
      writable: true,
    });
    const fakeVideo = document.createElement('video');
    (fakeVideo as unknown as { addTextTrack: unknown }).addTextTrack = () => ({
      mode: 'disabled',
      cues: [],
      addCue() {},
      removeCue() {},
    });
    // Capability is correctly detected...
    expect(canRenderNatively(fakeVideo)).toBe(true);
    // ...but createRenderer still returns the overlay for now.
    expect(createRenderer(fakeVideo)).toBeInstanceOf(OverlayRenderer);
    expect(createRenderer(fakeVideo)).not.toBeInstanceOf(NativeTrackRenderer);
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
