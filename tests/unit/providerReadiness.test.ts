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
