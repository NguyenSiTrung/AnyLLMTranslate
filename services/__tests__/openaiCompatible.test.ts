import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleService } from '../openaiCompatible';
import type { ProviderConfig } from '../../types/config';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';

const mockConfig: ProviderConfig = {
  preset: 'custom',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'gemma3:4b',
  temperature: 0.3,
  maxTokens: 4096,
  displayName: 'Ollama',
  requiresApiKey: false,
};

const mockConfigWithKey: ProviderConfig = {
  ...mockConfig,
  preset: 'custom',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test-key',
  model: 'gpt-4o-mini',
  displayName: 'Custom',
  requiresApiKey: true,
};

function mockFetchResponse(content: string, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: () => Promise.resolve({
      id: 'chatcmpl-test',
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    text: () => Promise.resolve(ok ? '' : `{"error":{"message":"Test error"}}`),
  });
}

describe('OpenAICompatibleService', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('translate', () => {
    it('translates a batch of texts successfully', async () => {
      const responseContent = JSON.stringify({
        translations: { p1: 'Xin chào', p2: 'Tạm biệt' },
      });
      globalThis.fetch = mockFetchResponse(responseContent);

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.translate({
        texts: new Map([['p1', 'Hello'], ['p2', 'Goodbye']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(true);
      expect(result.translations.get('p1')).toBe('Xin chào');
      expect(result.translations.get('p2')).toBe('Tạm biệt');
    });

    it('sets Authorization only when an API key is provided', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');
      await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'auto',
        targetLanguage: 'vi',
      });
      expect(
        ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.headers as Record<string, string>)[
          'Authorization'
        ],
      ).toBeUndefined();

      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');
      await new OpenAICompatibleService(mockConfigWithKey).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(
        ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.headers as Record<string, string>)[
          'Authorization'
        ],
      ).toBe('Bearer sk-test-key');
    });

    it('handles empty/malformed responses and partial ID back-fill', async () => {
      globalThis.fetch = mockFetchResponse('   ');
      const empty = await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(empty.success).toBe(false);
      expect(empty.error).toContain('Empty response');

      globalThis.fetch = mockFetchResponse('not json at all {{{');
      const bad = await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(bad.success).toBe(false);
      expect(bad.error).toBeDefined();

      // LLM returns only p1, omitting p2 — back-fill original + partial flag.
      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Xin chào' } }));
      const partial = await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([
          ['p1', 'Hello'],
          ['p2', 'Goodbye'],
        ]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(partial.success).toBe(true);
      expect(partial.partial).toBe(true);
      expect(partial.translations.get('p1')).toBe('Xin chào');
      expect(partial.translations.get('p2')).toBe('Goodbye');
      expect(partial.translations.size).toBe(2);
    });

    // FR-1: transport / auth / rate-limit failures must RE-THROW ApiError so the
    // provider pool's circuit-breaker + failover actually fires. The old behavior
    // swallowed every error into {success:false}, which made pool failover dead
    // code in production (only unit tests with throwing stubs passed).
    describe('FR-1: re-throws ApiError on transport/auth/rate-limit failures', () => {
      function httpError(status: number, statusText: string, body = '') {
        return vi.fn().mockResolvedValue({
          ok: false,
          status,
          statusText,
          text: () => Promise.resolve(body),
        });
      }

      it('throws ApiError(statusCode=429) on a rate-limit response', async () => {
        // 429 now retries with backoff (Phase 4) — use fake timers to avoid
        // the ~7s real-timer wait that would exceed the test timeout.
        vi.useFakeTimers();
        globalThis.fetch = httpError(429, 'Too Many Requests');
        const service = new OpenAICompatibleService(mockConfigWithKey);
        const promise = service.translate({
          texts: new Map([['p1', 'Hello']]),
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        });
        promise.catch(() => {});
        await vi.advanceTimersByTimeAsync(120_000);
        await expect(promise).rejects.toMatchObject({ name: 'ApiError', statusCode: 429 });
        vi.useRealTimers();
      });

      it('throws ApiError on a 5xx server error (and other transport/auth failures)', async () => {
        globalThis.fetch = httpError(503, 'Service Unavailable');
        const service = new OpenAICompatibleService(mockConfigWithKey);
        await expect(
          service.translate({
            texts: new Map([['p1', 'Hello']]),
            sourceLanguage: 'en',
            targetLanguage: 'vi',
          }),
        ).rejects.toMatchObject({ name: 'ApiError', statusCode: 503 });
      });
    });



    it('sends chat_template_kwargs.enable_thinking when thinkingMode is on/off', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService({ ...mockConfig, thinkingMode: 'off' }).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const offBody = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { chat_template_kwargs?: { enable_thinking?: boolean } };
      expect(offBody.chat_template_kwargs).toEqual({ enable_thinking: false });

      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService({ ...mockConfig, thinkingMode: 'on' }).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const onBody = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { chat_template_kwargs?: { enable_thinking?: boolean } };
      expect(onBody.chat_template_kwargs).toEqual({ enable_thinking: true });

      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService({ ...mockConfig, thinkingMode: 'auto' }).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const autoBody = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { chat_template_kwargs?: unknown };
      expect(autoBody.chat_template_kwargs).toBeUndefined();
    });

    it('sends reasoning_effort for Google AI Studio Gemini (2.x none, 3.x minimal)', async () => {
      const geminiConfig = {
        ...mockConfig,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-2.5-flash',
        thinkingMode: 'off' as const,
      };
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService(geminiConfig).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const flashOff = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as {
        reasoning_effort?: string;
        chat_template_kwargs?: unknown;
      };
      expect(flashOff.reasoning_effort).toBe('none');
      expect(flashOff.chat_template_kwargs).toBeUndefined();

      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService({
        ...geminiConfig,
        model: 'gemini-3.6-flash',
        thinkingMode: 'off',
      }).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const g3Off = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { reasoning_effort?: string };
      expect(g3Off.reasoning_effort).toBe('minimal');

      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService({
        ...geminiConfig,
        model: 'gemini-3.6-flash',
        thinkingMode: 'on',
      }).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const g3On = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { reasoning_effort?: string };
      expect(g3On.reasoning_effort).toBe('medium');

      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService({
        ...geminiConfig,
        model: 'gemini-3.6-flash',
        thinkingMode: 'on',
        thinkingEffort: 'high',
      }).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const g3High = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { reasoning_effort?: string };
      expect(g3High.reasoning_effort).toBe('high');
    });

    it('retries without chat_template_kwargs when provider rejects thinking kwargs', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () =>
            Promise.resolve(
              '{"error":{"message":"Unknown field: chat_template_kwargs"}}',
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () =>
            Promise.resolve({
              id: 'chatcmpl-test',
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: '{"translations":{"p1":"Xin chào"}}',
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }),
          text: () => Promise.resolve(''),
        });
      globalThis.fetch = fetchMock;

      const service = new OpenAICompatibleService({
        ...mockConfig,
        thinkingMode: 'off',
      });
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondBody = JSON.parse(fetchMock.mock.calls[1]![1]?.body as string) as {
        chat_template_kwargs?: unknown;
      };
      expect(secondBody.chat_template_kwargs).toBeUndefined();
    });

    it('retries without reasoning_effort when Gemini rejects thinking field', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () =>
            Promise.resolve('{"error":{"message":"Unknown field: reasoning_effort"}}'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () =>
            Promise.resolve({
              id: 'chatcmpl-test',
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: '{"translations":{"p1":"Xin chào"}}',
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }),
          text: () => Promise.resolve(''),
        });
      globalThis.fetch = fetchMock;

      const service = new OpenAICompatibleService({
        ...mockConfig,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-3.6-flash',
        thinkingMode: 'off',
      });
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstBody = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string) as {
        reasoning_effort?: string;
      };
      const secondBody = JSON.parse(fetchMock.mock.calls[1]![1]?.body as string) as {
        reasoning_effort?: unknown;
      };
      expect(firstBody.reasoning_effort).toBe('minimal');
      expect(secondBody.reasoning_effort).toBeUndefined();
    });

    it('retries without response_format when provider rejects it (NVIDIA NIM / vLLM)', async () => {
      // First call: 400 with response_format error (like NVIDIA NIM / vLLM).
      // Second call: success without response_format in the body.
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve(
            '{"error":{"message":"\'response_format\' with type \'json_object\' requires a JSON schema. Use \'response_format\' with type \'json_schema\' and provide a schema, or use \'guided_json\' directly with a JSON schema."}}',
          ),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({
            id: 'chatcmpl-test',
            choices: [{ message: { role: 'assistant', content: '{"translations":{"p1":"Xin chào"}}' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          text: () => Promise.resolve(''),
        });
      globalThis.fetch = fetchMock;

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(true);
      expect(result.translations.get('p1')).toBe('Xin chào');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Second call (retry) should NOT include response_format in the body.
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string) as {
        response_format?: unknown;
      };
      expect(secondBody.response_format).toBeUndefined();
    });

    it('skips response_format on subsequent requests after first rejection (no wasted failed call)', async () => {
      // First call: 400 with response_format error.
      // Second call: success without response_format (retry of first translate).
      // Third call: success without response_format (second translate — should
      //   NOT send response_format at all, no wasted 400).
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve(
            '{"error":{"message":"\'response_format\' with type \'json_object\' requires a JSON schema."}}',
          ),
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({
            id: 'chatcmpl-test',
            choices: [{ message: { role: 'assistant', content: '{"translations":{"p1":"Xin chào"}}' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          text: () => Promise.resolve(''),
        });
      globalThis.fetch = fetchMock;

      const service = new OpenAICompatibleService(mockConfig);

      // First translate: 1 failed + 1 retry = 2 calls.
      const result1 = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(result1.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Second translate: should succeed in 1 call (no wasted 400).
      const result2 = await service.translate({
        texts: new Map([['p1', 'World']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(result2.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3); // only +1, not +2

      // Third call should NOT include response_format.
      const thirdBody = JSON.parse(fetchMock.mock.calls[2][1]?.body as string) as {
        response_format?: unknown;
      };
      expect(thirdBody.response_format).toBeUndefined();
    });

    it('injects glossary/custom prompts and keeps prompt text out of console logs', async () => {
      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Học máy' } }));
      await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['p1', 'machine learning']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        glossaryBlock:
          'Translation Glossary (always use these translations):\n- "machine learning" → "học máy"',
      });
      let body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages[0]!.role).toBe('system');
      expect(body.messages[0]!.content).toContain('Translation Glossary');
      expect(body.messages[0]!.content).toContain('machine learning');

      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Xin chào' } }));
      await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages[0]!.content).not.toContain('Translation Glossary');

      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Xin chào' } }));
      await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        customSystemPrompt:
          'Custom prompt for {{targetLanguage}}. Return {"translations": {"p1": "x"}}. {{glossary}}',
      });
      body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages[0]!.content).toContain('Custom prompt for Vietnamese (vi)');

      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Xin chào' } }));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      for (const call of logSpy.mock.calls) {
        const flat = call.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join(' ');
        expect(flat).not.toContain('Hello');
        expect(flat).not.toContain('Xin chào');
      }
      logSpy.mockRestore();
    });
  });

  describe('testConnection', () => {
    it('returns success on valid response and errors on empty/network failure', async () => {
      globalThis.fetch = mockFetchResponse('{"status":"ok"}');
      expect((await new OpenAICompatibleService(mockConfig).testConnection()).success).toBe(true);

      globalThis.fetch = mockFetchResponse('');
      const empty = await new OpenAICompatibleService(mockConfig).testConnection();
      expect(empty.success).toBe(false);
      expect(empty.error).toContain('Empty response');

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const net = await new OpenAICompatibleService(mockConfig).testConnection();
      expect(net.success).toBe(false);
      expect(net.error).toContain('ECONNREFUSED');
    });
  });

  describe('updateConfig', () => {
    it('updates config and uses new values', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');

      const service = new OpenAICompatibleService(mockConfig);
      service.updateConfig(mockConfigWithKey);

      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain('api.example.com');
    });

    // FR-4 (fixes #3): response_format rejection memory must survive an
    // updateConfig when baseUrl+model are UNCHANGED (the pool's rebuild calls
    // updateConfig on preserved members even when nothing relevant changed —
    // forgetting the flag would re-pay the 400 on every request). The flag
    // resets ONLY on an actual provider/model switch.
    describe('FR-4: response_format memory keyed by baseUrl+model', () => {
      /** First call: 400 response_format rejection. Subsequent: success. */
      function rejectingThenOkFetch() {
        return vi
          .fn()
          .mockResolvedValueOnce({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: () =>
              Promise.resolve(
                '{"error":{"message":"\'response_format\' requires a JSON schema."}}',
              ),
          })
          .mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () =>
              Promise.resolve({
                id: 'test',
                choices: [
                  {
                    message: { role: 'assistant', content: '{"translations":{"p1":"x"}}' },
                    finish_reason: 'stop',
                  },
                ],
              }),
            text: () => Promise.resolve(''),
          });
      }

      const bodyHasResponseFormat = (call: unknown): boolean => {
        const init = (call as unknown[])[1] as { body: string };
        const body = JSON.parse(init.body) as { response_format?: unknown };
        return body.response_format !== undefined;
      };

      it('survives updateConfig when baseUrl+model are unchanged (no wasted 400)', async () => {
        globalThis.fetch = rejectingThenOkFetch();
        const service = new OpenAICompatibleService(mockConfigWithKey);

        // First translate: 400 → flag learned → retry without response_format.
        await service.translate({
          texts: new Map([['p1', 'Hello']]),
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        });
        const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;

        // updateConfig with the SAME baseUrl+model (e.g. only maxRpm changed —
        // exactly what the pool's rebuild does on a rate-limit settings tweak).
        service.updateConfig({ ...mockConfigWithKey, maxRpm: 30 });

        // Next request: flag MUST still be set → no response_format in body,
        // and only ONE fetch (no wasted 400 retry).
        await service.translate({
          texts: new Map([['p1', 'World']]),
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        });
        const callsAfterSecond = fetchMock.mock.calls.length;
        const lastBody = bodyHasResponseFormat(fetchMock.mock.calls[callsAfterSecond - 1]);
        expect(lastBody).toBe(false);
        // Exactly one fetch for the second translate (flag remembered).
        expect(fetchMock.mock.calls.length).toBe(3); // 2 (first) + 1 (second)
      });

      it('resets response_format memory when model or baseUrl changes', async () => {
        for (const patch of [
          { model: 'different-model' },
          { baseUrl: 'https://other/v1' },
        ] as const) {
          globalThis.fetch = rejectingThenOkFetch();
          const service = new OpenAICompatibleService(mockConfigWithKey);
          await service.translate({
            texts: new Map([['p1', 'Hello']]),
            sourceLanguage: 'en',
            targetLanguage: 'vi',
          });
          service.updateConfig({ ...mockConfigWithKey, ...patch });
          await service.translate({
            texts: new Map([['p1', 'World']]),
            sourceLanguage: 'en',
            targetLanguage: 'vi',
          });
          const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
          const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
          expect(bodyHasResponseFormat(lastCall)).toBe(true);
        }
      });
    });
  });

  describe('subtitle prompt routing + properNouns', () => {
    it('routes subtitle vs web prompts and attaches properNouns only on subtitle path', async () => {
      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { s1: 'Xin chào' } }));
      await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['s1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        subtitleKnobs: PROFILE_PRESETS.cinematic,
        customSystemPrompt: 'IGNORE ME — web custom prompt',
      });
      let body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages[0]!.content).toContain('subtitle translator');
      expect(body.messages[0]!.content).toContain('idiomatic, natural phrasing');
      expect(body.messages[0]!.content).not.toContain('IGNORE ME');
      expect(body.messages[0]!.content).toBe(
        buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.cinematic),
      );

      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { s1: 'Xin chào' } }));
      const webTemplate =
        'Translate to {{targetLanguage}} ONLY. {{glossary}}\nRespond with JSON {"translations": {}}.';
      await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['s1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        customSystemPrompt: webTemplate,
      });
      body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages[0]!.content).toContain('Vietnamese (vi)');
      expect(body.messages[0]!.content).not.toContain('subtitle translator');

      globalThis.fetch = mockFetchResponse(
        JSON.stringify({ translations: { s1: 'Hola' }, properNouns: { John: 'Juan' } }),
      );
      const subtitle = await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['s1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'es',
        subtitleKnobs: PROFILE_PRESETS.media,
        rollingGlossaryBlock:
          'Previously translated names in this content (use these consistently):\n- "John" → "Juan"',
      });
      expect(subtitle.success).toBe(true);
      expect(subtitle.properNouns).toEqual({ John: 'Juan' });
      body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages[0]!.content).toContain('Previously translated names');
      expect(body.messages[0]!.content).toContain('"John" → "Juan"');

      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Hola' } }));
      const web = await new OpenAICompatibleService(mockConfig).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'es',
        customSystemPrompt: null,
      });
      expect(web.success).toBe(true);
      expect(web.properNouns).toBeUndefined();
    });
  });

  describe('RPM rate limiter integration', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const mockTranslateResponse = () => {
      const content = JSON.stringify({ translations: { p1: 'test' } });
      return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        text: () => Promise.resolve(''),
      });
    };

    it('maxRpm from config (default/0/updateConfig) does not block a single request', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');
      // default config (no maxRpm) — unlimited
      const service = new OpenAICompatibleService(mockConfig);
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      // explicit maxRpm: 0 — unlimited
      const service0 = new OpenAICompatibleService({ ...mockConfig, maxRpm: 0 });
      await service0.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      // updateConfig changing maxRpm still yields exactly one call
      const serviceUpdate = new OpenAICompatibleService({ ...mockConfig, maxRpm: 0 });
      serviceUpdate.updateConfig({ ...mockConfig, maxRpm: 30 });
      await serviceUpdate.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('acquire() is awaited before fetch (call order verified)', async () => {
      vi.useFakeTimers();
      const fetchSpy = mockTranslateResponse();
      globalThis.fetch = fetchSpy;

      // FR-5: acquire() is now bounded by requestTimeoutMs. Set it generously
      // (120s) so the 60s rate-limit wait completes within the deadline.
      const service = new OpenAICompatibleService({
        ...mockConfig,
        maxRpm: 1,
        requestTimeoutMs: 120_000,
      });

      const p1 = service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const p2 = service.translate({
        texts: new Map([['p1', 'World']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_001);
      await Promise.all([p1, p2]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('changing maxRpm via updateConfig from 0 to N enables limiting', async () => {
      vi.useFakeTimers();
      const fetchSpy = mockTranslateResponse();
      globalThis.fetch = fetchSpy;

      // FR-5: acquire() is bounded by requestTimeoutMs — set it generously.
      const service = new OpenAICompatibleService({
        ...mockConfig,
        maxRpm: 0,
        requestTimeoutMs: 120_000,
      });
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      service.updateConfig({ ...mockConfig, maxRpm: 1, requestTimeoutMs: 120_000 });

      await service.translate({
        texts: new Map([['p1', 'World']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const p3 = service.translate({
        texts: new Map([['p1', 'Foo']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(60_001);
      await p3;
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  // FR-1: detectPageCategory + classifyPdfParagraphs must re-throw ApiError on
  // transport/auth/rate-limit (so the pool can fail over) while still returning
  // {success:false} for content/parse failures of an otherwise-200 response.
  describe('FR-1: detectPageCategory / classifyPdfParagraphs / resegmentYoutubeAsr contracts', () => {
    const ctx = { title: 't', description: 'd', domain: 'x.com' };
    const units = [
      { text: 'Hello', startMs: 0, endMs: 300 },
      { text: 'there', startMs: 300, endMs: 600 },
      { text: 'friend', startMs: 600, endMs: 1000 },
      { text: 'how', startMs: 1200, endMs: 1400 },
      { text: 'are', startMs: 1400, endMs: 1600 },
      { text: 'you', startMs: 1600, endMs: 1900 },
    ];

    it('detectPageCategory: throws on 429, fails parse, succeeds on valid JSON', async () => {
      vi.useFakeTimers();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve(''),
      });
      const promise = new OpenAICompatibleService(mockConfigWithKey).detectPageCategory(ctx);
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(promise).rejects.toMatchObject({ name: 'ApiError', statusCode: 429 });
      vi.useRealTimers();

      globalThis.fetch = mockFetchResponse('not json {{{');
      const bad = await new OpenAICompatibleService(mockConfig).detectPageCategory(ctx);
      expect(bad.success).toBe(false);
      expect(bad.error).toContain('Failed to parse category');

      globalThis.fetch = mockFetchResponse(JSON.stringify({ category: 'technology' }));
      const ok = await new OpenAICompatibleService(mockConfig).detectPageCategory(ctx);
      expect(ok.success).toBe(true);
      expect(ok.category).toBe('technology');
    });

    it('classifyPdfParagraphs: throws on 503, fails empty/parse, succeeds + empty short-circuit', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve(''),
      });
      await expect(
        new OpenAICompatibleService(mockConfigWithKey).classifyPdfParagraphs([
          { id: 'p1', text: 'hi' },
        ]),
      ).rejects.toMatchObject({ name: 'ApiError', statusCode: 503 });

      globalThis.fetch = mockFetchResponse('not json {{{');
      const parseFail = await new OpenAICompatibleService(mockConfig).classifyPdfParagraphs([
        { id: 'p1', text: 'hi' },
      ]);
      expect(parseFail.success).toBe(false);
      expect(parseFail.error).toContain('Failed to parse classification');

      globalThis.fetch = mockFetchResponse('   ');
      const empty = await new OpenAICompatibleService(mockConfig).classifyPdfParagraphs([
        { id: 'p1', text: 'hi' },
      ]);
      expect(empty.success).toBe(false);
      expect(empty.error).toContain('Empty response');

      globalThis.fetch = mockFetchResponse(JSON.stringify({ labels: { p1: 'prose' } }));
      const ok = await new OpenAICompatibleService(mockConfig).classifyPdfParagraphs([
        { id: 'p1', text: 'hi' },
      ]);
      expect(ok.success).toBe(true);
      expect(ok.labels?.p1).toBe('prose');

      globalThis.fetch = vi.fn();
      const short = await new OpenAICompatibleService(mockConfig).classifyPdfParagraphs([]);
      expect(short.success).toBe(true);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('resegmentYoutubeAsr: valid cues, parse fail, 503 throw, empty short-circuit', async () => {
      globalThis.fetch = mockFetchResponse(
        JSON.stringify({ segments: [{ start: 0, end: 2 }, { start: 3, end: 5 }] }),
      );
      const ok = await new OpenAICompatibleService(mockConfig).resegmentYoutubeAsr(units, 'en');
      expect(ok.success).toBe(true);
      expect(ok.cues).toHaveLength(2);
      expect(ok.cues?.[0]!.text).toMatch(/Hello there friend/i);
      expect(ok.cues?.[1]!.text).toMatch(/how are you/i);

      globalThis.fetch = mockFetchResponse('not json {{{');
      const bad = await new OpenAICompatibleService(mockConfig).resegmentYoutubeAsr(units, 'en');
      expect(bad.success).toBe(false);
      expect(bad.error).toMatch(/parse/i);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve(''),
      });
      await expect(
        new OpenAICompatibleService(mockConfigWithKey).resegmentYoutubeAsr(units, 'en'),
      ).rejects.toMatchObject({ name: 'ApiError', statusCode: 503 });

      globalThis.fetch = vi.fn();
      const empty = await new OpenAICompatibleService(mockConfig).resegmentYoutubeAsr([], 'en');
      expect(empty.success).toBe(true);
      expect(empty.cues).toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});

