import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { DiagnosticsCard } from '../DiagnosticsCard';
import { ToastProvider } from '@/ui/ToastProvider';
import { WebsiteCompatibilityCard } from '../WebsiteCompatibilityCard';
import { TranslationEngineCard } from '../TranslationEngineCard';

/**
 * Tests: Diagnostics card — debug logging explanation and persistence.
 */

describe('DiagnosticsCard', () => {
  it('explains debug logging and persists its state', () => {
    const updateSettings = vi.fn();
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      debugMode: false,
      isLoaded: true,
      updateSettings,
    } as never);
    render(<DiagnosticsCard />);
    expect(screen.getByText(/developer tools/i)).toBeInTheDocument();
    expect(
      screen.getByText(/turn it off after troubleshooting/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: /debug logging/i }));
    expect(updateSettings).toHaveBeenCalledWith({ debugMode: true });
  });
});

/**
 * Tests: Website compatibility card — preset-first presentation with
 * individual controls collapsed behind a disclosure and outcome labels.
 */

function renderCompatibility(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings,
  } as never);
  render(
    <ToastProvider>
      <WebsiteCompatibilityCard />
    </ToastProvider>,
  );
  return { updateSettings };
}

describe('WebsiteCompatibilityCard', () => {
  it('marks Balanced as recommended and detects Custom when toggles diverge', () => {
    // facet: marks Balanced as recommended
    renderCompatibility();
    expect(screen.getByLabelText(/page coverage preset/i)).toHaveValue(
      'balanced',
    );
    // Header badge is exactly "Recommended"; the preset description begins
    // "Recommended: …" — exact text isolates the badge.
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    cleanup();

    // facet: detects Custom when toggles diverge from a named preset
    renderCompatibility({
      enableAsideCaps: false,
      enableBodyTagWhitelist: true,
    });
    expect(screen.getByLabelText(/page coverage preset/i)).toHaveValue('custom');
  });

  it('keeps individual compatibility controls collapsed by default', () => {
    renderCompatibility();
    const trigger = screen.getByRole('button', {
      name: /individual compatibility controls/i,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('switch', {
        name: /translate text inside web components/i,
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(
      screen.getByRole('switch', {
        name: /translate text inside web components/i,
      }),
    ).toBeInTheDocument();
  });

  it('applies a named preset through the same settings keys', () => {
    const { updateSettings } = renderCompatibility();
    fireEvent.change(screen.getByLabelText(/page coverage preset/i), {
      target: { value: 'classic' },
    });
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enableStreamingTranslation: false }),
    );
  });
});

/**
 * Tests: Translation engine card — progressive prompt disclosure, behavior
 * toggles, and context-aware dependencies. Moved from AdvancedSection.
 */

function renderCard(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings,
  } as never);
  render(
    <ToastProvider>
      <TranslationEngineCard />
    </ToastProvider>,
  );
  return { updateSettings };
}

describe('TranslationEngineCard', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => ({ success: true })),
        getURL: vi.fn((path: string) => path),
        getManifest: vi.fn(() => ({ version: '0.0.0' })),
      },
    });
  });

  it('summarizes the default prompt collapsed, and shows Customized with an auto-expanded editor', () => {
    // facet: summarizes the default prompt and keeps its editor collapsed
    renderCard();
    expect(screen.getByText('Using default')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /system prompt/i }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByLabelText(/custom prompt template/i),
    ).not.toBeInTheDocument();
    cleanup();

    // facet: shows Customized and auto-expands the prompt editor
    renderCard({ customSystemPrompt: 'Translate to {{targetLanguage}}.' });
    expect(screen.getByText('Customized')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /system prompt/i }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/custom prompt template/i)).toHaveValue(
      'Translate to {{targetLanguage}}.',
    );
  });

  it('commits a valid prompt on blur and resets to the built-in template', () => {
    const { updateSettings } = renderCard({
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
  });

  it('persists translation behavior toggles through their existing keys', () => {
    const { updateSettings } = renderCard();
    fireEvent.click(
      screen.getByRole('switch', { name: /streaming translation/i }),
    );
    expect(updateSettings).toHaveBeenCalledWith({
      enableStreamingTranslation: false,
    });
    fireEvent.click(
      screen.getByRole('switch', { name: /source-language detection/i }),
    );
    expect(updateSettings).toHaveBeenCalledWith({
      enableSourceLanguageDetection: false,
    });
  });

  it('disables category controls until context awareness is enabled', () => {
    renderCard({ enableContextAwareTranslation: false });
    expect(
      screen.getByRole('switch', { name: /page category detection/i }),
    ).toBeDisabled();
    expect(
      screen.queryByLabelText(/detection mode/i),
    ).not.toBeInTheDocument();
  });
});
