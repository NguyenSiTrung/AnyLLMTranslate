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
    keys: [{ id: 'k1', apiKey: 'sk-test', maxRpm: 60, concurrencyLimit: 0, interval: 0,enabled: true, label: 'prod' }],
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
    // Key count is now rendered as an icon + number cluster
    expect(screen.getByText('1')).toBeInTheDocument();
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
    // FR-10: text inputs commit on blur, not per keystroke.
    fireEvent.blur(baseUrlInput);

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ baseUrl: 'https://new.example.com/v1' }),
        ]),
      }),
    );
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

  it('writes the store ONCE on blur for the API key', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI'));
    const keyInput = screen.getByPlaceholderText('sk-...');
    fireEvent.change(keyInput, { target: { value: 'sk-new-key' } });
    fireEvent.blur(keyInput);
    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            keys: expect.arrayContaining([expect.objectContaining({ apiKey: 'sk-new-key' })]),
          }),
        ]),
      }),
    );
  });
});

describe('ProvidersSection readiness banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { ...DEFAULT_SETTINGS, providers: [makeProvider()], updateSettings };
  });

  it('shows pool-ready status and no "Next:" prefix when a healthy provider key exists', () => {
    renderSection();
    expect(screen.getByText(/provider pool ready/i)).toBeInTheDocument();
    expect(screen.queryByText(/Next:/)).not.toBeInTheDocument();
  });
});

describe('ProvidersSection persisted test status & bulk test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = { ...DEFAULT_SETTINGS, providers: [makeProvider()], updateSettings };
  });

  it('runs Test all keys and aggregates results', async () => {
    mockState = {
      ...DEFAULT_SETTINGS,
      providers: [makeProvider({
        keys: [
          { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true, label: 'prod' },
          { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true, label: 'staging' },
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

describe('getPoolReadiness / countEnabledKeys', () => {
  it('returns ready when at least one enabled key with apiKey exists', () => {
    const r = getPoolReadiness({
      ...DEFAULT_SETTINGS,
      providers: [makeProvider()],
    });
    expect(r.status).toBe('ready');
    expect(r.enabledKeyCount).toBeGreaterThanOrEqual(1);
  });

  it('counts only enabled keys with a non-empty apiKey in enabled providers', () => {
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        makeProvider({
          enabled: true,
          keys: [
            { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true },
            { id: 'k2', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true }, // empty key, not counted
            { id: 'k3', apiKey: 'sk-3', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: false }, // disabled, not counted
          ],
        }),
        makeProvider({
          id: 'p2',
          enabled: false, // disabled provider
          keys: [{ id: 'k4', apiKey: 'sk-4', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true }],
        }),
      ],
    };
    expect(countEnabledKeys(settings)).toBe(1); // only k1
  });
});
