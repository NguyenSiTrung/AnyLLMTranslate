// @vitest-environment jsdom
/**
 * SetupWizard integration: skip, advance, finish onboarding.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
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
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
  },
});

vi.mock('@/services/providerTester', () => ({
  testConnection: vi.fn(async (_p, onStep?: (s: unknown) => void) => {
    onStep?.({ name: 'ping', success: true, latencyMs: 1 });
    onStep?.({ name: 'models', success: true, latencyMs: 1 });
    onStep?.({ name: 'translation', success: true, latencyMs: 1 });
    return {
      overall: true,
      steps: [
        { name: 'ping', success: true, latencyMs: 1 },
        { name: 'models', success: true, latencyMs: 1 },
        { name: 'translation', success: true, latencyMs: 1 },
      ],
    };
  }),
}));

import { useSettingsStore } from '@/stores/settingsStore';
import { SetupWizard } from '../SetupWizard';
import { PRIVACY_POLICY_VERSION } from '@/lib/privacyConsent';

/** Consent already recorded — these cases exercise the post-disclosure flow. */
const ACCEPTED_CONSENT = {
  accepted: true,
  acceptedAt: 1,
  version: PRIVACY_POLICY_VERSION,
};

function renderWizard(
  props: Partial<React.ComponentProps<typeof SetupWizard>> = {},
) {
  return render(
    <ToastProvider>
      <SetupWizard open onClose={props.onClose ?? vi.fn()} {...props} />
    </ToastProvider>,
  );
}

describe('SetupWizard', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      onboarding: { completed: false, skipped: false, lastStep: 'welcome' },
      privacyConsent: { ...ACCEPTED_CONSENT },
      targetLanguage: 'en',
      providers: [],
    });
    for (const k of Object.keys(mockStorageData)) {
      Reflect.deleteProperty(mockStorageData, k);
    }
    vi.clearAllMocks();
  });

  it('persists skipped onboarding from the welcome step', async () => {
    const onClose = vi.fn();
    renderWizard({ onClose });

    // Footer Skip opens confirm
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));
    // Confirm dialog secondary Skip
    const skipButtons = screen.getAllByRole('button', { name: /Skip for now/i });
    fireEvent.click(skipButtons[skipButtons.length - 1]);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    const onboarding = useSettingsStore.getState().onboarding;
    expect(onboarding.skipped).toBe(true);
    expect(onboarding.completed).toBe(false);
  });

  it('opens on the disclosure and records consent before any setup when none is recorded', async () => {
    // Start with no consent recorded, which is the state a first-run user is in.
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      onboarding: { completed: false, skipped: false, lastStep: 'welcome' },
      privacyConsent: { ...DEFAULT_SETTINGS.privacyConsent },
    });

    renderWizard();

    // The wizard lands on the disclosure rather than the welcome screen.
    await waitFor(() => {
      expect(screen.getByText(/What leaves your browser/i)).toBeInTheDocument();
    });

    // The accept action is gated on the checkbox.
    expect(screen.getByRole('button', { name: /Accept and continue/i })).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/I understand and agree/i));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Accept and continue/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Accept and continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/Choose where translations run/i)).toBeInTheDocument();
    });
    expect(useSettingsStore.getState().onboarding.lastStep).toBe('connect');
    expect(useSettingsStore.getState().privacyConsent.accepted).toBe(true);
  });

  it('advances welcome → connect on Get started, and finishes setup from verify when connected', async () => {
    // facet: advances welcome → connect on Get started once consent is recorded
    const welcome = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Get started/i }));
    await waitFor(() => {
      expect(screen.getByText(/Choose where translations run/i)).toBeInTheDocument();
    });
    expect(useSettingsStore.getState().onboarding.lastStep).toBe('connect');
    welcome.unmount();

    // facet: an unaccepted disclosure outranks a deep-linked step
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      onboarding: { completed: false, skipped: false, lastStep: 'verify' },
      privacyConsent: { ...DEFAULT_SETTINGS.privacyConsent },
      provider: {
        ...DEFAULT_SETTINGS.provider,
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'test-model',
        apiKey: 'sk-test',
        requiresApiKey: true,
        connectionStatus: 'success',
      },
    });

    const deepLink = renderWizard({ forceEntryStep: 'verify' });
    await waitFor(() => {
      expect(screen.getByText(/What leaves your browser/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Prove the connection/i)).not.toBeInTheDocument();
    deepLink.unmount();

    // facet: finishes setup from verify when previously connected
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      onboarding: { completed: false, skipped: false, lastStep: 'verify' },
      privacyConsent: { ...ACCEPTED_CONSENT },
      targetLanguage: 'vi',
      provider: {
        ...DEFAULT_SETTINGS.provider,
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'test-model',
        apiKey: 'sk-test',
        requiresApiKey: true,
        displayName: 'OpenRouter',
        connectionStatus: 'success',
      },
    });

    renderWizard({ forceEntryStep: 'verify' });

    await waitFor(() => {
      expect(screen.getByText(/Prove the connection/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Finish setup/i }));

    await waitFor(() => {
      const onboarding = useSettingsStore.getState().onboarding;
      expect(onboarding.completed).toBe(true);
      expect(onboarding.lastStep).toBe('ready');
    });
    expect(screen.getByText(/ready to translate/i)).toBeInTheDocument();
  });
});
