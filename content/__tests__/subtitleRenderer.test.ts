import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubtitleCue } from '@/types/subtitle';

const {
  mockInitializeOverlay,
  mockUpdateCues,
  mockCleanup,
} = vi.hoisted(() => ({
  mockInitializeOverlay: vi.fn(),
  mockUpdateCues: vi.fn(),
  mockCleanup: vi.fn(),
}));

vi.mock('@/content/subtitleOverlay', () => ({
  initializeOverlay: mockInitializeOverlay,
  updateCues: mockUpdateCues,
  cleanup: mockCleanup,
}));

import { OverlayRenderer } from '@/content/subtitleRenderer';

describe('OverlayRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the exact video target and returns the overlay result', async () => {
    const video = document.createElement('video');
    const cues: SubtitleCue[] = [{ startTime: 0, endTime: 1, text: 'Hi' }];
    const config = { displayMode: 'bilingual' as const };
    mockInitializeOverlay.mockReturnValue(true);

    const renderer = new OverlayRenderer();
    const result = await renderer.initialize(cues, config, video);

    expect(result).toBe(true);
    expect(mockInitializeOverlay).toHaveBeenCalledWith(cues, config, video);
  });
});
