/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import {
  detectTtsDialect,
  fetchProviderSpeech,
  MISTRAL_VOXTRAL_MINI_TTS_MODEL,
  normalizeMistralTtsModel,
} from '@/lib/tts/providerTts';

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
