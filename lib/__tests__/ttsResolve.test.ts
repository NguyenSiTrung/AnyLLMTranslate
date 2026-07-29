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
  isOpenAiStyleTtsHost,
  shouldOfferVoiceField,
} from '@/lib/tts/resolveTtsBackend';
import type { ExtensionSettings, PoolProvider } from '@/types/config';
import { DEFAULT_SETTINGS, DEFAULT_TTS_SETTINGS } from '@/types/config';

function poolProvider(over: Partial<PoolProvider> & Pick<PoolProvider, 'id'>): PoolProvider {
  return {
    displayName: over.displayName ?? over.id,
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
    ...over,
  };
}

function baseSettings(over: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...over };
}

describe('resolveTtsBackend', () => {
  it('resolves disabled / auto / provider / browser preferences', () => {
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, enabled: false }, true),
    ).toBe('disabled');
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, preferredBackend: 'auto' }, true),
    ).toBe('provider');
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, preferredBackend: 'auto' }, false),
    ).toBe('browser');
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, preferredBackend: 'provider' }, false),
    ).toBe('browser');
    expect(
      resolveTtsBackend({ ...DEFAULT_TTS_SETTINGS, preferredBackend: 'browser' }, true),
    ).toBe('browser');
  });
});

describe('pickTtsCredentials hybrid', () => {
  it('uses first usable pool provider when poolProviderId is empty', () => {
    const s = baseSettings({
      tts: { ...DEFAULT_TTS_SETTINGS, model: 'tts-1', voice: 'nova' },
      providers: [
        poolProvider({ id: 'p1', baseUrl: 'https://api.openai.com/v1' }),
        poolProvider({
          id: 'p2',
          baseUrl: 'https://other.example/v1',
          keys: [
            {
              id: 'k2',
              apiKey: 'sk-other',
              maxRpm: 0,
              concurrencyLimit: 1,
              interval: 0,
              enabled: true,
            },
          ],
        }),
      ],
    });
    const pick = pickTtsCredentials(s);
    expect(pick?.baseUrl).toBe('https://api.openai.com/v1');
    expect(pick?.apiKey).toBe('sk-test');
    expect(pick?.model).toBe('tts-1');
    expect(pick?.voice).toBe('nova');
    expect(hasProviderTtsCredentials(s)).toBe(true);
  });

  it('uses explicit poolProviderId', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'pool',
        poolProviderId: 'p2',
        model: 'my-tts',
      },
      providers: [
        poolProvider({ id: 'p1' }),
        poolProvider({
          id: 'p2',
          baseUrl: 'https://tts.example/v1',
          keys: [
            {
              id: 'k2',
              apiKey: 'sk-p2',
              maxRpm: 0,
              concurrencyLimit: 1,
              interval: 0,
              enabled: true,
            },
          ],
        }),
      ],
    });
    const pick = pickTtsCredentials(s);
    expect(pick?.baseUrl).toBe('https://tts.example/v1');
    expect(pick?.apiKey).toBe('sk-p2');
    expect(pick?.model).toBe('my-tts');
  });

  it('returns null when explicit poolProviderId is missing or disabled', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'pool',
        poolProviderId: 'gone',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    expect(pickTtsCredentials(s)).toBeNull();
    expect(hasProviderTtsCredentials(s)).toBe(false);

    const disabled = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        poolProviderId: 'p1',
      },
      providers: [poolProvider({ id: 'p1', enabled: false })],
    });
    expect(pickTtsCredentials(disabled)).toBeNull();
  });

  it('custom source fully overrides pool when base URL set', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'custom',
        customBaseUrl: 'https://custom-tts.example/v1',
        customApiKey: 'sk-custom',
        model: 'custom-model',
        voice: '',
        poolProviderId: 'p1',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    const pick = pickTtsCredentials(s);
    expect(pick?.baseUrl).toBe('https://custom-tts.example/v1');
    expect(pick?.apiKey).toBe('sk-custom');
    expect(pick?.model).toBe('custom-model');
    expect(pick?.voice).toBe('');
  });

  it('custom source with empty base URL returns null (does not fall back to pool)', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'custom',
        customBaseUrl: '  ',
        customApiKey: 'sk-custom',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    expect(pickTtsCredentials(s)).toBeNull();
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

describe('isOpenAiStyleTtsHost / shouldOfferVoiceField', () => {
  it('detects OpenAI hosts only', () => {
    expect(isOpenAiStyleTtsHost('https://api.openai.com/v1')).toBe(true);
    expect(isOpenAiStyleTtsHost('https://east.openai.azure.com/openai/v1')).toBe(true);
    expect(isOpenAiStyleTtsHost('https://api.mistral.ai/v1')).toBe(false);
    expect(isOpenAiStyleTtsHost('not-a-url')).toBe(false);
  });

  it('offers voice for OpenAI host or showVoiceField', () => {
    expect(
      shouldOfferVoiceField(
        { ...DEFAULT_TTS_SETTINGS, showVoiceField: false },
        'https://api.openai.com/v1',
      ),
    ).toBe(true);
    expect(
      shouldOfferVoiceField(
        { ...DEFAULT_TTS_SETTINGS, showVoiceField: false },
        'https://api.mistral.ai/v1',
      ),
    ).toBe(false);
    expect(
      shouldOfferVoiceField(
        { ...DEFAULT_TTS_SETTINGS, showVoiceField: true },
        'https://api.mistral.ai/v1',
      ),
    ).toBe(true);
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
    expect(mergeTtsSettings({ voice: 'nova' }).model).toBe('');
    expect(mergeTtsSettings({ model: 'tts-1', voice: 'alloy' }).model).toBe('tts-1');
    expect(mergeTtsSettings({ model: 'tts-1', voice: 'alloy' }).credentialSource).toBe(
      'pool',
    );
    expect(mergeTtsSettings({ model: 'tts-1' }).poolProviderId).toBe('');
    expect(mergeTtsSettings({ model: 'tts-1' }).showVoiceField).toBe(false);
  });
});
