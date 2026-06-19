/**
 * Tests for SubtitlesSection — controls, preview cycling, disabled state,
 * and language discovery.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubtitlesSection } from '../SubtitlesSection';
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
    it('renders the section heading', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Subtitle Settings')).toBeInTheDocument();
    });

    it('renders the enabled toggle', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Enable Subtitles')).toBeInTheDocument();
    });

    it('renders the position control', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Subtitle Position')).toBeInTheDocument();
    });

    it('renders font size slider', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText(/^Font Size:/)).toBeInTheDocument();
    });

    it('renders background opacity slider', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText(/Background Opacity/)).toBeInTheDocument();
    });
  });

  describe('new Phase 2 controls', () => {
    it('renders Font Family segmented control', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Font Family')).toBeInTheDocument();
    });

    it('renders Font Family options: System, Serif, Mono', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('System')).toBeInTheDocument();
      expect(screen.getByText('Serif')).toBeInTheDocument();
      expect(screen.getByText('Mono')).toBeInTheDocument();
    });

    it('renders Display Mode segmented control', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Display Mode')).toBeInTheDocument();
    });

    it('renders Display Mode options: Bilingual, Translated Only', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Bilingual')).toBeInTheDocument();
      expect(screen.getByText('Translated Only')).toBeInTheDocument();
    });

    it('does not render the unused Translation Timeout slider', () => {
      render(<SubtitlesSection />);
      expect(screen.queryByText(/Translation Timeout/)).not.toBeInTheDocument();
    });
  });

  describe('preview card', () => {
    it('renders the Preview card', () => {
      render(<SubtitlesSection />);
      const previewEls = screen.getAllByText('Preview');
      expect(previewEls.length).toBeGreaterThanOrEqual(1);
    });

    it('renders first cue translated text in preview', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Xin chào thế giới')).toBeInTheDocument();
    });

    it('renders bilingual original text when displayMode is bilingual', () => {
      render(<SubtitlesSection />);
      // default displayMode = 'bilingual' shows original text too
      expect(screen.getByText('Hello world')).toBeInTheDocument();
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
      render(<SubtitlesSection />);
      expect(screen.queryByText('Subtitles disabled')).not.toBeInTheDocument();
    });
  });

  describe('language discovery controls', () => {
    it('renders the Language Discovery card', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Language Discovery')).toBeInTheDocument();
    });

    it('renders Preferred source subtitle language select', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Preferred source subtitle language')).toBeInTheDocument();
    });

    it('renders Auto-Activate Subtitles toggle', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Auto-Activate Subtitles')).toBeInTheDocument();
    });

    it('renders preferred language select with English selected by default', () => {
      render(<SubtitlesSection />);
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
    it('renders the Supported Sites card', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Supported Sites')).toBeInTheDocument();
    });

    it('renders all 5 platform names', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('YouTube')).toBeInTheDocument();
      expect(screen.getByText('Udemy')).toBeInTheDocument();
      expect(screen.getByText('Coursera')).toBeInTheDocument();
      expect(screen.getByText('LinkedIn Learning')).toBeInTheDocument();
      expect(screen.getByText('HBO Max')).toBeInTheDocument();
    });

    it('renders method hints for each platform', () => {
      render(<SubtitlesSection />);
      const xhrHints = screen.getAllByText('XHR interception');
      expect(xhrHints).toHaveLength(3); // youtube, udemy, coursera
      expect(screen.getByText('Fetch interception')).toBeInTheDocument();
      expect(screen.getByText('DOM cue scraping')).toBeInTheDocument();
    });

    it('renders all 5 site toggles checked by default (empty disabled list)', () => {
      render(<SubtitlesSection />);
      const youtubeToggle = document.getElementById('subtitle-site-youtube') as HTMLInputElement;
      const udemyToggle = document.getElementById('subtitle-site-udemy') as HTMLInputElement;
      const courseraToggle = document.getElementById('subtitle-site-coursera') as HTMLInputElement;
      const linkedinToggle = document.getElementById('subtitle-site-linkedin') as HTMLInputElement;
      const hbomaxToggle = document.getElementById('subtitle-site-hbomax') as HTMLInputElement;

      expect(youtubeToggle).toBeInTheDocument();
      expect(udemyToggle).toBeInTheDocument();
      expect(courseraToggle).toBeInTheDocument();
      expect(linkedinToggle).toBeInTheDocument();
      expect(hbomaxToggle).toBeInTheDocument();
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
      const youtubeToggle = document.getElementById('subtitle-site-youtube') as HTMLInputElement;
      expect(youtubeToggle.checked).toBe(false);

      const udemyToggle = document.getElementById('subtitle-site-udemy') as HTMLInputElement;
      expect(udemyToggle.checked).toBe(true);
    });
  });
});
