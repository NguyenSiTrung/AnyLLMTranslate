/**
 * SubtitlesSection — Subtitle Studio shell, cards, ASR nesting, knobs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS, DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

const mockStorageData: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorageData[key] })),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorageData, data);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

import { useSettingsStore } from '@/stores/settingsStore';
import { SubtitlesSection } from '../SubtitlesSection';

describe('SubtitlesSection (Subtitle Studio)', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      targetLanguage: 'vi',
      subtitleSettings: { ...DEFAULT_SUBTITLE_SETTINGS, enabled: true },
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('renders studio cards/preview and toggles enable + display mode', async () => {
    render(<SubtitlesSection />);
    expect(screen.getByRole('heading', { name: 'Subtitle Studio', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Enable Subtitles/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live preview', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Source track', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Platforms', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Caption quality', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Translation style', level: 3 })).toBeInTheDocument();
    expect(screen.getByTestId('subtitle-preview')).toBeInTheDocument();
    expect(screen.getByTestId('subtitle-preview-summary')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Translated/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().subtitleSettings.displayMode).toBe('translation-only');
    });

    fireEvent.click(screen.getByRole('switch', { name: /Enable Subtitles/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().subtitleSettings.enabled).toBe(false);
    });
  });

  it('clears ASR aiEnable when master off and resets knobs', async () => {
    useSettingsStore.setState({
      subtitleSettings: {
        ...DEFAULT_SUBTITLE_SETTINGS,
        enabled: true,
        youtubeAsrResegment: { enable: true, aiEnable: true },
        knobOverrides: { register: 'casual', brevity: 'terse' },
      },
    });
    render(<SubtitlesSection />);
    fireEvent.click(screen.getByRole('switch', { name: /Improve auto-generated captions/i }));
    await waitFor(() => {
      const asr = useSettingsStore.getState().subtitleSettings.youtubeAsrResegment;
      expect(asr?.enable).toBe(false);
      expect(asr?.aiEnable).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: /Reset to profile defaults/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().subtitleSettings.knobOverrides).toEqual({});
    });
  });
});
