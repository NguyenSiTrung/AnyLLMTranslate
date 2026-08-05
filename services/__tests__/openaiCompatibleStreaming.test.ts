/**
 * Tests for SSE streaming translation in OpenAICompatibleService.
 *
 * Phase 2 Task 1 of pdf-perf-ux_20260703. Uses the REAL service with a mocked
 * `fetch` that returns a ReadableStream of SSE chunks — mirroring the
 * "integration test that catches contract bugs" pattern (cf. provider-pool-
 * resilience). The pure parsing helpers are tested separately in
 * lib/__tests__/sseStreamParser.test.ts.
 *
 * Streaming contract:
 * - translateStream() sends stream:true and consumes the SSE response body
 * - It invokes a per-piece callback as each paragraph's translation completes
 * - On [DONE] it finalizes and returns the full result map
 * - On a malformed/non-streamable response it throws → caller falls back
 * - Non-streaming translate() is unaffected
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAICompatibleService, ApiError } from '../openaiCompatible';
import type { TranslationRequest } from '@/types/translation';
import type { ProviderConfig } from '@/types/config';

const originalFetch = globalThis.fetch;

/** Minimal valid ProviderConfig for service construction in tests. */
function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    preset: 'custom',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    model: 'gpt-4',
    temperature: 0.3,
    maxTokens: 4096,
    displayName: 'Test',
    requiresApiKey: true,
    ...overrides,
  };
}

/** Build a ReadableStream<Uint8Array> from an array of string chunks. */
function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/** Build a mock Response with a streaming body. */
function makeStreamResponse(chunks: string[], status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    body: makeSSEStream(chunks),
    json: vi.fn(),
    text: vi.fn().mockResolvedValue(''),
    headers: new Headers(),
  } as unknown as Response;
}

function makeRequest(texts: Map<string, string>): TranslationRequest {
  return {
    texts,
    sourceLanguage: 'en',
    targetLanguage: 'vi',
  };
}

describe('OpenAICompatibleService.translateStream', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('covers streaming success, errors, fallback, and partial results', async () => {
    const texts = new Map([
      ['p1', 'Hello'],
      ['p2', 'World'],
    ]);

    // Stream the JSON object incrementally: p1 completes first, then p2.
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"{\\"p1\\":"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"\\"Xin"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" chào\\","}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"\\"p2\\":"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"\\"Th"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"ế giới\\"}"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":""}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStreamResponse(sseChunks),
    );

    const service = new OpenAICompatibleService(makeConfig({ apiKey: 'test-key', model: 'gpt-4' }));

    const pieceCallbacks: Array<{ id: string; text: string }> = [];
    const result = await service.translateStream(
      makeRequest(texts),
      (id, text) => pieceCallbacks.push({ id, text }),
    );

    // Verify stream:true was sent.
    const callBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(callBody.stream).toBe(true);

    // Final result has both pieces.
    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('Xin chào');
    expect(result.translations.get('p2')).toBe('Thế giới');

    // Each piece was emitted via the callback (incrementally).
    const p1Callbacks = pieceCallbacks.filter((c) => c.id === 'p1');
    const p2Callbacks = pieceCallbacks.filter((c) => c.id === 'p2');
    expect(p1Callbacks.length).toBeGreaterThanOrEqual(1);
    expect(p2Callbacks.length).toBeGreaterThanOrEqual(1);
    // The final callback for each should carry the complete text.
    expect(p1Callbacks[p1Callbacks.length - 1].text).toBe('Xin chào');
    expect(p2Callbacks[p2Callbacks.length - 1].text).toBe('Thế giới');

    // A single-shot response (all content in one chunk) works too.
    const singleTexts = new Map([['p1', 'Hi']]);
    const fullJson = '{"p1":"Xin chào"}';
    const singleChunks = [
      `data: {"choices":[{"delta":{"content":${JSON.stringify(fullJson)}}}]}\n\n`,
      'data: [DONE]\n\n',
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStreamResponse(singleChunks),
    );

    const singleService = new OpenAICompatibleService(makeConfig({ apiKey: 'test-key', model: 'gpt-4' }));
    const callbacks: Array<{ id: string; text: string }> = [];
    const singleResult = await singleService.translateStream(
      makeRequest(singleTexts),
      (id, text) => callbacks.push({ id, text }),
    );

    expect(singleResult.success).toBe(true);
    expect(singleResult.translations.get('p1')).toBe('Xin chào');
    expect(callbacks.some((c) => c.id === 'p1' && c.text === 'Xin chào')).toBe(true);
    {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStreamResponse([], 429),
    );

    const errorService = new OpenAICompatibleService(makeConfig({ apiKey: 'k', model: 'm' }));

    try {
      await errorService.translateStream(makeRequest(new Map([['p1', 'Hi']])), () => {});
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(429);
    }

    // An empty stream body is a content problem, not a failover — graceful fail.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStreamResponse(['data: [DONE]\n\n']),
    );

    const emptyService = new OpenAICompatibleService(makeConfig({ apiKey: 'k', model: 'm' }));

    const result = await emptyService.translateStream(
      makeRequest(new Map([['p1', 'Hi']])),
      () => {},
    );
    expect(result.success).toBe(false);
    }

    {
    // translate() should still work with a regular JSON response.
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: '{"p1":"Xin chào"}' } }],
      }),
      text: vi.fn(),
      headers: new Headers(),
    } as unknown as Response);

    const service = new OpenAICompatibleService(makeConfig({ apiKey: 'k', model: 'm' }));

    const result = await service.translate(makeRequest(new Map([['p1', 'Hi']])));
    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('Xin chào');

    // Verify stream was NOT set on the non-streaming request.
    const callBody = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(callBody.stream).toBeUndefined();
    }

    {
    const texts = new Map([
      ['p1', 'Hello'],
      ['p2', 'World'],
    ]);
    // Stream only completes p1; p2 is never delivered.
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"{\\"p1\\":\\"Xin chào\\"}"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStreamResponse(sseChunks),
    );

    const service = new OpenAICompatibleService(makeConfig({ apiKey: 'k', model: 'm' }));

    const result = await service.translateStream(makeRequest(texts), () => {});
    expect(result.success).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.translations.get('p1')).toBe('Xin chào');
    // p2 falls back to its original text.
    expect(result.translations.get('p2')).toBe('World');
    }
  });
});
