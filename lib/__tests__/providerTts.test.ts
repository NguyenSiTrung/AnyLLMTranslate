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
  it('posts to speech endpoint and returns base64', async () => {
    const audio = new Uint8Array([1, 2, 3, 4]).buffer;
    const fetchImpl = vi.fn(async () =>
      new Response(audio, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );

    const result = await fetchProviderSpeech(
      'Hello world',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'tts-1',
        voice: 'alloy',
        rate: 1,
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.mimeType).toBe('audio/mpeg');
      expect(result.audioBase64).toBe(btoa(String.fromCharCode(1, 2, 3, 4)));
    }
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.input).toBe('Hello world');
    expect(body.voice).toBe('alloy');
  });

  it('returns error on non-ok response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'bad key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fetchProviderSpeech(
      'Hi',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'bad',
        model: 'tts-1',
        voice: 'alloy',
        rate: 1,
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/401/);
      expect(result.error).toMatch(/bad key/);
    }
  });

  it('omits voice from body when voice is empty', async () => {
    const fetchImpl = vi.fn(async () =>
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
      fetchImpl as unknown as typeof fetch,
    );

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('tts-1');
    expect(body.speed).toBe(1.2);
    expect(body).not.toHaveProperty('voice');
  });

  it('includes voice when non-empty', async () => {
    const fetchImpl = vi.fn(async () =>
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
      fetchImpl as unknown as typeof fetch,
    );

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string);
    expect(body.voice).toBe('alloy');
  });

  it('returns error when model is empty without calling fetch', async () => {
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
  });

  it('detects mistral dialect and normalizes voxtral model aliases', () => {
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
  });

  it('sends Mistral voice_id body and decodes audio_data JSON', async () => {
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

  it('requires voice_id for Mistral without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchProviderSpeech(
      'Hi',
      {
        baseUrl: 'https://api.mistral.ai/v1',
        apiKey: 'msk',
        model: 'voxtral-mini-tts-2603',
        voice: '',
        rate: 1,
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/voice_id/i);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
