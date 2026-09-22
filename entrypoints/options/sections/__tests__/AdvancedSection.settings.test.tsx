/**
 * Characterization tests: every remaining Advanced control after Speech and
 * PDF moved out — prompt editing, behavior toggles, context dependencies,
 * performance validation, page-scope presets, cache confirmation, and reset.
 * These assertions survive the card extraction unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { DEFAULT_SYSTEM_PROMPT_TEMPLATE } from '@/services/base';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { AdvancedSection } from '../AdvancedSection';

const cacheStats = vi.hoisted(() => ({
  entryCount: 12,
  totalSizeBytes: 2048,
  sizeMb: 0.002,
  sizeLabel: '2 KB',
  loading: false,
  refresh: vi.fn(),
}));

vi.mock('@/entrypoints/options/hooks/useCacheStats', () => ({
  useCacheStats: () => cacheStats,
}));

vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    savePreImportSnapshot: vi.fn(async () => {}),
    loadPreImportSnapshot: vi.fn(async () => null),
    clearPreImportSnapshot: vi.fn(async () => {}),
  };
});

function renderAdvanced(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  const resetToDefaults = vi.fn();
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings,
    resetToDefaults,
  } as never);
  render(
    <ToastProvider>
      <AdvancedSection />
    </ToastProvider>,
  );
  return { updateSettings, resetToDefaults };
}

describe('AdvancedSection settings', () => {
  beforeEach(() => {
    cacheStats.entryCount = 12;
    cacheStats.loading = false;
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => ({ success: true })),
        getURL: vi.fn((path: string) => path),
        getManifest: vi.fn(() => ({ version: '0.0.0' })),
      },
      tabs: { create: vi.fn() },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {}),
          remove: vi.fn(async () => {}),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
  });

  it('commits a valid prompt on blur and resets to the built-in template', () => {
    const { updateSettings } = renderAdvanced({
      customSystemPrompt: 'Existing prompt',
    });
    const prompt = screen.getByLabelText(/custom prompt template/i);
    fireEvent.change(prompt, {
      target: { value: 'Translate to {{targetLanguage}}.' },
    });
    fireEvent.blur(prompt);
    expect(updateSettings).toHaveBeenCalledWith({
      customSystemPrompt: 'Translate to {{targetLanguage}}.',
    });

    fireEvent.click(screen.getByRole('button', { name: /reset to default/i }));
    expect(updateSettings).toHaveBeenCalledWith({ customSystemPrompt: null });
    expect(prompt).toHaveValue(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
  });

  // Behavior toggles, context-gating, and invalid cache-lifetime validation are
  // covered by the extracted card tests:
  // advanced/__tests__/advancedCards.test.tsx and
  // advanced/__tests__/PerformanceCard.test.tsx.

  it('confirms cache clearing and keeps configuration', () => {
    renderAdvanced();
    fireEvent.click(screen.getByRole('button', { name: /^clear cache$/i }));
    expect(
      screen.getByRole('dialog', { name: /clear translation cache/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/settings, dictionary, and site rules are kept/i),
    ).toBeInTheDocument();
  });

  it('applies the selected page scope preset and keeps low-level settings available', () => {
    const { updateSettings } = renderAdvanced();
    fireEvent.change(screen.getByLabelText(/page coverage preset/i), {
      target: { value: 'classic' },
    });
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enableStreamingTranslation: false }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /individual compatibility controls/i }),
    );
    expect(
      screen.getByRole('switch', {
        name: /translate text inside web components/i,
      }),
    ).toBeInTheDocument();
  });

  it('uses one labeled section navigator and one heading for each destination', () => {
    renderAdvanced();
    expect(
      screen.getAllByRole('navigation', { name: /advanced sections/i }),
    ).toHaveLength(1);
    for (const name of [
      'Translation engine',
      'Performance',
      'Website compatibility',
      'Data and recovery',
      'Diagnostics',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('requires confirmation before resetting all settings', () => {
    const { resetToDefaults } = renderAdvanced();
    fireEvent.click(screen.getByRole('button', { name: /reset everything/i }));
    expect(resetToDefaults).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: /reset all settings/i });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Reset everything' }),
    );
    expect(resetToDefaults).toHaveBeenCalledOnce();
  });
});
