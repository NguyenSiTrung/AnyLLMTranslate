/**
 * ProviderKeyRow — rate limits summary strip + presets + slim overflow menu.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
        provider={sampleProvider()}
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

describe('ProviderKeyRow rate limits UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows collapsed rate limits summary for Safe defaults', () => {
    renderRow();
    expect(
      screen.getByRole('button', {
        name: /Rate limits.*20\/min · 1 at once · 500 ms gap/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Max rate/i)).not.toBeInTheDocument();
  });

  it('expands fine-tune fields and presets on summary click', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    expect(screen.getByLabelText(/Max rate/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Safe$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Balanced$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Aggressive$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Unlimited$/i })).toBeInTheDocument();
  });

  it('applies Balanced preset via onUpdate', () => {
    const { onUpdate } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    fireEvent.click(screen.getByRole('radio', { name: /^Balanced$/i }));
    expect(onUpdate).toHaveBeenCalledWith({
      maxRpm: 40,
      concurrencyLimit: 2,
      interval: 250,
    });
  });

  it('shows Custom when values match no preset', () => {
    renderRow({
      poolKey: sampleKey({ maxRpm: 15, concurrencyLimit: 1, interval: 500 }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    expect(screen.getByText(/^Custom$/i)).toBeInTheDocument();
  });

  it('Reset to Safe commits Safe values', () => {
    const { onUpdate } = renderRow({
      poolKey: sampleKey({ maxRpm: 0, concurrencyLimit: 0, interval: 0 }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Rate limits/i }));
    fireEvent.click(screen.getByRole('button', { name: /Reset to Safe/i }));
    expect(onUpdate).toHaveBeenCalledWith({
      maxRpm: 20,
      concurrencyLimit: 1,
      interval: 500,
    });
  });

  it('overflow menu has Move/Remove but not Advanced limits', () => {
    renderRow({ onMove: vi.fn() });
    expect(screen.queryByText(/Advanced limits/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hide limits/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Move up/i)).toBeInTheDocument();
    expect(screen.getByText(/Remove/i)).toBeInTheDocument();
  });
});
