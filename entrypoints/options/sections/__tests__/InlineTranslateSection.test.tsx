/**
 * InlineTranslateSection — hero, cards, dual mode segments, dimmer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS, DEFAULT_INLINE_TRANSLATE_SETTINGS } from '@/types/config';

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
import { InlineTranslateSection } from '../InlineTranslateSection';

describe('InlineTranslateSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS, enabled: true },
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('renders hero enable and primary card titles', () => {
    render(<InlineTranslateSection />);
    expect(
      screen.getByRole('switch', { name: /Enable Inline Translation/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preview', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trigger', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Write & language', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Site blocklist', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it works', level: 3 })).toBeInTheDocument();
  });

  it('shows reactive preview after text when enabled', () => {
    render(<InlineTranslateSection />);
    expect(screen.getByTestId('inline-translate-preview')).toBeInTheDocument();
    expect(screen.getByText(/After gesture/i)).toBeInTheDocument();
  });

  it('shows enable-to-preview message when disabled', () => {
    useSettingsStore.setState({
      inlineTranslate: { ...DEFAULT_INLINE_TRANSLATE_SETTINGS, enabled: false },
    });
    render(<InlineTranslateSection />);
    expect(screen.getByText(/Enable inline translation to preview/i)).toBeInTheDocument();
  });

  it('dual mode segment updates store', async () => {
    render(<InlineTranslateSection />);
    fireEvent.click(screen.getByRole('radio', { name: /Original \+ translation/i }));
    await waitFor(() => {
      expect(useSettingsStore.getState().inlineTranslate.dualMode).toBe(true);
    });
  });

  it('toggles enabled via hero control', async () => {
    render(<InlineTranslateSection />);
    const toggle = screen.getByRole('switch', { name: /Enable Inline Translation/i });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(useSettingsStore.getState().inlineTranslate.enabled).toBe(false);
    });
  });

  it('shows blocklist pattern count badge', () => {
    render(<InlineTranslateSection />);
    const n = DEFAULT_INLINE_TRANSLATE_SETTINGS.blocklistPatterns.length;
    expect(screen.getByText(new RegExp(`${n}\\s+patterns?`, 'i'))).toBeInTheDocument();
  });

  it('Gesture timing disclosure starts collapsed', () => {
    render(<InlineTranslateSection />);
    const btn = screen.getByRole('button', { name: /Gesture timing/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});
