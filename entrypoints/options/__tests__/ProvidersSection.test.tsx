/**
 * Tests for ProvidersSection — multi-provider pool manager UI.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProvidersSection, getPoolReadiness, countEnabledKeys } from '../sections/ProvidersSection';
import { ToastProvider } from '@/ui/ToastProvider';
import type { ExtensionSettings, PoolProvider } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';

const updateSettings = vi.fn();

let mockState: ExtensionSettings & { updateSettings: typeof updateSettings } = {
  ...DEFAULT_SETTINGS,
  updateSettings,
};

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector?: (state: typeof mockState) => unknown) =>
    selector ? selector(mockState) : mockState,
}));

const { testConnection } = vi.hoisted(() => ({
  testConnection: vi.fn(async (_config, onProgress) => {
    onProgress?.({ name: 'ping', success: true, latencyMs: 10 }, 0);
    onProgress?.({ name: 'models', success: true, latencyMs: 12, data: ['gpt-4o-mini'] }, 1);
    onProgress?.({ name: 'translation', success: true, latencyMs: 20, data: 'Xin chào' }, 2);
    return {
      overall: true,
      steps: [
        { name: 'ping', success: true, latencyMs: 10 },
        { name: 'models', success: true, latencyMs: 12 },
        { name: 'translation', success: true, latencyMs: 20 },
      ],
      models: ['gpt-4o-mini'],
      totalLatencyMs: 42,
    };
  }),
}));

const { listProviderModels } = vi.hoisted(() => ({
  listProviderModels: vi.fn(async () => ({
    success: true,
    models: ['gpt-4o-mini', 'gpt-4o'],
    latencyMs: 15,
  })),
}));

vi.mock('@/services/providerTester', () => ({
  testConnection,
  listProviderModels,
}));

function makeProvider(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'p1',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [{ id: 'k1', apiKey: 'sk-test', maxRpm: 60, enabled: true, label: 'prod' }],
    ...overrides,
  };
}

function renderSection(onOpenSetup?: ReturnType<typeof vi.fn>) {
  render(
    <ToastProvider>
      <ProvidersSection onOpenSetup={onOpenSetup} />
    </ToastProvider>,
  );
}

describe('ProvidersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { ...DEFAULT_SETTINGS, providers: [makeProvider()], updateSettings };
  });

  it('renders the section header and the single provider', () => {
    renderSection();
    expect(screen.getByText('Providers')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('1 key')).toBeInTheDocument();
  });

  it('shows the empty-state message when no providers exist', () => {
    mockState = { ...DEFAULT_SETTINGS, providers: [], updateSettings };
    renderSection();
    expect(screen.getByText(/no providers configured\. add one/i)).toBeInTheDocument();
  });

  it('expands a provider to reveal its fields on click', () => {
    renderSection();
    // The provider row button toggles expansion.
    fireEvent.click(screen.getByText('OpenAI'));
    // Expanded: baseUrl label appears.
    expect(screen.getByText('Base URL')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
  });

  it('adds a key when "Add key" is clicked', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    fireEvent.click(screen.getByText('Add key'));

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ keys: expect.arrayContaining([
            expect.objectContaining({ apiKey: '' }), // the new empty key
          ]) }),
        ]),
      }),
    );
  });

  it('updates the provider baseUrl when edited', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    const baseUrlInput = screen.getByPlaceholderText('https://api.openai.com/v1');
    fireEvent.change(baseUrlInput, { target: { value: 'https://new.example.com/v1' } });

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ baseUrl: 'https://new.example.com/v1' }),
        ]),
      }),
    );
  });

  it('updates a key maxRpm on blur (validated 0-600)', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    const rpmInput = screen.getByDisplayValue('60');
    fireEvent.change(rpmInput, { target: { value: '9999' } });
    fireEvent.blur(rpmInput);

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            keys: expect.arrayContaining([expect.objectContaining({ maxRpm: 600 })]),
          }),
        ]),
      }),
    );
  });

  it('reveals and hides the API key via the Input eye toggle', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    // The Input component has a built-in eye toggle with aria-label
    const showBtn = screen.getByLabelText('Show password');
    fireEvent.click(showBtn);
    expect(screen.getByLabelText('Hide password')).toBeInTheDocument();
  });

  it('toggles a key enabled state', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    // Two "Enabled" toggles exist (provider + key). Click the key's enable switch.
    const enableSwitches = screen.getAllByRole('switch');
    // The last switch is the key's enabled toggle (provider toggle is first in expanded).
    const keyToggle = enableSwitches[enableSwitches.length - 1];
    if (keyToggle) fireEvent.click(keyToggle);

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            keys: expect.arrayContaining([expect.objectContaining({ enabled: false })]),
          }),
        ]),
      }),
    );
  });

  it('opens the add-provider modal when "Add provider from catalog" is clicked', () => {
    renderSection();
    fireEvent.click(screen.getByText('Add provider from catalog'));
    expect(screen.getByText('Add provider from catalog', { selector: 'h3' })).toBeInTheDocument();
  });

  it('prompts for confirmation when removing a provider', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    fireEvent.click(screen.getByText('Remove provider'));
    expect(screen.getByText('Remove provider?')).toBeInTheDocument();
  });
});

describe('ProvidersSection multi-expand accordion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [
        makeProvider({ id: 'p1', displayName: 'Alpha' }),
        makeProvider({ id: 'p2', displayName: 'Beta', keys: [{ id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true }] }),
      ],
      updateSettings,
    };
  });

  it('shows Expand all / Collapse all buttons when > 1 provider', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /expand all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /collapse all/i })).toBeInTheDocument();
  });

  it('does not show Expand all / Collapse all when only 1 provider', () => {
    mockState = { ...DEFAULT_SETTINGS, providers: [makeProvider()], updateSettings };
    renderSection();
    expect(screen.queryByRole('button', { name: /expand all/i })).not.toBeInTheDocument();
  });

  it('expands multiple providers simultaneously', () => {
    renderSection();
    // Both collapsed initially
    expect(screen.queryByText('Base URL')).not.toBeInTheDocument();

    // Expand first
    fireEvent.click(screen.getByText('Alpha'));
    expect(screen.getByText('Base URL')).toBeInTheDocument();

    // Expand second — first should still be expanded
    fireEvent.click(screen.getByText('Beta'));
    // Two Base URL labels should exist (one per provider)
    expect(screen.getAllByText('Base URL')).toHaveLength(2);
  });

  it('collapse all collapses every provider', () => {
    renderSection();
    // Expand both
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getByText('Beta'));
    expect(screen.getAllByText('Base URL')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /collapse all/i }));
    expect(screen.queryByText('Base URL')).not.toBeInTheDocument();
  });

  it('expand all opens every provider', () => {
    renderSection();
    expect(screen.queryByText('Base URL')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));
    expect(screen.getAllByText('Base URL')).toHaveLength(2);
  });

  it('collapses a single provider on re-click without affecting others', () => {
    renderSection();
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getByText('Beta'));
    expect(screen.getAllByText('Base URL')).toHaveLength(2);

    // Collapse only Alpha
    fireEvent.click(screen.getByText('Alpha'));
    expect(screen.getAllByText('Base URL')).toHaveLength(1);
  });
});

describe('ProvidersSection disabled provider visuals', () => {
  it('renders a disabled provider header with dimmed styling', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({ enabled: false, displayName: 'Disabled Prov' })],
      updateSettings,
    };
    renderSection();
    const header = screen.getByText('Disabled Prov').closest('button');
    expect(header).toHaveClass('opacity-60');
  });

  it('renders an enabled provider header without dimmed styling', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({ enabled: true, displayName: 'Enabled Prov' })],
      updateSettings,
    };
    renderSection();
    const header = screen.getByText('Enabled Prov').closest('button');
    expect(header).not.toHaveClass('opacity-60');
  });
});

describe('ProvidersSection readiness banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { ...DEFAULT_SETTINGS, providers: [makeProvider()], updateSettings };
  });

  it('shows pool-ready status when a healthy provider key exists', () => {
    renderSection();
    expect(screen.getByText(/provider pool ready/i)).toBeInTheDocument();
  });

  it('shows not-configured guidance when no providers exist', () => {
    mockState = { ...DEFAULT_SETTINGS, providers: [], updateSettings };
    renderSection();
    // Readiness banner shows "No providers configured" as the title
    expect(screen.getByRole('heading', { level: 3, name: /no providers configured/i })).toBeInTheDocument();
  });

  it('calls onOpenSetup when the setup guide button is clicked', () => {
    const onOpenSetup = vi.fn();
    renderSection(onOpenSetup);
    fireEvent.click(screen.getByRole('button', { name: /open setup guide/i }));
    expect(onOpenSetup).toHaveBeenCalledOnce();
  });
});

describe('ProvidersSection expanded provider features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { ...DEFAULT_SETTINGS, providers: [makeProvider()], updateSettings };
  });

  it('shows the catalog picker when a provider is expanded', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    expect(screen.getByText('Provider template')).toBeInTheDocument();
  });

  it('shows browse models control when a provider is expanded', async () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI'));

    expect(screen.getByRole('button', { name: /browse models/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /browse models/i }));

    await waitFor(() => {
      expect(screen.getByText('gpt-4o-mini')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });
    expect(listProviderModels).toHaveBeenCalled();
  });

  it('shows temperature and max tokens sliders when expanded', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    expect(screen.getByText(/temperature/i)).toBeInTheDocument();
    expect(screen.getByText(/max tokens/i)).toBeInTheDocument();
  });

  it('shows step-by-step progress while testing provider connection', async () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI'));

    // Provider-level test lives in the "Test connection" panel (after sliders).
    const testButtons = screen.getAllByRole('button', { name: /^test$/i });
    const providerTestButton = testButtons[testButtons.length - 1];
    if (!providerTestButton) throw new Error('Expected provider test button');
    fireEvent.click(providerTestButton);

    await waitFor(() => {
      expect(screen.getByText('Reachability')).toBeInTheDocument();
      expect(screen.getByText('Model listing')).toBeInTheDocument();
      expect(screen.getByText('Translation')).toBeInTheDocument();
    });
    expect(testConnection).toHaveBeenCalled();
  });

  it('shows step-by-step progress while testing a key', async () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI'));

    const keyTestButton = screen.getAllByRole('button', { name: /^test$/i })[0];
    if (!keyTestButton) throw new Error('Expected key test button');
    fireEvent.click(keyTestButton);

    await waitFor(() => {
      expect(screen.getByText('Key connection successful.')).toBeInTheDocument();
    });
    expect(testConnection).toHaveBeenCalled();
  });

  it('updates temperature when the slider changes', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    const tempSlider = screen.getByRole('slider', { name: /temperature/i });
    fireEvent.change(tempSlider, { target: { value: '1.5' } });

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ temperature: 1.5 }),
        ]),
      }),
    );
  });
});

describe('ProvidersSection key row — keyless & get-key link', () => {
  it('shows "No key required" for a keyless provider (Ollama)', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        requiresApiKey: false,
        displayName: 'Ollama',
        baseUrl: 'http://localhost:11434/v1',
        keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
      })],
      updateSettings,
    };
    renderSection();
    fireEvent.click(screen.getByText('Ollama'));
    expect(screen.getByText('No key required for this provider')).toBeInTheDocument();
  });

  it('shows a Get-a-key link for a keyed catalog provider (OpenRouter)', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        displayName: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        catalogId: 'openrouter',
      })],
      updateSettings,
    };
    renderSection();
    fireEvent.click(screen.getByText('OpenRouter'));
    const link = screen.getByText('Get a key');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', 'https://openrouter.ai/keys');
  });

  it('does not show a Get-a-key link for unknown base URLs', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        displayName: 'Custom Prov',
        baseUrl: 'https://api.unknown.com/v1',
      })],
      updateSettings,
    };
    renderSection();
    fireEvent.click(screen.getByText('Custom Prov'));
    expect(screen.queryByText('Get a key')).not.toBeInTheDocument();
  });

  it('uses the catalog placeholder for the API key input', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        displayName: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        catalogId: 'groq',
      })],
      updateSettings,
    };
    renderSection();
    fireEvent.click(screen.getByText('Groq'));
    expect(screen.getByPlaceholderText('gsk_...')).toBeInTheDocument();
  });

  it('shows a disabled-Test reason hint when API key is empty', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
      })],
      updateSettings,
    };
    renderSection();
    fireEvent.click(screen.getByText('OpenAI'));
    expect(screen.getByText('Enter an API key to test this key.')).toBeInTheDocument();
  });

  it('does not show the key Test hint for keyless providers', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        requiresApiKey: false,
        displayName: 'Ollama',
        baseUrl: 'http://localhost:11434/v1',
        keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
      })],
      updateSettings,
    };
    renderSection();
    fireEvent.click(screen.getByText('Ollama'));
    expect(screen.queryByText('Enter an API key to test this key.')).not.toBeInTheDocument();
  });
});

describe('ProvidersSection persisted test status & bulk test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { ...DEFAULT_SETTINGS, providers: [makeProvider()], updateSettings };
  });

  it('writes lastTestResult to the key after a key test', async () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI'));

    const keyTestButton = screen.getAllByRole('button', { name: /^test$/i })[0];
    if (!keyTestButton) throw new Error('Expected key test button');
    fireEvent.click(keyTestButton);

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.arrayContaining([
            expect.objectContaining({
              keys: expect.arrayContaining([
                expect.objectContaining({
                  lastTestResult: expect.objectContaining({ success: true }),
                }),
              ]),
            }),
          ]),
        }),
      );
    });
  });

  it('writes lastTestResult to the provider after a provider test', async () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI'));

    const testButtons = screen.getAllByRole('button', { name: /^test$/i });
    const providerTestButton = testButtons[testButtons.length - 1];
    if (!providerTestButton) throw new Error('Expected provider test button');
    fireEvent.click(providerTestButton);

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          providers: expect.arrayContaining([
            expect.objectContaining({
              lastTestResult: expect.objectContaining({ success: true }),
            }),
          ]),
        }),
      );
    });
  });

  it('shows a status dot in the collapsed header when a key has lastTestResult', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        keys: [{
          id: 'k1',
          apiKey: 'sk-test',
          maxRpm: 0,
          enabled: true,
          lastTestResult: { success: true, at: Date.now(), latencyMs: 100 },
        }],
      })],
      updateSettings,
    };
    renderSection();
    const dot = screen.getByTitle(/Verified/);
    expect(dot).toHaveClass('bg-emerald-500');
  });

  it('shows a failed status dot when all keys failed', () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        keys: [{
          id: 'k1',
          apiKey: 'sk-test',
          maxRpm: 0,
          enabled: true,
          lastTestResult: { success: false, at: Date.now(), error: 'timeout' },
        }],
      })],
      updateSettings,
    };
    renderSection();
    const dot = screen.getByTitle(/Failed/);
    expect(dot).toHaveClass('bg-red-500');
  });

  it('does not show a status dot when no keys have been tested', () => {
    renderSection();
    expect(screen.queryByTitle(/Verified|Failed/)).not.toBeInTheDocument();
  });

  it('shows a Test all keys button when enabled keys exist', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /test all keys/i })).toBeInTheDocument();
  });

  it('runs Test all keys and aggregates results', async () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        keys: [
          { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true, label: 'prod' },
          { id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true, label: 'staging' },
        ],
      })],
      updateSettings,
    };
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /test all keys/i }));

    await waitFor(() => {
      // Should have called testConnection at least once per key
      expect(testConnection).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ProvidersSection system prompt template', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { ...DEFAULT_SETTINGS, providers: [makeProvider()], updateSettings };
  });

  it('renders the system prompt template editor', () => {
    renderSection();
    expect(screen.getByText('System Prompt Template')).toBeInTheDocument();
  });

  it('updates customSystemPrompt when the textarea changes', () => {
    renderSection();
    const promptTextarea = document.getElementById('providers-system-prompt') as HTMLTextAreaElement;
    expect(promptTextarea).toBeTruthy();
    fireEvent.change(promptTextarea, { target: { value: 'Translate to {{targetLanguage}} please' } });

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ customSystemPrompt: 'Translate to {{targetLanguage}} please' }),
    );
  });

  it('resets the prompt to default when Reset button is clicked', () => {
    renderSection();
    const resetBtn = screen.getByRole('button', { name: /reset to default/i });
    fireEvent.click(resetBtn);

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ customSystemPrompt: null }),
    );
  });
});

describe('getPoolReadiness / countEnabledKeys', () => {
  it('counts only enabled keys with a non-empty apiKey in enabled providers', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        makeProvider({
          enabled: true,
          keys: [
            { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true },
            { id: 'k2', apiKey: '', maxRpm: 0, enabled: true }, // empty key, not counted
            { id: 'k3', apiKey: 'sk-3', maxRpm: 0, enabled: false }, // disabled, not counted
          ],
        }),
        makeProvider({
          id: 'p2',
          enabled: false, // disabled provider
          keys: [{ id: 'k4', apiKey: 'sk-4', maxRpm: 0, enabled: true }],
        }),
      ],
    };
    expect(countEnabledKeys(settings)).toBe(1); // only k1
  });

  it('returns not-configured when no providers exist', () => {
    const r = getPoolReadiness({ ...DEFAULT_SETTINGS, providers: [] });
    expect(r.status).toBe('not-configured');
    expect(r.enabledKeyCount).toBe(0);
  });

  it('returns not-configured when providers exist but no enabled keys', () => {
    const r = getPoolReadiness({
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({ keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }] })],
    });
    expect(r.status).toBe('not-configured');
  });

  it('returns ready when at least one enabled key with apiKey exists', () => {
    const r = getPoolReadiness({
      ...DEFAULT_SETTINGS,
      providers: [makeProvider()],
    });
    expect(r.status).toBe('ready');
    expect(r.enabledKeyCount).toBeGreaterThanOrEqual(1);
  });
});
