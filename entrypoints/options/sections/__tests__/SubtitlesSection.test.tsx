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
  updateSettings: mockUpdateSettings,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockState.subtitleSettings = { ...DEFAULT_SUBTITLE_SETTINGS };

  (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
    if (typeof selector === 'function') {
      return selector(mockState);
    }
    return mockState;
  });
});

describe('SubtitlesSection', () => {
  describe('renders all existing controls', () => {
    it('renders the section heading, enabled toggle, position, font size, and opacity', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Subtitle Settings')).toBeInTheDocument();
      expect(screen.getByText('Enable Subtitles')).toBeInTheDocument();
      expect(screen.getByText('Subtitle Position')).toBeInTheDocument();
      expect(screen.getByText(/^Font Size:/)).toBeInTheDocument();
      expect(screen.getByText(/Background Opacity/)).toBeInTheDocument();
    });
  });

  describe('Phase 2 section structure', () => {
    it('renders the Enable Subtitles toggle in a hero strip above the cards', () => {
      render(<SubtitlesSection />);
      // The master-enable toggle is the highest control on the page.
      const toggle = document.getElementById('subtitle-enabled-toggle');
      expect(toggle).toBeInTheDocument();
      // The hero strip is the first bordered region after the SectionHeader.
      const hero = toggle?.closest('div.rounded-xl');
      expect(hero?.className).toContain('border-cyan-500/30');
    });

    it('reflects the enabled status in the hero description line', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText(/Translated subtitles are active/)).toBeInTheDocument();
    });

    it('groups Display Mode under the Appearance card', () => {
      render(<SubtitlesSection />);
      // Display Mode control renders inside the same group as Subtitle Position.
      const positionGroup = screen.getByText('Subtitle Position').closest('.space-y-5');
      expect(positionGroup).not.toBeNull();
      expect(positionGroup?.textContent).toContain('Display Mode');
    });

    it('shows the off-status description when subtitles are disabled', () => {
      mockState.subtitleSettings = { ...baseSubtitleSettings, enabled: false };
      (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
        if (typeof selector === 'function') return selector(mockState);
        return mockState;
      });
      render(<SubtitlesSection />);
      expect(screen.getByText(/Subtitles are off/)).toBeInTheDocument();
    });

    it('has an "Appearance" card title and no longer has a "Behavior" subgroup', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Appearance')).toBeInTheDocument();
      expect(screen.queryByText('Behavior')).not.toBeInTheDocument();
    });
  });

  describe('new Phase 2 controls', () => {
    it('renders Font Family, Display Mode controls and their options, and no Translation Timeout', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Font Family')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
      expect(screen.getByText('Serif')).toBeInTheDocument();
      expect(screen.getByText('Mono')).toBeInTheDocument();
      expect(screen.getByText('Display Mode')).toBeInTheDocument();
      expect(screen.getByText('Bilingual')).toBeInTheDocument();
      expect(screen.getByText('Translated Only')).toBeInTheDocument();
      expect(screen.queryByText(/Translation Timeout/)).not.toBeInTheDocument();
    });
  });

  describe('preview card', () => {
    it('renders the Preview card with translated text and bilingual original text', () => {
      render(<SubtitlesSection />);
      const previewEls = screen.getAllByText('Preview');
      expect(previewEls.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Xin chào thế giới')).toBeInTheDocument();
      // default displayMode = 'bilingual' shows original text too
      expect(screen.getByText('Hello world')).toBeInTheDocument();
      // enabled by default — no disabled banner
      expect(screen.queryByText('Subtitles disabled')).not.toBeInTheDocument();
    });

    it('hides original text in preview when displayMode is translation-only', () => {
      mockState.subtitleSettings = { ...baseSubtitleSettings, displayMode: 'translation-only' };

      (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return selector(mockState);
        }
        return mockState;
      });

      render(<SubtitlesSection />);
      expect(screen.queryByText('Hello world')).not.toBeInTheDocument();
      expect(screen.getByText('Xin chào thế giới')).toBeInTheDocument();
    });

    it('shows disabled state when subtitles are turned off', () => {
      mockState.subtitleSettings = { ...baseSubtitleSettings, enabled: false };

      (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return selector(mockState);
        }
        return mockState;
      });

      render(<SubtitlesSection />);
      expect(screen.getByText('Subtitles disabled')).toBeInTheDocument();
    });

    it('does not show disabled state when subtitles are enabled', () => {
      // already covered in the combined preview test above
      expect(true).toBe(true);
    });
  });

  describe('language discovery controls', () => {
    it('renders the Language Discovery card, preferred source language select, and auto-activate toggle', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Language Discovery')).toBeInTheDocument();
      expect(screen.getByText('Preferred source subtitle language')).toBeInTheDocument();
      expect(screen.getByText('Auto-Activate Subtitles')).toBeInTheDocument();
      const select = screen.getByLabelText('Preferred source subtitle language') as HTMLSelectElement;
      expect(select.value).toBe('en');
    });

    it('disables language discovery controls when subtitles are disabled', () => {
      mockState.subtitleSettings = { ...baseSubtitleSettings, enabled: false };

      (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return selector(mockState);
        }
        return mockState;
      });

      render(<SubtitlesSection />);

      expect(screen.getByLabelText('Preferred source subtitle language')).toBeDisabled();
      expect(screen.getByRole('switch', { name: 'Auto-Activate Subtitles' })).toBeDisabled();
    });
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

    it('disables appearance segmented controls when subtitles are disabled', () => {
      render(<SubtitlesSection />);

      expect(screen.getByRole('radio', { name: 'Top' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: 'Serif' })).toBeDisabled();
    });

    it('disables appearance sliders when subtitles are disabled', () => {
      render(<SubtitlesSection />);

      const fontSizeSlider = document.getElementById('subtitle-font-size') as HTMLInputElement;
      const opacitySlider = document.getElementById('subtitle-opacity') as HTMLInputElement;
      expect(fontSizeSlider).toBeDisabled();
      expect(opacitySlider).toBeDisabled();
    });
  });

  describe('default values', () => {
    it('default fontFamily is system', () => {
      const state = { subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS } };
      expect(state.subtitleSettings.fontFamily).toBe('system');
    });

    it('default displayMode is bilingual', () => {
      const state = { subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS } };
      expect(state.subtitleSettings.displayMode).toBe('bilingual');
    });

    it('default translationTimeout is 30', () => {
      const state = { subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS } };
      expect(state.subtitleSettings.translationTimeout).toBe(30);
    });

    it('default preferredSubtitleLanguage is en', () => {
      const state = { subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS } };
      expect(state.subtitleSettings.preferredSubtitleLanguage).toBe('en');
    });

    it('default autoActivateSubtitles is false', () => {
      const state = { subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS } };
      expect(state.subtitleSettings.autoActivateSubtitles).toBe(false);
    });

    it('default disabledSubtitleSites is empty array', () => {
      const state = { subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS } };
      expect(state.subtitleSettings.disabledSubtitleSites).toEqual([]);
    });
  });

  describe('supported sites card', () => {
    it('renders the Supported Sites card with all platform names, method hints, and toggles checked by default', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Supported Sites')).toBeInTheDocument();
      expect(screen.getByText('YouTube')).toBeInTheDocument();
      expect(screen.getByText('Udemy')).toBeInTheDocument();
      expect(screen.getByText('Coursera')).toBeInTheDocument();
      expect(screen.getByText('LinkedIn Learning')).toBeInTheDocument();
      expect(screen.getByText('HBO Max')).toBeInTheDocument();
      expect(screen.getByText('Youku')).toBeInTheDocument();
      expect(screen.getByText('Netflix')).toBeInTheDocument();
      expect(screen.getByText('Disney+')).toBeInTheDocument();
      expect(screen.getByText('WeTV')).toBeInTheDocument();

      const xhrHints = screen.getAllByText('XHR interception');
      expect(xhrHints.length).toBeGreaterThanOrEqual(3);
      expect(screen.getByText('Fetch interception')).toBeInTheDocument();
      expect(screen.getByText('VTT intercept + MPD/DOM fallback')).toBeInTheDocument();
      expect(screen.getByText('Fetch ASS + DOM fallback')).toBeInTheDocument();
      expect(screen.getByText('XHR interception (.vtt)')).toBeInTheDocument();

      for (const id of [
        'subtitle-site-youtube',
        'subtitle-site-udemy',
        'subtitle-site-coursera',
        'subtitle-site-linkedin',
        'subtitle-site-hbomax',
        'subtitle-site-youku',
        'subtitle-site-netflix',
        'subtitle-site-disneyplus',
        'subtitle-site-wetv',
      ]) {
        expect(document.getElementById(id)).toBeInTheDocument();
      }

      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });

    it('shows Load more and reveals additional sites on click', () => {
      const longPlatformList = Array.from({ length: 12 }, (_, index) => ({
        platform: `platform-${index}`,
        name: `Platform ${index}`,
        methodHint: 'Test interception',
      }));

      const loadMoreSpy = vi.spyOn(subtitleSites, 'getSubtitleSitesLoadMoreState');
      loadMoreSpy
        .mockReturnValueOnce({
          visibleSites: longPlatformList.slice(0, 10),
          showLoadMore: true,
          remainingCount: 2,
          nextVisibleCount: 12,
        })
        .mockReturnValue({
          visibleSites: longPlatformList,
          showLoadMore: false,
          remainingCount: 0,
          nextVisibleCount: 12,
        });

      render(<SubtitlesSection />);

      expect(screen.getByText('Platform 0')).toBeInTheDocument();
      expect(screen.getByText('Platform 9')).toBeInTheDocument();
      expect(screen.queryByText('Platform 10')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /load more \(2 remaining\)/i }));

      expect(screen.getByText('Platform 10')).toBeInTheDocument();
      expect(screen.getByText('Platform 11')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();

      loadMoreSpy.mockRestore();
    });

    it('shows unchecked toggle for a disabled site', () => {
      mockState.subtitleSettings = {
        ...baseSubtitleSettings,
        disabledSubtitleSites: ['youtube'],
      };

      (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return selector(mockState);
        }
        return mockState;
      });

      render(<SubtitlesSection />);
      const youtubeToggle = document.getElementById('subtitle-site-youtube');
      expect(youtubeToggle?.getAttribute('aria-checked')).toBe('false');

      const udemyToggle = document.getElementById('subtitle-site-udemy');
      expect(udemyToggle?.getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('generic subtitle detection toggle', () => {
    it('renders the Generic Subtitle Detection toggle checked by default, with no per-site toggle', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Generic Subtitle Detection')).toBeInTheDocument();
      const toggle = document.getElementById('subtitle-generic-handler-toggle');
      expect(toggle).toBeInTheDocument();
      expect(toggle?.getAttribute('aria-checked')).toBe('true');
      expect(document.getElementById('subtitle-site-generic')).toBeNull();
    });

    it('reflects enableGenericSubtitleHandler=false as unchecked', () => {
      mockState.subtitleSettings = {
        ...baseSubtitleSettings,
        enableGenericSubtitleHandler: false,
      };

      (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
        if (typeof selector === 'function') {
          return selector(mockState);
        }
        return mockState;
      });

      render(<SubtitlesSection />);
      const toggle = document.getElementById('subtitle-generic-handler-toggle');
      expect(toggle?.getAttribute('aria-checked')).toBe('false');
    });

    it('calls updateSettings when the generic toggle is clicked', () => {
      render(<SubtitlesSection />);
      const toggle = screen.getByRole('switch', { name: 'Generic Subtitle Detection' });
      toggle.click();
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ subtitleSettings: expect.objectContaining({ enableGenericSubtitleHandler: false }) }),
      );
    });

    it('does NOT render a per-site toggle for generic (separate setting)', () => {
      // already covered in the combined toggle test above
      expect(true).toBe(true);
    });
  });
});
