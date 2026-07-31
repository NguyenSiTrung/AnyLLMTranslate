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
  findTtsLanguageOverride,
  normalizeTtsOverrideLang,
  resolveTtsStack,
} from '@/lib/tts/resolveTtsBackend';
import type { ExtensionSettings, PoolProvider, TtsLanguageOverride } from '@/types/config';
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
  it('uses the first usable or explicitly selected pool provider', () => {
    const implicitSettings = baseSettings({
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
    const pick = pickTtsCredentials(implicitSettings);
    expect(pick?.baseUrl).toBe('https://api.openai.com/v1');
    expect(pick?.apiKey).toBe('sk-test');
    expect(pick?.model).toBe('tts-1');
    expect(pick?.voice).toBe('nova');
    expect(hasProviderTtsCredentials(implicitSettings)).toBe(true);

    const explicitSettings = baseSettings({
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
    const explicitPick = pickTtsCredentials(explicitSettings);
    expect(explicitPick?.baseUrl).toBe('https://tts.example/v1');
    expect(explicitPick?.apiKey).toBe('sk-p2');
    expect(explicitPick?.model).toBe('my-tts');
  });

  it('returns null for missing, disabled, or base-less pool providers', () => {
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

    const noBase = baseSettings({
      providers: [
        {
          ...DEFAULT_SETTINGS.providers[0],
          baseUrl: '',
          enabled: true,
        },
      ],
      provider: { ...DEFAULT_SETTINGS.provider, baseUrl: '', apiKey: '' },
    });
    expect(hasProviderTtsCredentials(noBase)).toBe(false);
    expect(pickTtsCredentials(noBase)).toBeNull();
  });

  it('custom source overrides pool and rejects an empty custom base URL', () => {
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

    const empty = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'custom',
        customBaseUrl: '  ',
        customApiKey: 'sk-custom',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    expect(pickTtsCredentials(empty)).toBeNull();
  });
});

describe('isOpenAiStyleTtsHost / shouldOfferVoiceField', () => {
  it('detects OpenAI hosts only; offers voice for OpenAI, Mistral, voxtral, or showVoiceField', () => {
    expect(isOpenAiStyleTtsHost('https://api.openai.com/v1')).toBe(true);
    expect(isOpenAiStyleTtsHost('https://east.openai.azure.com/openai/v1')).toBe(true);
    expect(isOpenAiStyleTtsHost('https://api.mistral.ai/v1')).toBe(false);
    expect(isOpenAiStyleTtsHost('not-a-url')).toBe(false);

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
    ).toBe(true);
    expect(
      shouldOfferVoiceField(
        { ...DEFAULT_TTS_SETTINGS, showVoiceField: false, model: 'voxtral-mini-tts-2603' },
        'https://proxy.example/v1',
      ),
    ).toBe(true);
    expect(
      shouldOfferVoiceField(
        { ...DEFAULT_TTS_SETTINGS, showVoiceField: false },
        'https://api.groq.com/openai/v1',
      ),
    ).toBe(false);
    expect(
      shouldOfferVoiceField(
        { ...DEFAULT_TTS_SETTINGS, showVoiceField: true },
        'https://api.groq.com/openai/v1',
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

describe('normalizeTtsOverrideLang / findTtsLanguageOverride', () => {
  it('normalizes case/underscore, rejects empty/auto, matches exact then base (first wins)', () => {
    expect(normalizeTtsOverrideLang('VI')).toBe('vi');
    expect(normalizeTtsOverrideLang('vi_VN')).toBe('vi-vn');
    expect(normalizeTtsOverrideLang('auto')).toBeUndefined();
    expect(normalizeTtsOverrideLang('')).toBeUndefined();
    expect(normalizeTtsOverrideLang(null)).toBeUndefined();

    const rows: TtsLanguageOverride[] = [
      { language: 'vi', voice: 'vi-base' },
      { language: 'vi-VN', voice: 'vi-exact' },
      { language: 'en', voice: 'en-1' },
      { language: 'en', voice: 'en-2' },
    ];
    expect(findTtsLanguageOverride(rows, 'vi-VN')?.voice).toBe('vi-exact');
    expect(findTtsLanguageOverride(rows, 'vi')?.voice).toBe('vi-base');
    expect(findTtsLanguageOverride(rows, 'en-GB')?.voice).toBe('en-1');
    expect(findTtsLanguageOverride(rows, 'fr')).toBeNull();
    expect(findTtsLanguageOverride(rows, 'auto')).toBeNull();
  });
});

describe('mergeTtsSettings languageOverrides', () => {
  it('defaults missing overrides to [] and preserves array', () => {
    expect(mergeTtsSettings({ voice: 'nova' }).languageOverrides).toEqual([]);
    expect(
      mergeTtsSettings({
        languageOverrides: [{ language: 'vi', voice: 'v1' }],
      }).languageOverrides,
    ).toEqual([{ language: 'vi', voice: 'v1' }]);
    expect(mergeTtsSettings({ languageOverrides: null as never }).languageOverrides).toEqual(
      [],
    );
  });
});

describe('resolveTtsStack', () => {
  it('returns global pick with matchedOverride false when no row', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'tts-1',
        voice: 'alloy',
        credentialSource: 'pool',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    const stack = resolveTtsStack(s, 'fr');
    expect(stack.matchedOverride).toBe(false);
    expect(stack.pick?.voice).toBe('alloy');
    expect(stack.pick?.model).toBe('tts-1');
  });

  it('inherits global creds and overrides model/voice when row has no creds', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'tts-1',
        voice: 'alloy',
        languageOverrides: [{ language: 'vi', model: 'voxtral-mini-tts-2603', voice: 'vi-id' }],
      },
      providers: [poolProvider({ id: 'p1', baseUrl: 'https://api.mistral.ai/v1' })],
    });
    const stack = resolveTtsStack(s, 'vi-VN');
    expect(stack.matchedOverride).toBe(true);
    expect(stack.pick?.baseUrl).toBe('https://api.mistral.ai/v1');
    expect(stack.pick?.model).toBe('voxtral-mini-tts-2603');
    expect(stack.pick?.voice).toBe('vi-id');
    expect(stack.pick?.apiKey).toBe('sk-test');
  });

  it('uses override custom credentials when valid', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'global-model',
        voice: 'global-voice',
        credentialSource: 'pool',
        languageOverrides: [
          {
            language: 'en',
            credentialSource: 'custom',
            customBaseUrl: 'https://custom-tts.example/v1',
            customApiKey: 'sk-lang',
            voice: 'en-voice',
          },
        ],
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    const stack = resolveTtsStack(s, 'en');
    expect(stack.matchedOverride).toBe(true);
    expect(stack.pick?.baseUrl).toBe('https://custom-tts.example/v1');
    expect(stack.pick?.apiKey).toBe('sk-lang');
    expect(stack.pick?.voice).toBe('en-voice');
    expect(stack.pick?.model).toBe('global-model');
  });

  it('falls back to global credentials when override custom URL empty', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'tts-1',
        voice: 'alloy',
        languageOverrides: [
          {
            language: 'ja',
            credentialSource: 'custom',
            customBaseUrl: '  ',
            voice: 'ja-voice',
          },
        ],
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    const stack = resolveTtsStack(s, 'ja');
    expect(stack.matchedOverride).toBe(true);
    expect(stack.pick?.baseUrl).toBe('https://api.openai.com/v1');
    expect(stack.pick?.voice).toBe('ja-voice');
  });

  it('uses override poolProviderId when credentialSource pool', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'tts-1',
        voice: 'alloy',
        poolProviderId: 'p1',
        languageOverrides: [
          {
            language: 'ko',
            credentialSource: 'pool',
            poolProviderId: 'p2',
            voice: 'ko-v',
          },
        ],
      },
      providers: [
        poolProvider({ id: 'p1', baseUrl: 'https://api.openai.com/v1' }),
        poolProvider({
          id: 'p2',
          baseUrl: 'https://tts-ko.example/v1',
          keys: [
            {
              id: 'k2',
              apiKey: 'sk-ko',
              maxRpm: 0,
              concurrencyLimit: 1,
              interval: 0,
              enabled: true,
            },
          ],
        }),
      ],
    });
    const stack = resolveTtsStack(s, 'ko');
    expect(stack.matchedOverride).toBe(true);
    expect(stack.pick?.baseUrl).toBe('https://tts-ko.example/v1');
    expect(stack.pick?.apiKey).toBe('sk-ko');
    expect(stack.pick?.voice).toBe('ko-v');
  });
});
