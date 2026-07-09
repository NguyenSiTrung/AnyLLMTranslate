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
  it('classifies not-configured reasons (baseUrl/model/apiKey)', () => {
    expect(getProviderReadiness(provider({ baseUrl: '', model: 'm' })).reason).toBe('missing-base-url');
    expect(getProviderReadiness(provider({ baseUrl: 'https://x/v1', model: '' })).reason).toBe(
      'missing-model',
    );
    expect(
      getProviderReadiness(
        provider({ baseUrl: 'https://x/v1', model: 'm', requiresApiKey: true, apiKey: '' }),
      ).reason,
    ).toBe('missing-api-key');
  });

  it('classifies untested / connected / failed from connectionStatus', () => {
    const base = { baseUrl: 'http://localhost:11434/v1', model: 'gemma3:4b' };
    expect(getProviderReadiness(provider({ ...base, connectionStatus: 'unknown' })).status).toBe(
      'untested',
    );
    expect(getProviderReadiness(provider({ ...base, connectionStatus: 'success' })).canTranslate).toBe(
      true,
    );
    const failed = getProviderReadiness(provider({ ...base, connectionStatus: 'error' }));
    expect(failed.status).toBe('failed');
    expect(failed.canTest).toBe(true);
  });
});

describe('recovery / connection error messages', () => {
  it('surfaces actionable recovery and maps common connection errors', () => {
    const readiness = getProviderReadiness(
      provider({ baseUrl: 'https://x/v1', model: 'm', requiresApiKey: true, apiKey: '' }),
    );
    expect(getProviderRecoveryMessage(readiness).description).toContain('API key');
    expect(getConnectionErrorMessage('The operation timed out after 60000ms').title).toBe(
      'Connection timed out',
    );
    expect(getConnectionErrorMessage('HTTP 404: model not found').title).toBe('Model not found');
  });
});

describe('getPoolReadinessStatus', () => {
  function settings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
    return { ...DEFAULT_SETTINGS, providers: [], ...overrides };
  }

  it('aggregates pool empty / needs-key / ready states', () => {
    expect(getPoolReadinessStatus(settings({ providers: [] })).reason).toBe('pool-empty');

    expect(
      getPoolReadinessStatus(
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
              keys: [{ id: 'k1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
            },
          ],
        }),
      ).reason,
    ).toBe('pool-needs-key');

    const ready = getPoolReadinessStatus(
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
            keys: [
              { id: 'k1', apiKey: 'sk-x', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
            ],
          },
        ],
      }),
    );
    expect(ready.reason).toBe('pool-ready');
    expect(ready.canTranslate).toBe(true);
  });

  it('skips disabled providers and accepts keyless local providers', () => {
    expect(
      getPoolReadinessStatus(
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
              enabled: false,
              keys: [
                { id: 'k1', apiKey: 'sk-x', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
              ],
            },
          ],
        }),
      ).reason,
    ).toBe('pool-empty');

    expect(
      getPoolReadinessStatus(
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
              keys: [{ id: 'k1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true }],
            },
          ],
        }),
      ).reason,
    ).toBe('pool-ready');
  });
});

describe('getPoolRecoveryMessage', () => {
  it('returns messages for empty and ready pools', () => {
    expect(
      getPoolRecoveryMessage({
        status: 'not-configured',
        reason: 'pool-empty',
        canTest: false,
        canTranslate: false,
      }).title,
    ).toBe('No providers configured');
    expect(
      getPoolRecoveryMessage({
        status: 'connected',
        reason: 'pool-ready',
        canTest: true,
        canTranslate: true,
      }).title,
    ).toBe('Provider pool ready');
  });
});
