/**
 * Tests for ProvidersSection — multi-provider pool manager UI.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('@/services/providerTester', () => ({
  testConnection: vi.fn(async () => ({ overall: true, steps: [] })),
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

  it('reveals and hides the API key via the Show/Hide button', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    const showBtn = screen.getByText('Show');
    fireEvent.click(showBtn);
    expect(screen.getByText('Hide')).toBeInTheDocument();
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

  it('shows temperature and max tokens sliders when expanded', () => {
    renderSection();
    fireEvent.click(screen.getByText('OpenAI')); // expand
    expect(screen.getByText(/temperature/i)).toBeInTheDocument();
    expect(screen.getByText(/max tokens/i)).toBeInTheDocument();
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
