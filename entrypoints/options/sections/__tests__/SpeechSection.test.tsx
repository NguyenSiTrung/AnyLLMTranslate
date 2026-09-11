/**
 * Tests: dedicated Speech settings tab — first-class enable panel plus the
 * characterized behaviors moved from AdvancedSection.speech.test.tsx
 * (backend-dependent controls, model/voice loading, language overrides),
 * updated for the progressive quick-setup → disclosure → drawer UX.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_SETTINGS, type ExtensionSettings, type PoolProvider } from '@/types/config';
import { useSettingsStore } from '@/stores/settingsStore';
import { ToastProvider } from '@/ui/ToastProvider';
import { SpeechSection } from '../SpeechSection';
import { listProviderModels } from '@/services/providerTester';
import { listTtsVoices } from '@/lib/tts/listTtsVoices';

vi.mock('@/services/providerTester', () => ({ listProviderModels: vi.fn() }));
vi.mock('@/lib/tts/listTtsVoices', () => ({ listTtsVoices: vi.fn() }));

const ENABLED_PROVIDER: PoolProvider = {
  id: 'p1',
  displayName: 'Provider',
  baseUrl: 'https://example.test/v1',
  model: 'chat',
  requiresApiKey: false,
  temperature: 0.3,
  maxTokens: 4096,
  enabled: true,
  keys: [
    { id: 'k1', apiKey: '', maxRpm: 20, concurrencyLimit: 1, interval: 500, enabled: true },
  ],
};

function renderSpeechSection(overrides: Partial<ExtensionSettings> = {}) {
  const updateSettings = vi.fn();
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...overrides,
    isLoaded: true,
    updateSettings,
  } as never);
  render(
    <ToastProvider>
      <SpeechSection />
    </ToastProvider>,
  );
  return updateSettings;
}

function expandProviderSettings() {
  fireEvent.click(screen.getByRole('button', { name: /advanced provider settings/i }));
}

describe('SpeechSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a first-class enable panel and persists the master switch', () => {
    const updateSettings = renderSpeechSection();
    expect(screen.getByRole('heading', { name: 'Speech' })).toBeInTheDocument();
    expect(screen.getAllByRole('switch', { name: /enable speak/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('switch', { name: /enable speak/i }));
    expect(updateSettings).toHaveBeenCalledWith({
      tts: expect.objectContaining({ enabled: false }),
    });
  });

  it('natively disables dependent controls while Speak is off', () => {
    const updateSettings = renderSpeechSection({
      tts: { ...DEFAULT_SETTINGS.tts, enabled: false },
    });

    const backend = screen.getByRole('radiogroup', { name: /speech source/i });
    for (const radio of within(backend).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /test voice/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('switch', { name: /enable speak/i }));
    expect(updateSettings).toHaveBeenCalledWith({
      tts: expect.objectContaining({ enabled: true }),
    });
  });

  it('shows quick setup before provider details and labels backends for users', () => {
    renderSpeechSection();
    const backend = screen.getByRole('radiogroup', { name: /speech source/i });
    expect(backend).toHaveTextContent('Automatic');
    expect(backend).toHaveTextContent('Browser voice');
    expect(backend).toHaveTextContent('AI voice');
    expect(screen.getByRole('button', { name: /advanced provider settings/i }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  it('hides provider setup for browser-only speech', () => {
    renderSpeechSection({
      tts: { ...DEFAULT_SETTINGS.tts, preferredBackend: 'browser' },
    });

    const backend = screen.getByRole('radiogroup', { name: /speech source/i });
    expect(within(backend).getByRole('radio', { name: /browser voice/i }))
      .toHaveAttribute('aria-checked', 'true');
    expect(
      screen.queryByRole('button', { name: /advanced provider settings/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tts credentials/i)).not.toBeInTheDocument();
  });

  it('keeps the configured model when the model list fails to load', async () => {
    vi.mocked(listProviderModels).mockResolvedValue({
      success: false,
      models: [],
      error: 'Catalog unavailable',
      latencyMs: 0,
    });
    renderSpeechSection({
      providers: [ENABLED_PROVIDER],
      tts: { ...DEFAULT_SETTINGS.tts, model: 'tts-kept' },
    });

    expandProviderSettings();
    fireEvent.click(screen.getByRole('button', { name: /load models/i }));
    expect((await screen.findAllByText('Catalog unavailable')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^model$/i)).toHaveValue('tts-kept');
  });

  it('selects a loaded voice without changing unrelated TTS values', async () => {
    vi.mocked(listTtsVoices).mockResolvedValue({
      success: true,
      voices: [{ id: 'voice-1', label: 'Voice One' }],
      latencyMs: 0,
    });
    const updateSettings = renderSpeechSection({
      providers: [ENABLED_PROVIDER],
      tts: { ...DEFAULT_SETTINGS.tts, showVoiceField: true },
    });

    expandProviderSettings();
    fireEvent.click(screen.getByRole('button', { name: /load voices/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Voice One' }));
    expect(updateSettings).toHaveBeenCalledWith({
      tts: expect.objectContaining({ voice: 'voice-1', rate: 1 }),
    });
  });

  it('adds an unused language override through the drawer', async () => {
    const updateSettings = renderSpeechSection({
      tts: {
        ...DEFAULT_SETTINGS.tts,
        languageOverrides: [{ language: 'en' }],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /add language/i }));
    const dialog = await screen.findByRole('dialog', { name: /add language voice/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /save override/i }));

    expect(updateSettings).toHaveBeenCalledWith({
      tts: expect.objectContaining({
        languageOverrides: expect.arrayContaining([
          { language: 'en' },
          expect.objectContaining({ language: expect.not.stringMatching(/^en$/i) }),
        ]),
      }),
    });
  });

  it('summarizes overrides and edits one in a drawer', () => {
    renderSpeechSection({
      tts: {
        ...DEFAULT_SETTINGS.tts,
        languageOverrides: [{ language: 'vi', voice: 'voice-vi' }],
      },
    });

    expect(screen.getByText('1 language override')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /edit vietnamese/i }));
    expect(screen.getByRole('dialog', { name: /edit language voice/i })).toBeInTheDocument();
    expect(screen.getByText(/uses default model/i)).toBeInTheDocument();
  });

  it('keeps Save disabled while the drawer language is a duplicate', async () => {
    renderSpeechSection({
      tts: {
        ...DEFAULT_SETTINGS.tts,
        languageOverrides: [{ language: 'en' }],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /add language/i }));
    const dialog = await screen.findByRole('dialog', { name: /add language voice/i });
    fireEvent.change(within(dialog).getByLabelText(/^language$/i), {
      target: { value: 'en' },
    });

    expect(
      within(dialog).getByRole('button', { name: /save override/i }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText(/already configured in another row/i),
    ).toBeInTheDocument();
  });
});
