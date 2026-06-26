import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types/config';
import type { ProviderConfig, ExtensionSettings } from '@/types/config';
import {
  getProviderReadiness,
  getProviderRecoveryMessage,
  getConnectionErrorMessage,
  getPoolReadinessStatus,
  getPoolRecoveryMessage,
} from '@/lib/providerReadiness';

function provider(partial: Partial<ProviderConfig>): ProviderConfig {
  return {
    ...DEFAULT_SETTINGS.provider,
    ...partial,
  };
}

describe('getProviderReadiness', () => {
  // --- OpenAI-compatible (custom) preset tests ---
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

describe('getPoolReadinessStatus — multi-provider aggregation', () => {
  function settings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
    return { ...DEFAULT_SETTINGS, providers: [], ...overrides };
  }

  it('returns pool-empty / not-configured when no providers exist', () => {
    const r = getPoolReadinessStatus(settings({ providers: [] }));
    expect(r.status).toBe('not-configured');
    expect(r.reason).toBe('pool-empty');
    expect(r.canTranslate).toBe(false);
  });

  it('returns pool-empty when a provider exists but has no enabled key with apiKey', () => {
    const r = getPoolReadinessStatus(
      settings({
        providers: [
          {
            id: 'p1',
            displayName: 'P1',
            baseUrl: 'https://a/v1',
            model: 'm',
            requiresApiKey: true,
            temperature: 0.3,
            maxTokens: 4096,
            enabled: true,
            keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
          },
        ],
      }),
    );
    expect(r.reason).toBe('pool-empty');
  });

  it('returns pool-ready / connected when at least one enabled key has apiKey', () => {
    const r = getPoolReadinessStatus(
      settings({
        providers: [
          {
            id: 'p1',
            displayName: 'P1',
            baseUrl: 'https://a/v1',
            model: 'm',
            requiresApiKey: true,
            temperature: 0.3,
            maxTokens: 4096,
            enabled: true,
            keys: [{ id: 'k1', apiKey: 'sk-x', maxRpm: 0, enabled: true }],
          },
        ],
      }),
    );
    expect(r.status).toBe('connected');
    expect(r.reason).toBe('pool-ready');
    expect(r.canTranslate).toBe(true);
  });

  it('skips disabled providers when aggregating', () => {
    const r = getPoolReadinessStatus(
      settings({
        providers: [
          {
            id: 'p1',
            displayName: 'P1',
            baseUrl: 'https://a/v1',
            model: 'm',
            requiresApiKey: true,
            temperature: 0.3,
            maxTokens: 4096,
            enabled: false, // disabled
            keys: [{ id: 'k1', apiKey: 'sk-x', maxRpm: 0, enabled: true }],
          },
        ],
      }),
    );
    expect(r.reason).toBe('pool-empty');
  });

  it('a local (no-api-key) provider with just baseUrl+model is ready', () => {
    const r = getPoolReadinessStatus(
      settings({
        providers: [
          {
            id: 'p1',
            displayName: 'Ollama',
            baseUrl: 'http://localhost:11434/v1',
            model: 'llama3',
            requiresApiKey: false,
            temperature: 0.3,
            maxTokens: 4096,
            enabled: true,
            keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
          },
        ],
      }),
    );
    expect(r.reason).toBe('pool-ready');
  });
});

describe('getPoolRecoveryMessage', () => {
  it('returns a no-providers message for pool-empty', () => {
    const msg = getPoolRecoveryMessage({
      status: 'not-configured',
      reason: 'pool-empty',
      canTest: false,
      canTranslate: false,
    });
    expect(msg.title).toBe('No providers configured');
    expect(msg.action).toContain('Providers');
  });

  it('returns a ready message for pool-ready', () => {
    const msg = getPoolRecoveryMessage({
      status: 'connected',
      reason: 'pool-ready',
      canTest: true,
      canTranslate: true,
    });
    expect(msg.title).toBe('Provider pool ready');
  });
});
