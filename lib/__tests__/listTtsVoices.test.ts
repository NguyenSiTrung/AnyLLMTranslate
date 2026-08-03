/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import {
  listTtsVoices,
  parseTtsVoicesResponse,
  voicesEndpointFromBaseUrl,
} from '@/lib/tts/listTtsVoices';

describe('voicesEndpointFromBaseUrl', () => {
  it('builds /audio/voices from /v1 base', () => {
    expect(voicesEndpointFromBaseUrl('https://api.mistral.ai/v1')).toBe(
      'https://api.mistral.ai/v1/audio/voices',
    );
    expect(voicesEndpointFromBaseUrl('https://api.mistral.ai/v1/')).toBe(
      'https://api.mistral.ai/v1/audio/voices',
    );
  });
});

describe('parseTtsVoicesResponse', () => {
  it('parses Mistral items, string arrays, and data arrays', () => {
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
  });
});

describe('listTtsVoices', () => {
  it('GETs voices endpoint and returns choices on ok, error on non-ok', async () => {
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
