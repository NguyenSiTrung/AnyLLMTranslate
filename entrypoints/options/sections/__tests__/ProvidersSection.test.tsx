/**
 * ProvidersSection ops dashboard shell smoke tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DEFAULT_SETTINGS, type PoolProvider } from '@/types/config';
import { ToastProvider } from '@/ui/ToastProvider';

const mockStorageData: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorageData[key] })),
      set: vi.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorageData, data);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true, statuses: {} }),
  },
});

import { useSettingsStore } from '@/stores/settingsStore';
import { ProvidersSection } from '../ProvidersSection';

function sampleProvider(): PoolProvider {
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
    keys: [
      {
        id: 'k1',
        apiKey: 'sk-test',
        maxRpm: 0,
        concurrencyLimit: 0,
        interval: 0,
        enabled: true,
        lastTestResult: { success: true, at: Date.now(), latencyMs: 100 },
      },
    ],
  };
}

function renderSection() {
  return render(
    <ToastProvider>
      <ProvidersSection />
    </ToastProvider>,
  );
}

describe('ProvidersSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      providers: [],
      targetLanguage: 'vi',
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('empty hero, configured list, and Edit opens drawer', () => {
    const { unmount } = renderSection();
    expect(screen.getByText(/Connect your first LLM/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add provider/i })).toBeInTheDocument();
    unmount();

    useSettingsStore.setState({ providers: [sampleProvider()] });
    renderSection();
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(screen.getByText(/preferred in rotation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test all keys/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
    expect(screen.getByRole('dialog', { name: 'OpenRouter' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Connection' })).toBeInTheDocument();
  });
});
