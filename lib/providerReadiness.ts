import type { ProviderConfig, ExtensionSettings } from '@/types/config';

export type ProviderReadinessStatus = 'not-configured' | 'untested' | 'connected' | 'failed';

export type ProviderReadinessReason =
  | 'missing-base-url'
  | 'missing-model'
  | 'missing-api-key'
  | 'needs-test'
  | 'connected'
  | 'connection-failed'
  | 'pool-empty'
  | 'pool-ready';

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
  // OpenAI-compatible readiness checks (custom, legacy ollama)
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
    case 'pool-empty':
      return {
        title: 'No providers configured',
        description: 'Add at least one provider with an API key in the Providers tab to start translating.',
        action: 'Open Providers settings',
      };
    case 'pool-ready':
      return {
        title: 'Provider pool ready',
        description: 'At least one provider key is healthy. Translation requests will rotate across enabled keys.',
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

  // P2: use specific model-related patterns instead of bare 'model', which
  // matched unrelated errors containing the word (e.g. "rate model exceeded").
  const MODEL_ERROR_PATTERNS = [
    'model not found',
    'model_not_found',
    'does not exist',
    'does_not_exist',
    'model is deprecated',
    'no such model',
    'invalid model',
    'unknown model',
  ];
  if (normalized.includes('404') || MODEL_ERROR_PATTERNS.some((p) => normalized.includes(p))) {
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

/**
 * Pool-aware readiness for the multi-provider world (FR-8 global status).
 * Aggregates across all enabled (provider, key) pairs:
 *  - `pool-empty` / not-configured when no enabled key with an apiKey exists.
 *  - `pool-ready` when at least one enabled key has a baseUrl + model + apiKey.
 *
 * This is the readiness the popup recovery card should consult when the pool
 * is the source of truth (it supersedes the single-provider readiness once the
 * user has migrated). The legacy {@link getProviderReadiness} is retained for
 * the ProviderSection which still edits the legacy mirror.
 */
export function getPoolReadinessStatus(settings: ExtensionSettings): ProviderReadiness {
  const providers = settings.providers ?? [];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    if (!provider.baseUrl.trim() || !provider.model.trim()) continue;
    for (const key of provider.keys ?? []) {
      if (!key.enabled) continue;
      if (!provider.requiresApiKey || key.apiKey.trim()) {
        // At least one dispatchable slot exists.
        return {
          status: 'connected',
          reason: 'pool-ready',
          canTest: true,
          canTranslate: true,
        };
      }
    }
  }
  return {
    status: 'not-configured',
    reason: 'pool-empty',
    canTest: false,
    canTranslate: false,
  };
}

/**
 * Recovery message for pool-aware readiness. Delegates to
 * {@link getProviderRecoveryMessage} (which now covers pool-empty / pool-ready)
 * so there's a single source of truth for recovery copy.
 */
export function getPoolRecoveryMessage(readiness: ProviderReadiness): RecoveryMessage {
  return getProviderRecoveryMessage(readiness);
}
