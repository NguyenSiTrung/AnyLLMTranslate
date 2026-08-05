/**
 * SubtitlesSection — Subtitle Studio shell, cards, ASR nesting, knobs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  runtime: {
    sendMessage: vi.fn(async (msg: { action?: string }) => {
      if (msg?.action === 'ASR_REALIGN_CACHE_STATS') {
        return { success: true, entryCount: 0, totalBytes: 0 };
      }
      if (msg?.action === 'LIST_ASR_REALIGN_CACHE') {
        return { success: true, entries: [] };
      }
      return { success: true };
    }),
    onMessage: {
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

  it('covers studio cards, display toggles, ASR disable behavior, and profile reset', async () => {
    render(<SubtitlesSection />);
    expect(screen.getByRole('heading', { name: 'Subtitle Studio', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Enable Subtitles/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live preview', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Source track', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Platforms', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Caption quality', level: 3 })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Re-align from link', level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Saved caption re-aligns', level: 3 }),
    ).toBeInTheDocument();

    // Card order: Caption quality → Re-align from link → Saved caption re-aligns.
    const captionQuality = screen.getByRole('heading', { name: 'Caption quality', level: 3 });
    const prealign = screen.getByRole('heading', { name: 'Re-align from link', level: 3 });
    const saved = screen.getByRole('heading', { name: 'Saved caption re-aligns', level: 3 });
    expect(
      captionQuality.compareDocumentPosition(prealign) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      prealign.compareDocumentPosition(saved) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Translation style', level: 3 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('asr-realign-summary')).toHaveTextContent(/No saved re-aligns yet/i);
    });
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
    cleanup();
    {
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
    }
});
});
