/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  resolveTtsBackend,
  hasProviderTtsCredentials,
  pickTtsCredentials,
  speechEndpointFromBaseUrl,
  clampRate,
  mergeTtsSettings,
} from '@/lib/tts/resolveTtsBackend';
import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS, DEFAULT_TTS_SETTINGS } from '@/types/config';

function baseSettings(over: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...over };
}

describe('resolveTtsBackend', () => {
  it('resolves disabled / auto / provider / browser preferences', () => {
    // disabled when tts.enabled is false
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, enabled: false }, true),
    ).toBe('disabled');
    // auto prefers provider when available
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, preferredBackend: 'auto' }, true),
    ).toBe('provider');
    // auto falls back to browser without provider
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, preferredBackend: 'auto' }, false),
    ).toBe('browser');
    // provider preferred falls open to browser
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, preferredBackend: 'provider' }, false),
    ).toBe('browser');
    // browser preferred always browser
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, preferredBackend: 'browser' }, true),
    ).toBe('browser');
  });
});

describe('hasProviderTtsCredentials / pickTtsCredentials', () => {
  it('detects enabled pool key', () => {
    const s = baseSettings({
      providers: [
        {
          id: 'p1',
          displayName: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          requestTimeoutMs: 60000,
          thinkingMode: 'off',
          thinkingEffort: 'medium',
          enabled: true,
          keys: [
            {
              id: 'k1',
              apiKey: 'sk-test',
              maxRpm: 60,
              concurrencyLimit: 2,
              interval: 0,
              enabled: true,
            },
          ],
        },
      ],
    });
    expect(hasProviderTtsCredentials(s)).toBe(true);
    const pick = pickTtsCredentials(s);
    expect(pick?.baseUrl).toBe('https://api.openai.com/v1');
    expect(pick?.apiKey).toBe('sk-test');
    expect(pick?.model).toBe('tts-1');
    expect(pick?.voice).toBe('alloy');
  });

  it('returns false when no base URL', () => {
    const s = baseSettings({
      providers: [
        {
          ...DEFAULT_SETTINGS.providers[0],
          baseUrl: '',
          enabled: true,
        },
      ],
      provider: { ...DEFAULT_SETTINGS.provider, baseUrl: '', apiKey: '' },
    });
    expect(hasProviderTtsCredentials(s)).toBe(false);
    expect(pickTtsCredentials(s)).toBeNull();
  });
});

describe('speechEndpointFromBaseUrl', () => {
  it('appends /audio/speech to /v1 base; adds /v1 when base lacks it', () => {
    expect(speechEndpointFromBaseUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/audio/speech',
    );
    expect(speechEndpointFromBaseUrl('https://example.com')).toBe(
      'https://example.com/v1/audio/speech',
    );
  });
});

describe('clampRate / mergeTtsSettings', () => {
  it('clamps rate and merges partial tts settings', () => {
    expect(clampRate(0.1)).toBe(0.5);
    expect(clampRate(5)).toBe(2);
    expect(clampRate(1.2)).toBe(1.2);

    expect(mergeTtsSettings({ voice: 'nova' }).voice).toBe('nova');
    expect(mergeTtsSettings({ voice: 'nova' }).model).toBe('tts-1');
  });
});
