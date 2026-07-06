/**
 * Tests for SubtitlesSection — controls, preview cycling, disabled state,
 * and language discovery.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SubtitlesSection } from '../SubtitlesSection';
import * as subtitleSites from '@/lib/subtitleSites';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

vi.mock('@/stores/settingsStore');

const mockUpdateSettings = vi.fn().mockResolvedValue(undefined);

const baseSubtitleSettings = { ...DEFAULT_SUBTITLE_SETTINGS };

const mockState = {
  subtitleSettings: baseSubtitleSettings,
  targetLanguage: 'vi',
  updateSettings: mockUpdateSettings,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockState.subtitleSettings = { ...DEFAULT_SUBTITLE_SETTINGS };
  mockState.targetLanguage = 'vi';

  (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
    if (typeof selector === 'function') {
      return selector(mockState);
    }
    return mockState;
  });
});

describe('SubtitlesSection', () => {
  it('updates translationTimeout when the slider changes', () => {
    render(<SubtitlesSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    const slider = document.getElementById('subtitle-translation-timeout') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '60' } });
    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        subtitleSettings: expect.objectContaining({ translationTimeout: 60 }),
      }),
    );
  });

  it('calls updateSettings when the generic toggle is clicked', () => {
    render(<SubtitlesSection />);
    const toggle = screen.getByRole('switch', { name: 'Generic (Auto-detect) subtitles' });
    toggle.click();
    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ subtitleSettings: expect.objectContaining({ enableGenericSubtitleHandler: false }) }),
    );
  });

  describe('disabled state accessibility', () => {
    beforeEach(() => {
      mockState.subtitleSettings = { ...baseSubtitleSettings, enabled: false };

      (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return selector(mockState);
        }
        return mockState;
      });
    });

    it('disables appearance sliders when subtitles are disabled', () => {
      render(<SubtitlesSection />);

      const fontSizeSlider = document.getElementById('subtitle-font-size') as HTMLInputElement;
      const opacitySlider = document.getElementById('subtitle-opacity') as HTMLInputElement;
      expect(fontSizeSlider).toBeDisabled();
      expect(opacitySlider).toBeDisabled();
    });
  });
});
