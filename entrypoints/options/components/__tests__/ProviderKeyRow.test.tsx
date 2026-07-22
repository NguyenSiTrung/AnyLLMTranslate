/**
 * ProviderKeyRow — rate limits summary strip + presets + slim overflow menu.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ToastProvider } from '@/ui/ToastProvider';
import { ProviderKeyRow } from '../ProviderKeyRow';
import type { PoolKey, PoolProvider } from '@/types/config';
import type { KeyChipView } from '@/lib/poolDashboardStatus';

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  },
});

function sampleProvider(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'p1',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'test-model',
    requiresApiKey: true,
    catalogId: 'openrouter',
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
    ...overrides,
  };
}

function sampleKey(overrides: Partial<PoolKey> = {}): PoolKey {
  return {
    id: 'k1',
    apiKey: 'sk-test',
    maxRpm: 20,
    concurrencyLimit: 1,
    interval: 500,
    enabled: true,
    ...overrides,
  };
}

const chip: KeyChipView = {
  keyId: 'k1',
  kind: 'healthy',
  label: 'OK',
  title: 'Healthy',
};

function renderRow(
  opts: {
    provider?: Partial<PoolProvider>;
    poolKey?: PoolKey;
    onUpdate?: ReturnType<typeof vi.fn>;
    onRemove?: ReturnType<typeof vi.fn>;
    onMove?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onUpdate = opts.onUpdate ?? vi.fn();
  const onRemove = opts.onRemove ?? vi.fn();
  const poolKey = opts.poolKey ?? sampleKey();
  render(
    <ToastProvider>
      <ProviderKeyRow
        provider={sampleProvider(opts.provider)}
        poolKey={poolKey}
        targetLanguage="vi"
        chip={chip}
        displayIndex={1}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onMove={opts.onMove}
      />
    </ToastProvider>,
  );
  return { onUpdate, onRemove };
}

describe('ProviderKeyRow API key field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('always shows API key input when requiresApiKey is true', () => {
    renderRow();
    expect(screen.getByLabelText(/^API key$/i)).toBeInTheDocument();
    expect(screen.queryByText(/No key required/i)).not.toBeInTheDocument();
  });

  it('still shows optional API key input when requiresApiKey is false (custom/local)', () => {
    renderRow({
      provider: {
        displayName: 'Custom endpoint',
        baseUrl: 'https://proxy.example.com/v1',
        requiresApiKey: false,
        catalogId: 'custom',
      },
      poolKey: sampleKey({ apiKey: '' }),
    });
    const input = screen.getByLabelText(/^API key$/i);
    expect(input).toBeInTheDocument();
    expect(
      screen.getByText(/Optional — leave blank for local or unauthenticated endpoints/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No key required/i)).not.toBeInTheDocument();
  });
});

describe('ProviderKeyRow rate limits UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('collapsed summary expands; Balanced/Custom/Reset presets; overflow menu', () => {
    const { onUpdate } = renderRow({ onMove: vi.fn() });

    expect(
      screen.getByRole('button', {
        name: /Rate limits.*20\/min · 1 at once · 500 ms gap/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Max rate/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    expect(screen.getByLabelText(/Max rate/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Safe$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Balanced$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Aggressive$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Unlimited$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /^Balanced$/i }));
    expect(onUpdate).toHaveBeenCalledWith({
      maxRpm: 40,
      concurrencyLimit: 2,
      interval: 250,
    });

    expect(screen.queryByText(/Advanced limits/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hide limits/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Move up/i)).toBeInTheDocument();
    expect(screen.getByText(/Remove/i)).toBeInTheDocument();

    cleanup();
    renderRow({
      poolKey: sampleKey({ maxRpm: 15, concurrencyLimit: 1, interval: 500 }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    expect(screen.getByText(/^Custom$/i)).toBeInTheDocument();

    cleanup();
    const { onUpdate: onUpdateReset } = renderRow({
      poolKey: sampleKey({ maxRpm: 0, concurrencyLimit: 0, interval: 0 }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    fireEvent.click(screen.getByRole('button', { name: /Reset to Safe/i }));
    expect(onUpdateReset).toHaveBeenCalledWith({
      maxRpm: 20,
      concurrencyLimit: 1,
      interval: 500,
    });
  });
});
