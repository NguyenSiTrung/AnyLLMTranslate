# New-User Success Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build hybrid first-run onboarding and provider recovery UX so new users can configure a provider, test it, choose a target language, and recover from incomplete setup.

**Architecture:** Add onboarding state to persisted settings, centralize provider-readiness classification in a small helper, then reuse that helper from Options and popup. The wizard lives in the Options entrypoint and is opened automatically on first run or by popup recovery CTAs; the popup remains lightweight by showing recovery cards and opening Options with a setup query parameter.

**Tech Stack:** React 19, TypeScript, WXT, Zustand/chrome.storage settings, shared UI components, Vitest + Testing Library.

---

## File Structure

- `types/config.ts` — add `OnboardingState`, default onboarding values, and `ExtensionSettings.onboarding`.
- `stores/settingsStore.ts` — include onboarding in `extractSettings()` so updates persist across contexts.
- `lib/providerReadiness.ts` — new pure helper that classifies provider readiness and maps failures to actionable user-facing copy.
- `tests/unit/providerReadiness.test.ts` — pure unit tests for readiness classification and failure messages.
- `entrypoints/options/SetupWizard.tsx` — new modal-style setup wizard that edits provider settings, runs `testConnection()`, sets target language, and persists onboarding state.
- `entrypoints/options/__tests__/SetupWizard.test.tsx` — component tests for first-run skip and completion behavior.
- `entrypoints/options/sections/ProviderSection.tsx` — add readiness banner and setup-guide CTA.
- `entrypoints/options/__tests__/ProviderSection.test.tsx` — test readiness banner copy and setup CTA.
- `entrypoints/options/App.tsx` — own wizard visibility; auto-open for first-run users; open from `?setup=1` or `#setup`.
- `entrypoints/popup/App.tsx` — show provider recovery card instead of the translate hero when provider is missing/failed/untested; open Options setup flow.
- `entrypoints/popup/__tests__/App.test.tsx` — popup tests for recovery card and normal translate action.

---

### Task 1: Add Onboarding State and Provider Readiness Helper

**Files:**
- Modify: `types/config.ts`
- Modify: `stores/settingsStore.ts`
- Create: `lib/providerReadiness.ts`
- Test: `tests/unit/providerReadiness.test.ts`

- [ ] **Step 1: Write the failing provider-readiness tests**

Create `tests/unit/providerReadiness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types/config';
import type { ProviderConfig } from '@/types/config';
import {
  getProviderReadiness,
  getProviderRecoveryMessage,
  getConnectionErrorMessage,
} from '@/lib/providerReadiness';

function provider(partial: Partial<ProviderConfig>): ProviderConfig {
  return {
    ...DEFAULT_SETTINGS.provider,
    ...partial,
  };
}

describe('getProviderReadiness', () => {
  it('classifies missing base URL as not-configured', () => {
    const result = getProviderReadiness(provider({ baseUrl: '', model: 'gpt-4o-mini' }));

    expect(result.status).toBe('not-configured');
    expect(result.reason).toBe('missing-base-url');
    expect(result.canTest).toBe(false);
  });

  it('classifies missing model as not-configured', () => {
    const result = getProviderReadiness(provider({ baseUrl: 'https://api.example.com/v1', model: '' }));

    expect(result.status).toBe('not-configured');
    expect(result.reason).toBe('missing-model');
    expect(result.canTest).toBe(false);
  });

  it('classifies missing required API key as not-configured', () => {
    const result = getProviderReadiness(provider({
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
      requiresApiKey: true,
      apiKey: '',
    }));

    expect(result.status).toBe('not-configured');
    expect(result.reason).toBe('missing-api-key');
    expect(result.canTest).toBe(false);
  });

  it('classifies complete untested fields as untested', () => {
    const result = getProviderReadiness(provider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'gemma3:4b',
      connectionStatus: 'unknown',
    }));

    expect(result.status).toBe('untested');
    expect(result.reason).toBe('needs-test');
    expect(result.canTest).toBe(true);
  });

  it('classifies successful connection status as connected', () => {
    const result = getProviderReadiness(provider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'gemma3:4b',
      connectionStatus: 'success',
    }));

    expect(result.status).toBe('connected');
    expect(result.canTranslate).toBe(true);
  });

  it('classifies failed connection status as failed but testable', () => {
    const result = getProviderReadiness(provider({
      baseUrl: 'http://localhost:11434/v1',
      model: 'gemma3:4b',
      connectionStatus: 'error',
    }));

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('connection-failed');
    expect(result.canTest).toBe(true);
    expect(result.canTranslate).toBe(false);
  });
});

describe('provider recovery messages', () => {
  it('explains missing API key actionably', () => {
    const readiness = getProviderReadiness(provider({
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o-mini',
      requiresApiKey: true,
      apiKey: '',
    }));

    expect(getProviderRecoveryMessage(readiness).title).toBe('Provider not ready');
    expect(getProviderRecoveryMessage(readiness).description).toContain('API key');
    expect(getProviderRecoveryMessage(readiness).action).toBe('Enter your API key');
  });

  it('maps timeout errors to retry guidance', () => {
    const message = getConnectionErrorMessage('The operation timed out after 60000ms');

    expect(message.title).toBe('Connection timed out');
    expect(message.action).toContain('timeout');
  });

  it('maps model not found errors to model guidance', () => {
    const message = getConnectionErrorMessage('HTTP 404: model not found');

    expect(message.title).toBe('Model not found');
    expect(message.action).toContain('model');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx -y pnpm@latest exec vitest run tests/unit/providerReadiness.test.ts
```

Expected: FAIL with an import error for `@/lib/providerReadiness`.

- [ ] **Step 3: Add onboarding types and defaults**

In `types/config.ts`, add this interface near the provider config types:

```ts
/** Onboarding flow state for first-run setup */
export interface OnboardingState {
  /** Setup wizard completed successfully */
  completed: boolean;
  /** User skipped the automatic first-run wizard */
  skipped: boolean;
  /** Last wizard step visited, used to resume setup */
  lastStep?: 'welcome' | 'provider' | 'test' | 'language' | 'done';
}
```

Add this property to `ExtensionSettings` after `provider`:

```ts
  /** First-run setup wizard state */
  onboarding: OnboardingState;
```

Add this default before `DEFAULT_SETTINGS`:

```ts
/** Default onboarding state */
export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  skipped: false,
  lastStep: 'welcome',
};
```

Add this property inside `DEFAULT_SETTINGS` immediately after `provider`:

```ts
  onboarding: { ...DEFAULT_ONBOARDING_STATE },
```

- [ ] **Step 4: Include onboarding in the Zustand settings extractor**

In `stores/settingsStore.ts`, update `extractSettings()` so the returned object includes onboarding immediately after provider:

```ts
    provider: state.provider,
    onboarding: state.onboarding,
    sourceLanguage: state.sourceLanguage,
```

- [ ] **Step 5: Implement the provider-readiness helper**

Create `lib/providerReadiness.ts`:

```ts
import type { ProviderConfig } from '@/types/config';

export type ProviderReadinessStatus = 'not-configured' | 'untested' | 'connected' | 'failed';

export type ProviderReadinessReason =
  | 'missing-base-url'
  | 'missing-model'
  | 'missing-api-key'
  | 'needs-test'
  | 'connected'
  | 'connection-failed';

export interface ProviderReadiness {
  status: ProviderReadinessStatus;
  reason: ProviderReadinessReason;
  canTest: boolean;
  canTranslate: boolean;
}

export interface RecoveryMessage {
  title: string;
  description: string;
  action: string;
}

export function getProviderReadiness(provider: ProviderConfig): ProviderReadiness {
  if (!provider.baseUrl.trim()) {
    return {
      status: 'not-configured',
      reason: 'missing-base-url',
      canTest: false,
      canTranslate: false,
    };
  }

  if (!provider.model.trim()) {
    return {
      status: 'not-configured',
      reason: 'missing-model',
      canTest: false,
      canTranslate: false,
    };
  }

  if (provider.requiresApiKey && !provider.apiKey.trim()) {
    return {
      status: 'not-configured',
      reason: 'missing-api-key',
      canTest: false,
      canTranslate: false,
    };
  }

  if (provider.connectionStatus === 'success') {
    return {
      status: 'connected',
      reason: 'connected',
      canTest: true,
      canTranslate: true,
    };
  }

  if (provider.connectionStatus === 'error') {
    return {
      status: 'failed',
      reason: 'connection-failed',
      canTest: true,
      canTranslate: false,
    };
  }

  return {
    status: 'untested',
    reason: 'needs-test',
    canTest: true,
    canTranslate: false,
  };
}

export function getProviderRecoveryMessage(readiness: ProviderReadiness): RecoveryMessage {
  switch (readiness.reason) {
    case 'missing-base-url':
      return {
        title: 'Provider not ready',
        description: 'Add the API base URL for your OpenAI-compatible provider before translating.',
        action: 'Enter your API URL',
      };
    case 'missing-model':
      return {
        title: 'Provider not ready',
        description: 'Choose the model AnyLLMTranslate should use for translation requests.',
        action: 'Choose a model',
      };
    case 'missing-api-key':
      return {
        title: 'Provider not ready',
        description: 'This provider requires an API key before it can translate pages.',
        action: 'Enter your API key',
      };
    case 'needs-test':
      return {
        title: 'Test your provider',
        description: 'Your provider fields are filled in, but the connection has not been verified yet.',
        action: 'Run a connection test',
      };
    case 'connection-failed':
      return {
        title: 'Connection failed',
        description: 'The last provider test failed. Check the endpoint, model, API key, or local server.',
        action: 'Retry setup',
      };
    case 'connected':
      return {
        title: 'Provider connected',
        description: 'Your provider is ready for translation.',
        action: 'Translate page',
      };
  }
}

export function getConnectionErrorMessage(error?: string): RecoveryMessage {
  const normalized = (error ?? '').toLowerCase();

  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return {
      title: 'Connection timed out',
      description: 'The provider did not respond before the request timed out.',
      action: 'Make sure the provider is running or increase the request timeout.',
    };
  }

  if (normalized.includes('401') || normalized.includes('403') || normalized.includes('unauthorized')) {
    return {
      title: 'API key rejected',
      description: 'The provider rejected the request credentials.',
      action: 'Check your API key and provider permissions.',
    };
  }

  if (normalized.includes('404') || normalized.includes('model')) {
    return {
      title: 'Model not found',
      description: 'The configured model was not accepted by the provider.',
      action: 'Choose a model returned by the provider or check the model name.',
    };
  }

  if (normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('connection')) {
    return {
      title: 'Endpoint unreachable',
      description: 'AnyLLMTranslate could not reach the configured provider endpoint.',
      action: 'Check the base URL and confirm your local or remote provider is running.',
    };
  }

  return {
    title: 'Connection test failed',
    description: error || 'The provider returned an unexpected error.',
    action: 'Review your provider settings and try again.',
  };
}
```

- [ ] **Step 6: Run the focused test and commit**

Run:

```bash
npx -y pnpm@latest exec vitest run tests/unit/providerReadiness.test.ts
```

Expected: PASS.

Commit:

```bash
git add types/config.ts stores/settingsStore.ts lib/providerReadiness.ts tests/unit/providerReadiness.test.ts
git commit -m "feat(onboarding): add provider readiness state"
```

---

### Task 2: Build the Options Setup Wizard

**Files:**
- Create: `entrypoints/options/SetupWizard.tsx`
- Test: `entrypoints/options/__tests__/SetupWizard.test.tsx`

- [ ] **Step 1: Write the failing wizard tests**

Create `entrypoints/options/__tests__/SetupWizard.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the wizard test to verify it fails**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/options/__tests__/SetupWizard.test.tsx
```

Expected: FAIL with an import error for `../SetupWizard`.

- [ ] **Step 3: Implement the setup wizard component**

Create `entrypoints/options/SetupWizard.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Languages, Loader2, Server, XCircle, Zap } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { PROVIDER_PRESETS } from '@/types/config';
import type { OnboardingState, ProviderPreset } from '@/types/config';
import { LANGUAGES } from '@/lib/languages';
import { testConnection } from '@/services/providerTester';
import type { ConnectionTestResult, ConnectionTestStep } from '@/services/providerTester';
import { getConnectionErrorMessage } from '@/lib/providerReadiness';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FieldGroup } from '@/ui/FieldGroup';
import { Input } from '@/ui/Input';
import { Select } from '@/ui/Select';
import { useToast } from '@/ui/ToastProvider';

type WizardStep = NonNullable<OnboardingState['lastStep']>;

interface SetupWizardProps {
  open: boolean;
  onClose: () => void;
  onTranslateCurrentPage?: () => void;
}

const STEP_INDEX: Record<WizardStep, number> = {
  welcome: 1,
  provider: 2,
  test: 3,
  language: 4,
  done: 5,
};

export function SetupWizard({ open, onClose, onTranslateCurrentPage }: SetupWizardProps) {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const updateProvider = useSettingsStore((s) => s.updateProvider);
  const { error: showError, success: showSuccess } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<WizardStep>(settings.onboarding.lastStep ?? 'welcome');
  const [selectedLanguage, setSelectedLanguage] = useState(settings.targetLanguage);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testProgress, setTestProgress] = useState<ConnectionTestStep[]>([]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open, step]);

  if (!open) return null;

  const setWizardStep = async (nextStep: WizardStep) => {
    setStep(nextStep);
    await updateSettings({
      onboarding: {
        ...settings.onboarding,
        lastStep: nextStep,
      },
    });
  };

  const handleSkip = async () => {
    await updateSettings({
      onboarding: { completed: false, skipped: true, lastStep: step },
    });
    onClose();
  };

  const handlePresetChange = async (preset: ProviderPreset) => {
    const presetDef = PROVIDER_PRESETS.find((p) => p.preset === preset);
    if (!presetDef) return;
    await updateProvider({
      preset,
      baseUrl: presetDef.baseUrl,
      model: presetDef.defaultModel,
      displayName: presetDef.displayName,
      requiresApiKey: presetDef.requiresApiKey,
      connectionStatus: 'unknown',
    });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestProgress([]);

    const result = await testConnection(settings.provider, (progressStep) => {
      setTestProgress((prev) => [...prev, progressStep]);
    });

    setTestResult(result);
    setIsTesting(false);
    await updateProvider({ connectionStatus: result.overall ? 'success' : 'error' });

    if (result.overall) {
      showSuccess('Connection successful.');
    } else {
      const failedStep = result.steps.find((s) => !s.success);
      const message = getConnectionErrorMessage(failedStep?.error);
      showError(`${message.title}: ${message.action}`);
    }
  };

  const handleFinish = async () => {
    await updateSettings({
      targetLanguage: selectedLanguage,
      onboarding: { completed: true, skipped: false, lastStep: 'done' },
    });
    setStep('done');
  };

  const failedStep = testResult?.steps.find((s) => !s.success);
  const failedMessage = getConnectionErrorMessage(failedStep?.error);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" role="presentation">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="AnyLLMTranslate setup guide"
        className="w-full max-w-2xl mx-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider">Step {STEP_INDEX[step]} of 5</p>
            <h2 className="text-lg font-semibold text-zinc-100">Setup guide</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSkip}>Skip for now</Button>
        </div>

        <div className="p-6">
          {step === 'welcome' && (
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                  <Languages className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-zinc-100">Translate with your own LLM</h3>
                  <p className="text-sm text-zinc-400 mt-2 leading-6">
                    Connect Ollama or any OpenAI-compatible provider, test it, then choose your target language.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={handleSkip}>Skip for now</Button>
                <Button onClick={() => setWizardStep('provider')}>Start setup</Button>
              </div>
            </div>
          )}

          {step === 'provider' && (
            <div className="space-y-5">
              <Card title="Provider" icon={<Server className="w-4 h-4" />} variant="bordered">
                <div className="space-y-4">
                  <FieldGroup label="Provider preset">
                    <div className="grid grid-cols-2 gap-2">
                      {PROVIDER_PRESETS.map((preset) => (
                        <button
                          key={preset.preset}
                          type="button"
                          onClick={() => handlePresetChange(preset.preset)}
                          className={`text-left p-3 rounded-lg border ${settings.provider.preset === preset.preset ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-zinc-800 bg-zinc-900 text-zinc-300'}`}
                        >
                          <div className="font-medium text-sm">{preset.displayName}</div>
                          <div className="text-xs text-zinc-500 mt-1 truncate">{preset.baseUrl || 'Bring your own endpoint'}</div>
                        </button>
                      ))}
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Base URL" htmlFor="setup-base-url">
                    <Input id="setup-base-url" value={settings.provider.baseUrl} onChange={(e) => updateProvider({ baseUrl: e.target.value, connectionStatus: 'unknown' })} />
                  </FieldGroup>
                  <FieldGroup label="API Key" htmlFor="setup-api-key" description={settings.provider.requiresApiKey ? 'Required for this provider.' : 'Optional for local providers.'}>
                    <Input id="setup-api-key" type="password" value={settings.provider.apiKey} onChange={(e) => updateProvider({ apiKey: e.target.value, connectionStatus: 'unknown' })} />
                  </FieldGroup>
                  <FieldGroup label="Model" htmlFor="setup-model">
                    <Input id="setup-model" value={settings.provider.model} onChange={(e) => updateProvider({ model: e.target.value, connectionStatus: 'unknown' })} />
                  </FieldGroup>
                </div>
              </Card>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setWizardStep('welcome')}>Back</Button>
                <Button onClick={() => setWizardStep('test')}>Continue to test</Button>
              </div>
            </div>
          )}

          {step === 'test' && (
            <div className="space-y-5">
              <Card title="Test connection" icon={<Zap className="w-4 h-4" />} variant="bordered">
                <div className="space-y-4">
                  <Button onClick={handleTestConnection} loading={isTesting} icon={!isTesting ? <Zap className="w-4 h-4" /> : undefined}>
                    {isTesting ? 'Testing...' : 'Test connection'}
                  </Button>
                  {testProgress.length > 0 && (
                    <div className="space-y-2" aria-live="polite">
                      {testProgress.map((progressStep) => (
                        <div key={progressStep.name} className="flex items-center gap-2 text-sm">
                          {progressStep.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                          <span className="capitalize text-zinc-300">{progressStep.name}</span>
                          <span className="ml-auto text-xs text-zinc-500">{progressStep.latencyMs}ms</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isTesting && <p className="text-sm text-zinc-400"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Checking provider...</p>}
                  {testResult?.overall && <p className="text-sm text-emerald-400 font-medium">Connection successful.</p>}
                  {testResult && !testResult.overall && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                      <p className="text-sm font-medium text-red-300">{failedMessage.title}</p>
                      <p className="text-xs text-red-200/80 mt-1">{failedMessage.action}</p>
                    </div>
                  )}
                </div>
              </Card>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setWizardStep('provider')}>Back</Button>
                <Button disabled={!testResult?.overall} onClick={() => setWizardStep('language')}>Choose language</Button>
              </div>
            </div>
          )}

          {step === 'language' && (
            <div className="space-y-5">
              <FieldGroup label="Target language" htmlFor="setup-target-language" description="Source language stays on Auto by default.">
                <Select
                  id="setup-target-language"
                  aria-label="Target language"
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  options={LANGUAGES.filter((language) => language.code !== 'auto').map((language) => ({ value: language.code, label: language.nativeName }))}
                />
              </FieldGroup>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setWizardStep('test')}>Back</Button>
                <Button onClick={handleFinish}>Finish setup</Button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-5 text-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
              <div>
                <h3 className="text-xl font-semibold text-zinc-100">You're ready to translate</h3>
                <p className="text-sm text-zinc-400 mt-2">Your provider is connected and your target language is set.</p>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="secondary" onClick={onClose}>Open settings</Button>
                {onTranslateCurrentPage && <Button onClick={onTranslateCurrentPage}>Translate current page</Button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the wizard test and commit**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/options/__tests__/SetupWizard.test.tsx
```

Expected: PASS.

Commit:

```bash
git add entrypoints/options/SetupWizard.tsx entrypoints/options/__tests__/SetupWizard.test.tsx
git commit -m "feat(options): add setup wizard"
```

---

### Task 3: Wire the Wizard Into Options and Provider Settings

**Files:**
- Modify: `entrypoints/options/App.tsx`
- Modify: `entrypoints/options/sections/ProviderSection.tsx`
- Test: `entrypoints/options/__tests__/ProviderSection.test.tsx`

- [ ] **Step 1: Write the failing ProviderSection readiness tests**

Create `entrypoints/options/__tests__/ProviderSection.test.tsx`:

```tsx
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
});
```

- [ ] **Step 2: Run the ProviderSection test to verify it fails**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/options/__tests__/ProviderSection.test.tsx
```

Expected: FAIL because `ProviderSection` does not accept `onOpenSetup` and no readiness banner exists.

- [ ] **Step 3: Add ProviderSection readiness banner and setup CTA**

In `entrypoints/options/sections/ProviderSection.tsx`, update imports:

```ts
import {
  Loader2, CheckCircle2, XCircle, RotateCcw,
  Zap, ChevronDown, AlertTriangle, Server, Radio,
} from 'lucide-react';
import { getProviderReadiness, getProviderRecoveryMessage } from '@/lib/providerReadiness';
```

Add props before `export function ProviderSection`:

```ts
interface ProviderSectionProps {
  onOpenSetup?: () => void;
}
```

Change the signature and add readiness constants near the existing state:

```ts
export function ProviderSection({ onOpenSetup }: ProviderSectionProps = {}) {
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const updateProvider = useSettingsStore((s) => s.updateProvider);
  const { error: showError, success: showSuccess } = useToast();

  const readiness = getProviderReadiness(settings.provider);
  const recoveryMessage = getProviderRecoveryMessage(readiness);
```

Insert this banner as the first child inside `<div className="space-y-4">`:

```tsx
        <div className="animate-stagger" style={{ '--stagger-delay': '0' } as React.CSSProperties}>
          <Card variant="bordered" className={readiness.status === 'connected' ? 'border-emerald-500/30' : 'border-amber-500/30'}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${readiness.status === 'connected' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                {readiness.status === 'connected' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-zinc-100">{recoveryMessage.title}</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-5">{recoveryMessage.description}</p>
                <p className="text-xs text-zinc-500 mt-1">Next: {recoveryMessage.action}</p>
              </div>
              {onOpenSetup && (
                <Button size="sm" variant={readiness.status === 'connected' ? 'secondary' : 'primary'} onClick={onOpenSetup}>
                  Open setup guide
                </Button>
              )}
            </div>
          </Card>
        </div>
```

Increment the existing `animate-stagger` delay values below the inserted banner so Provider Configuration starts at `1`, Connection Test at `2`, and Advanced Settings at `3`.

- [ ] **Step 4: Wire the wizard into Options App**

In `entrypoints/options/App.tsx`, add imports:

```ts
import { SetupWizard } from './SetupWizard';
```

Add wizard state and full settings access in `App()` after existing state declarations:

```ts
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const settings = useSettingsStore();
```

Add this effect after the storage loading effect:

```ts
  useEffect(() => {
    if (!isLoaded) return;

    const url = new URL(window.location.href);
    const requestedSetup = url.searchParams.get('setup') === '1' || window.location.hash === '#setup';
    const shouldAutoOpen = !settings.onboarding.completed && !settings.onboarding.skipped;

    if (requestedSetup || shouldAutoOpen) {
      setShowSetupWizard(true);
    }
  }, [isLoaded, settings.onboarding.completed, settings.onboarding.skipped]);
```

Update `renderSection()` so the provider case passes the setup callback:

```tsx
      case 'provider': return <ProviderSection onOpenSetup={() => setShowSetupWizard(true)} />;
```

Before the closing `</ToastProvider>`, render the wizard:

```tsx
      <SetupWizard
        open={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
      />
```

Do not pass `onTranslateCurrentPage` from Options because the options page does not have a safe active-tab translation action yet.

- [ ] **Step 5: Run focused Options tests and commit**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/options/__tests__/ProviderSection.test.tsx entrypoints/options/__tests__/SetupWizard.test.tsx
```

Expected: PASS.

Commit:

```bash
git add entrypoints/options/App.tsx entrypoints/options/sections/ProviderSection.tsx entrypoints/options/__tests__/ProviderSection.test.tsx
git commit -m "feat(options): surface setup readiness"
```

---

### Task 4: Add Popup Provider Recovery UX

**Files:**
- Modify: `entrypoints/popup/App.tsx`
- Create: `entrypoints/popup/__tests__/App.test.tsx`

- [ ] **Step 1: Write failing popup recovery tests**

Create `entrypoints/popup/__tests__/App.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { DEFAULT_SETTINGS } from '@/types/config';

const sendMessage = vi.fn();
const createWindow = vi.fn();
const queryTabs = vi.fn();
const addStorageListener = vi.fn();
const removeStorageListener = vi.fn();
const addRuntimeListener = vi.fn();
const removeRuntimeListener = vi.fn();

let storedSettings = DEFAULT_SETTINGS;

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(async () => storedSettings),
  updateSettings: vi.fn(async (partial) => {
    storedSettings = { ...storedSettings, ...partial };
    return storedSettings;
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  storedSettings = DEFAULT_SETTINGS;
  queryTabs.mockResolvedValue([{ id: 7, url: 'https://example.com/article' }]);
  sendMessage.mockResolvedValue({ status: 'idle', translatedCount: 0, totalCount: 0 });
  global.chrome = {
    tabs: {
      query: queryTabs,
      sendMessage,
    },
    windows: {
      create: createWindow,
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage,
      onMessage: {
        addListener: addRuntimeListener,
        removeListener: removeRuntimeListener,
      },
    },
    storage: {
      onChanged: {
        addListener: addStorageListener,
        removeListener: removeStorageListener,
      },
    },
  } as unknown as typeof chrome;
});

describe('popup provider recovery', () => {
  it('shows setup recovery instead of translate action when provider is empty', async () => {
    render(<App />);

    expect(await screen.findByText(/provider not ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set up provider/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /translate page/i })).not.toBeInTheDocument();
  });

  it('shows normal translate action when provider is connected', async () => {
    storedSettings = {
      ...DEFAULT_SETTINGS,
      provider: {
        ...DEFAULT_SETTINGS.provider,
        baseUrl: 'http://localhost:11434/v1',
        model: 'gemma3:4b',
        connectionStatus: 'success',
      },
      onboarding: { completed: true, skipped: false, lastStep: 'done' },
    };

    render(<App />);

    expect(await screen.findByRole('button', { name: /translate page/i })).toBeInTheDocument();
    expect(screen.queryByText(/provider not ready/i)).not.toBeInTheDocument();
  });

  it('opens options setup flow from recovery CTA', async () => {
    render(<App />);

    const setupButton = await screen.findByRole('button', { name: /set up provider/i });
    setupButton.click();

    await waitFor(() => {
      expect(createWindow).toHaveBeenCalledWith({
        url: 'chrome-extension://test/options.html?setup=1',
        type: 'popup',
        width: 1200,
        height: 800,
        focused: true,
      });
    });
  });
});
```

- [ ] **Step 2: Run popup tests to verify they fail**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/popup/__tests__/App.test.tsx
```

Expected: FAIL because popup still renders the translate hero with missing provider configuration.

- [ ] **Step 3: Implement popup recovery card**

In `entrypoints/popup/App.tsx`, add imports:

```ts
import { getProviderReadiness, getProviderRecoveryMessage } from '@/lib/providerReadiness';
```

After `const providerPreset = ...`, add:

```ts
  const providerReadiness = getProviderReadiness(settings.provider);
  const providerRecoveryMessage = getProviderRecoveryMessage(providerReadiness);
  const shouldShowProviderRecovery = !providerReadiness.canTranslate;
```

Add this helper inside `App()` near the other callbacks:

```ts
  const openSetupGuide = useCallback(() => {
    chrome.windows.create({
      url: chrome.runtime.getURL('options.html?setup=1'),
      type: 'popup', width: 1200, height: 800, focused: true,
    });
  }, []);
```

Replace the existing main action button block with a conditional:

```tsx
        {shouldShowProviderRecovery ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 shadow-lg shadow-amber-500/5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/20">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-zinc-100">{providerRecoveryMessage.title}</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">{providerRecoveryMessage.description}</p>
                <p className="text-[11px] text-amber-300/90 mt-2">Next: {providerRecoveryMessage.action}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={openSetupGuide}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.01] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              >
                {settings.onboarding.skipped ? 'Resume setup' : 'Set up provider'}
              </button>
              {providerReadiness.canTest && (
                <button
                  type="button"
                  onClick={openSetupGuide}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Test connection in setup guide
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={handleToggleTranslation}
            className="w-full relative group rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-zinc-950 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className={`absolute inset-0 transition-all duration-500 ${
              isActive
                ? 'bg-gradient-to-r from-zinc-700 via-zinc-600 to-zinc-700'
                : 'bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-[length:200%_200%] animate-gradient-x'
            }`} />

            {!isActive && (
              <div className="absolute inset-0 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />
            )}

            <div className="relative flex items-center justify-center gap-2.5 py-4 px-4 z-20">
              {isActive ? (
                <>
                  <Square className="w-4.5 h-4.5 text-zinc-300 fill-zinc-300" />
                  <span className="font-semibold text-sm text-zinc-100 tracking-wide">Restore Original</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4.5 h-4.5 text-white" />
                  <span className="font-semibold text-sm text-white tracking-wide">Translate Page</span>
                </>
              )}
            </div>
          </button>
        )}
```

Keep the existing hero button markup unchanged inside the `else` branch so connected-provider behavior does not regress.

- [ ] **Step 4: Run popup tests and commit**

Run:

```bash
npx -y pnpm@latest exec vitest run entrypoints/popup/__tests__/App.test.tsx
```

Expected: PASS.

Commit:

```bash
git add entrypoints/popup/App.tsx entrypoints/popup/__tests__/App.test.tsx
git commit -m "feat(popup): add provider recovery card"
```

---

### Task 5: Final Verification and Cleanup

**Files:**
- Verify all touched code paths.

- [ ] **Step 1: Run focused test set**

Run:

```bash
npx -y pnpm@latest exec vitest run \
  tests/unit/providerReadiness.test.ts \
  entrypoints/options/__tests__/SetupWizard.test.tsx \
  entrypoints/options/__tests__/ProviderSection.test.tsx \
  entrypoints/popup/__tests__/App.test.tsx
```

Expected: PASS for all focused onboarding tests.

- [ ] **Step 2: Run compile**

Run:

```bash
npx -y pnpm@latest run compile
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run full tests**

Run:

```bash
npx -y pnpm@latest test
```

Expected: PASS. If unrelated existing failures appear, record the failing test names and confirm they are unrelated before proceeding.

- [ ] **Step 4: Run lint**

Run:

```bash
npx -y pnpm@latest run lint
```

Expected: PASS or only the documented pre-existing warnings from the project status. Do not introduce new lint errors.

- [ ] **Step 5: Manual extension smoke test**

Run a dev build:

```bash
npx -y pnpm@latest run build
```

Expected: PASS.

Manual checks in Chrome after loading `.output/chrome-mv3`:

1. Clear extension storage.
2. Open Options and verify the setup wizard appears automatically.
3. Click `Skip for now`, close Options, reopen Options, and verify the wizard no longer auto-opens.
4. Open popup with empty provider settings and verify the recovery card appears instead of `Translate Page`.
5. Click `Set up provider` and verify Options opens with `?setup=1` and the wizard appears.
6. Configure Ollama or a test OpenAI-compatible endpoint, run connection test, choose a target language, finish setup.
7. Reopen popup and verify `Translate Page` appears.

- [ ] **Step 6: Commit final verification notes if code changed during cleanup**

If verification required code changes, commit them:

```bash
git add <changed-files>
git commit -m "fix(onboarding): address verification issues"
```

If no code changed during verification, do not create an empty commit.
