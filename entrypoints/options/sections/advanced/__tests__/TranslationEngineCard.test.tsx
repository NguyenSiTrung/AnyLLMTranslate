/**
 * Tests: Translation engine card — progressive prompt disclosure, behavior
 * toggles, and context-aware dependencies. Moved from AdvancedSection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { TranslationEngineCard } from '../TranslationEngineCard';

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

  it('summarizes the default prompt and keeps its editor collapsed', () => {
    renderCard();
    expect(screen.getByText('Using default')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /system prompt/i }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByLabelText(/custom prompt template/i),
    ).not.toBeInTheDocument();
  });

  it('shows Customized and auto-expands the prompt editor', () => {
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
