/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchProviderSpeech } from '@/lib/tts/providerTts';

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
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
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
});
