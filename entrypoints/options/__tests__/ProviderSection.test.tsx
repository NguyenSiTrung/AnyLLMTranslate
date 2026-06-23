import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProviderSection } from '../sections/ProviderSection';
import { DEFAULT_SETTINGS } from '@/types/config';
import { ToastProvider } from '@/ui/ToastProvider';

const updateSettings = vi.fn();
const updateProvider = vi.fn();

let mockState = {
  ...DEFAULT_SETTINGS,
  updateSettings,
  updateProvider,
};

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector?: (state: typeof mockState) => unknown) => (
    selector ? selector(mockState) : mockState
  ),
}));

vi.mock('@/services/providerTester', () => ({
  testConnection: vi.fn(),
  listProviderModels: vi.fn(async () => ({ success: true, models: [], latencyMs: 0 })),
}));

function renderSection(onOpenSetup = vi.fn()) {
  render(
    <ToastProvider>
      <ProviderSection onOpenSetup={onOpenSetup} />
    </ToastProvider>,
  );
  return onOpenSetup;
}

describe('ProviderSection readiness banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      ...DEFAULT_SETTINGS,
      updateSettings,
      updateProvider,
    };
  });

  it('shows not configured guidance for empty provider fields', () => {
    renderSection();

    expect(screen.getByText(/provider not ready/i)).toBeInTheDocument();
    expect(screen.getByText(/api base url/i)).toBeInTheDocument();
  });

  it('shows connected state when provider test succeeded', () => {
    mockState = {
      ...mockState,
      provider: {
        ...mockState.provider,
        baseUrl: 'http://localhost:11434/v1',
        model: 'gemma3:4b',
        connectionStatus: 'success',
      },
    };

    renderSection();

    expect(screen.getByText(/provider connected/i)).toBeInTheDocument();
  });

  it('calls setup guide callback', () => {
    const onOpenSetup = renderSection();

    fireEvent.click(screen.getByRole('button', { name: /open setup guide/i }));

    expect(onOpenSetup).toHaveBeenCalledOnce();
  });

  it('marks connection as untested when provider fields change', () => {
    mockState = {
      ...mockState,
      provider: {
        ...mockState.provider,
        baseUrl: 'http://localhost:11434/v1',
        model: 'gemma3:4b',
        connectionStatus: 'success',
      },
    };

    renderSection();

    fireEvent.change(screen.getByLabelText(/base url/i), {
      target: { value: 'http://localhost:11435/v1' },
    });

    expect(updateProvider).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:11435/v1',
      connectionStatus: 'unknown',
    });
  });
});
