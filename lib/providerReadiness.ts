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
