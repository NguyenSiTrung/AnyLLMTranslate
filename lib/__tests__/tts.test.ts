import { describe, expect, it, vi } from 'vitest';
import {
  listTtsVoices,
  parseTtsVoicesResponse,
  voicesEndpointFromBaseUrl,
} from '@/lib/tts/listTtsVoices';
import {
  detectTtsDialect,
  fetchProviderSpeech,
  MISTRAL_VOXTRAL_MINI_TTS_MODEL,
  normalizeMistralTtsModel,
} from '@/lib/tts/providerTts';
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

/**
 * @vitest-environment node
 */

describe('listTtsVoices helpers', () => {
  it('builds the voices endpoint, parses response shapes, and fetches with auth/error mapping', async () => {
    // voicesEndpointFromBaseUrl: /v1 (with or without trailing slash) -> /v1/audio/voices
    expect(voicesEndpointFromBaseUrl('https://api.mistral.ai/v1')).toBe(
      'https://api.mistral.ai/v1/audio/voices',
    );
    expect(voicesEndpointFromBaseUrl('https://api.mistral.ai/v1/')).toBe(
      'https://api.mistral.ai/v1/audio/voices',
    );

    // parseTtsVoicesResponse: Mistral items, string arrays, and data arrays
    const voices = parseTtsVoicesResponse({
      items: [
        { id: 'voice-1', name: 'Neutral Male' },
        { id: 'voice-2', name: 'voice-2' },
      ],
      total: 2,
      page: 0,
      page_size: 10,
      total_pages: 1,
    });
    expect(voices).toEqual([
      { id: 'voice-1', label: 'Neutral Male · voice-1' },
      { id: 'voice-2', label: 'voice-2' },
    ]);

    expect(parseTtsVoicesResponse(['alloy', 'nova']).map((v) => v.id)).toEqual([
      'alloy',
      'nova',
    ]);
    expect(
      parseTtsVoicesResponse({ data: [{ voice_id: 'abc', name: 'A' }] }).map((v) => v.id),
    ).toEqual(['abc']);

    // listTtsVoices: GETs voices endpoint and returns choices on ok, error on non-ok
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [{ id: 'v1', name: 'Preset One' }],
          total: 1,
          page: 0,
          page_size: 100,
          total_pages: 1,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await listTtsVoices(
      { baseUrl: 'https://api.mistral.ai/v1', apiKey: 'msk' },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result.success).toBe(true);
    expect(result.voices).toEqual([{ id: 'v1', label: 'Preset One · v1' }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://api.mistral.ai/v1/audio/voices');
    expect(url).toContain('type=all');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer msk');

    const failImpl = vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const failResult = await listTtsVoices(
      { baseUrl: 'https://api.mistral.ai/v1', apiKey: 'bad' },
      failImpl as unknown as typeof fetch,
    );
    expect(failResult.success).toBe(false);
    expect(failResult.error).toMatch(/401/);
    expect(failResult.error).toMatch(/Unauthorized/);
  });
});

/**
 * @vitest-environment node
 */

describe('fetchProviderSpeech', () => {
  it('returns audio for successful speech requests and diagnostics for failures', async () => {
    const audio = new Uint8Array([1, 2, 3, 4]).buffer;
    const successFetch = vi.fn(async () =>
      new Response(audio, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );

    const successResult = await fetchProviderSpeech(
      'Hello world',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'tts-1',
        voice: 'alloy',
        rate: 1,
      },
      successFetch as unknown as typeof fetch,
    );

    expect(successResult.success).toBe(true);
    if (successResult.success) {
      expect(successResult.mimeType).toBe('audio/mpeg');
      expect(successResult.audioBase64).toBe(btoa(String.fromCharCode(1, 2, 3, 4)));
    }
    expect(successFetch).toHaveBeenCalledOnce();
    const call = successFetch.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.input).toBe('Hello world');
    expect(body.voice).toBe('alloy');

    const errorFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'bad key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const errorResult = await fetchProviderSpeech(
      'Hi',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'bad',
        model: 'tts-1',
        voice: 'alloy',
        rate: 1,
      },
      errorFetch as unknown as typeof fetch,
    );

    expect(errorResult.success).toBe(false);
    if (!errorResult.success) {
      expect(errorResult.error).toMatch(/401/);
      expect(errorResult.error).toMatch(/bad key/);
    }
  });

  it('builds OpenAI request bodies with optional voice fields', async () => {
    const optionalVoiceFetch = vi.fn(async () =>
      new Response(new Uint8Array([1]).buffer, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );

    await fetchProviderSpeech(
      'Hello',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'tts-1',
        voice: '',
        rate: 1.2,
      },
      optionalVoiceFetch as unknown as typeof fetch,
    );

    const init = (optionalVoiceFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('tts-1');
    expect(body.speed).toBe(1.2);
    expect(body).not.toHaveProperty('voice');

    const requiredVoiceFetch = vi.fn(async () =>
      new Response(new Uint8Array([1]).buffer, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );

    await fetchProviderSpeech(
      'Hello',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'tts-1',
        voice: 'alloy',
        rate: 1,
      },
      requiredVoiceFetch as unknown as typeof fetch,
    );

    const voiceInit = (requiredVoiceFetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    const voiceBody = JSON.parse(voiceInit.body as string);
    expect(voiceBody.voice).toBe('alloy');
  });

  it('rejects missing models and Mistral voice IDs before making a request', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchProviderSpeech(
      'Hello',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: '  ',
        voice: 'alloy',
        rate: 1,
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/model/i);
    }
    expect(fetchImpl).not.toHaveBeenCalled();

    const mistralFetch = vi.fn();
    const mistralResult = await fetchProviderSpeech(
      'Hi',
      {
        baseUrl: 'https://api.mistral.ai/v1',
        apiKey: 'msk',
        model: 'voxtral-mini-tts-2603',
        voice: '',
        rate: 1,
      },
      mistralFetch as unknown as typeof fetch,
    );
    expect(mistralResult.success).toBe(false);
    if (!mistralResult.success) {
      expect(mistralResult.error).toMatch(/voice_id/i);
    }
    expect(mistralFetch).not.toHaveBeenCalled();
  });

  it('detects Mistral dialects, normalizes Voxtral model aliases, and sends Mistral voice_id bodies with audio_data decoding', async () => {
    expect(detectTtsDialect('https://api.mistral.ai/v1', 'x')).toBe('mistral');
    expect(detectTtsDialect('https://api.openai.com/v1', 'tts-1')).toBe('openai');
    expect(detectTtsDialect('https://proxy.example/v1', 'voxtral-mini-tts-latest')).toBe(
      'mistral',
    );
    expect(normalizeMistralTtsModel('voxtral-mini-tts-latest')).toBe(
      MISTRAL_VOXTRAL_MINI_TTS_MODEL,
    );
    expect(normalizeMistralTtsModel('voxtral-mini-tts-lastest')).toBe(
      MISTRAL_VOXTRAL_MINI_TTS_MODEL,
    );
    expect(normalizeMistralTtsModel('voxtral-mini-tts-2603')).toBe(
      'voxtral-mini-tts-2603',
    );

    const audioB64 = btoa(String.fromCharCode(9, 8, 7));
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ audio_data: audioB64 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchProviderSpeech(
      'Bonjour',
      {
        baseUrl: 'https://api.mistral.ai/v1',
        apiKey: 'msk-test',
        model: 'voxtral-mini-tts-latest',
        voice: 'voice-abc',
        rate: 1,
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.audioBase64).toBe(audioB64);
      expect(result.mimeType).toBe('audio/mpeg');
    }
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://api.mistral.ai/v1/audio/speech');
    const body = JSON.parse(call[1].body as string);
    expect(body.model).toBe(MISTRAL_VOXTRAL_MINI_TTS_MODEL);
    expect(body.voice_id).toBe('voice-abc');
    expect(body).not.toHaveProperty('voice');
    expect(body).not.toHaveProperty('speed');
    expect(body.stream).toBe(false);
  });
});

/**
 * @vitest-environment node
 */

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
  it('selects usable pool/custom credentials and returns null for unusable sources', () => {
    // First usable pool provider is picked implicitly.
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

    // Explicitly selected pool provider wins.
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

    // Missing pool provider -> null.
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

    // Disabled provider -> null.
    const disabled = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        poolProviderId: 'p1',
      },
      providers: [poolProvider({ id: 'p1', enabled: false })],
    });
    expect(pickTtsCredentials(disabled)).toBeNull();

    // Base-less provider -> null.
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

    // Valid custom source overrides the pool entirely.
    const custom = baseSettings({
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
    const customPick = pickTtsCredentials(custom);
    expect(customPick?.baseUrl).toBe('https://custom-tts.example/v1');
    expect(customPick?.apiKey).toBe('sk-custom');
    expect(customPick?.model).toBe('custom-model');
    expect(customPick?.voice).toBe('');

    // An empty (whitespace-only) custom base URL is rejected.
    const emptyCustom = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'custom',
        customBaseUrl: '  ',
        customApiKey: 'sk-custom',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    expect(pickTtsCredentials(emptyCustom)).toBeNull();
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
  it('clamps rate and merges partial tts settings (incl. languageOverrides defaulting)', () => {
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
    // languageOverrides defaults to [] and preserves array.
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

describe('resolveTtsStack', () => {
  it('resolves override credentials and falls back to global when an override is empty/missing', () => {
    // No matching row -> global pick with matchedOverride false.
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

    // A row that lacks creds inherits global creds with model/voice override.
    const inherited = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'tts-1',
        voice: 'alloy',
        languageOverrides: [{ language: 'vi', model: 'voxtral-mini-tts-2603', voice: 'vi-id' }],
      },
      providers: [poolProvider({ id: 'p1', baseUrl: 'https://api.mistral.ai/v1' })],
    });
    const inheritedStack = resolveTtsStack(inherited, 'vi-VN');
    expect(inheritedStack.matchedOverride).toBe(true);
    expect(inheritedStack.pick?.baseUrl).toBe('https://api.mistral.ai/v1');
    expect(inheritedStack.pick?.model).toBe('voxtral-mini-tts-2603');
    expect(inheritedStack.pick?.voice).toBe('vi-id');
    expect(inheritedStack.pick?.apiKey).toBe('sk-test');

    // Override custom credentials win when valid; global model retained.
    const custom = baseSettings({
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
    const customStack = resolveTtsStack(custom, 'en');
    expect(customStack.matchedOverride).toBe(true);
    expect(customStack.pick?.baseUrl).toBe('https://custom-tts.example/v1');
    expect(customStack.pick?.apiKey).toBe('sk-lang');
    expect(customStack.pick?.voice).toBe('en-voice');
    expect(customStack.pick?.model).toBe('global-model');

    // Empty override custom URL falls back to global credentials.
    const fallback = baseSettings({
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
    const fallbackStack = resolveTtsStack(fallback, 'ja');
    expect(fallbackStack.matchedOverride).toBe(true);
    expect(fallbackStack.pick?.baseUrl).toBe('https://api.openai.com/v1');
    expect(fallbackStack.pick?.voice).toBe('ja-voice');

    // Override poolProviderId wins when the override credentialSource is pool.
    const poolOverride = baseSettings({
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
    const poolStack = resolveTtsStack(poolOverride, 'ko');
    expect(poolStack.matchedOverride).toBe(true);
    expect(poolStack.pick?.baseUrl).toBe('https://tts-ko.example/v1');
    expect(poolStack.pick?.apiKey).toBe('sk-ko');
    expect(poolStack.pick?.voice).toBe('ko-v');
  });
});
