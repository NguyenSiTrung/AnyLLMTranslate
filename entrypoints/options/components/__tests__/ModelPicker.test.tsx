/**
 * ModelPicker — browse list shows full models with search (no 24-chip cap).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ModelPicker } from '../ModelPicker';
import type { ProviderConfig } from '@/types/config';

vi.mock('@/services/providerTester', () => ({
  listProviderModels: vi.fn(),
}));

import { listProviderModels } from '@/services/providerTester';

const listProviderModelsMock = vi.mocked(listProviderModels);

function baseProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    preset: 'custom',
    displayName: 'Test',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'sk-test',
    model: 'openai/gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 1024,
    requiresApiKey: true,
    connectionStatus: 'unknown',
    ...overrides,
  };
}

describe('ModelPicker', () => {
  beforeEach(() => {
    listProviderModelsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows all browsed models without truncating to 24 and filters by search', async () => {
    const models = Array.from({ length: 30 }, (_, i) => `provider/model-${i}`);
    listProviderModelsMock.mockResolvedValue({
      success: true,
      models,
      latencyMs: 10,
    });

    const onModelChange = vi.fn();
    render(
      <ModelPicker provider={baseProvider()} onModelChange={onModelChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /browse models/i }));

    await waitFor(() => {
      expect(screen.getByText('30 models')).toBeInTheDocument();
    });

    // Full list present (including past the old 24 cap)
    expect(screen.getByRole('option', { name: 'provider/model-0' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'provider/model-29' })).toBeInTheDocument();

    const search = screen.getByLabelText('Search models');
    fireEvent.change(search, { target: { value: 'model-29' } });

    expect(screen.getByText('1 of 30 models')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'provider/model-29' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'provider/model-0' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'provider/model-29' }));
    expect(onModelChange).toHaveBeenCalledWith('provider/model-29');
  });

  it('shows error when browse fails', async () => {
    listProviderModelsMock.mockResolvedValue({
      success: false,
      models: [],
      error: 'HTTP 401: Failed to list models',
      latencyMs: 5,
    });

    render(
      <ModelPicker provider={baseProvider()} onModelChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /browse models/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('HTTP 401');
    });
  });
});
