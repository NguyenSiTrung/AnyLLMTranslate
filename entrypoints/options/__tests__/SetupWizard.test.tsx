import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SetupWizard } from '../SetupWizard';
import { DEFAULT_SETTINGS } from '@/types/config';
import { ToastProvider } from '@/ui/ToastProvider';

const updateSettings = vi.fn();
const updateProvider = vi.fn();
const onClose = vi.fn();
const onTranslateCurrentPage = vi.fn();

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
  listProviderModels: vi.fn(async () => ({ success: true, models: [], latencyMs: 0 })),
  testConnection: vi.fn(async (_provider, onProgress) => {
    onProgress?.({ name: 'ping', success: true, latencyMs: 10 }, 0);
    onProgress?.({ name: 'models', success: true, latencyMs: 12, data: ['gemma3:4b'] }, 1);
    onProgress?.({ name: 'translation', success: true, latencyMs: 20, data: 'Xin chào' }, 2);
    return {
      overall: true,
      steps: [
        { name: 'ping', success: true, latencyMs: 10 },
        { name: 'models', success: true, latencyMs: 12, data: ['gemma3:4b'] },
        { name: 'translation', success: true, latencyMs: 20, data: 'Xin chào' },
      ],
      models: ['gemma3:4b'],
      translationSample: 'Xin chào',
      totalLatencyMs: 42,
    };
  }),
}));

function renderWizard() {
  return render(
    <ToastProvider>
      <SetupWizard
        open
        onClose={onClose}
        onTranslateCurrentPage={onTranslateCurrentPage}
      />
    </ToastProvider>,
  );
}

describe('SetupWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      ...DEFAULT_SETTINGS,
      provider: {
        ...DEFAULT_SETTINGS.provider,
        baseUrl: 'http://localhost:11434/v1',
        model: 'gemma3:4b',
      },
      updateSettings,
      updateProvider,
    };
  });

  it('persists skipped onboarding from the welcome step', async () => {
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        onboarding: { completed: false, skipped: true, lastStep: 'welcome' },
      });
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('tests the provider and completes onboarding after target language selection', async () => {
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: /start setup/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue to test/i }));
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

    await screen.findByText(/connection successful/i);

    fireEvent.click(screen.getByRole('button', { name: /choose language/i }));
    fireEvent.change(screen.getByLabelText(/target language/i), { target: { value: 'ja' } });
    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        targetLanguage: 'ja',
        onboarding: { completed: true, skipped: false, lastStep: 'done' },
      });
    });
    expect(screen.getByText(/you're ready to translate/i)).toBeInTheDocument();
  });
});
