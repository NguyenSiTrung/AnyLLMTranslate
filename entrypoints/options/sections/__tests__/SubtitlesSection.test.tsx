/**
 * Tests for SubtitlesSection — new controls (font family, display mode, timeout)
 * and the mini video player preview.
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
      expect(screen.getByText(/Font Size/)).toBeInTheDocument();
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

    it('renders Translation Timeout slider', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText(/Translation Timeout/)).toBeInTheDocument();
    });
  });

  describe('preview card', () => {
    it('renders the Preview card', () => {
      render(<SubtitlesSection />);
      // Card renders 'Preview' as title; use getAllByText since label is only h3
      const previewEls = screen.getAllByText('Preview');
      expect(previewEls.length).toBeGreaterThanOrEqual(1);
    });

    it('renders translated text in preview', () => {
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
  });

  describe('language discovery controls', () => {
    it('renders the Language Discovery card', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Language Discovery')).toBeInTheDocument();
    });

    it('renders Preferred Subtitle Language select', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Preferred Subtitle Language')).toBeInTheDocument();
    });

    it('renders Auto-Activate Subtitles toggle', () => {
      render(<SubtitlesSection />);
      expect(screen.getByText('Auto-Activate Subtitles')).toBeInTheDocument();
    });

    it('renders preferred language select with English selected by default', () => {
      render(<SubtitlesSection />);
      const select = screen.getByLabelText('Preferred Subtitle Language') as HTMLSelectElement;
      expect(select.value).toBe('en');
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
  });
});
