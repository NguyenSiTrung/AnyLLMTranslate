import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleService, ApiError } from '../openaiCompatible';
import type { TranslationRequest } from '@/types/translation';
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
    OpenAICompatibleService.__setRetryBackoffForTest(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    OpenAICompatibleService.__setRetryBackoffForTest(false);
  });

  describe('translate', () => {
    it('covers successful batches, empty responses, auth headers, and partial back-fill', async () => {
      const responseContent = JSON.stringify({
        translations: { p1: 'Xin chào', p2: 'Tạm biệt' },
      });
      globalThis.fetch = mockFetchResponse(responseContent);

      const service = new OpenAICompatibleService(mockConfig);
      const batchResult = await service.translate({
        texts: new Map([['p1', 'Hello'], ['p2', 'Goodbye']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(batchResult.success).toBe(true);
      expect(batchResult.translations.get('p1')).toBe('Xin chào');
      expect(batchResult.translations.get('p2')).toBe('Tạm biệt');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () =>
          Promise.resolve({
            id: 'chatcmpl-empty',
            choices: [
              {
                message: { role: 'assistant', content: null },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 42, completion_tokens: 0, total_tokens: 42 },
          }),
        text: () => Promise.resolve(''),
      });

      const emptyService = new OpenAICompatibleService(mockConfigWithKey);
      const emptyResult = await emptyService.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(emptyResult.success).toBe(false);
      expect(emptyResult.error).toMatch(/Empty response from LLM/i);
      expect(emptyResult.error).toMatch(/content=null/);
      expect(emptyResult.error).toMatch(/completion_tokens=0/);
      expect(emptyResult.error).toMatch(/model id is correct/i);

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

    it('covers thinking request fields and retries when providers reject them; retries without response_format when provider rejects it and skips on subsequent requests', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService({ ...mockConfig, thinkingMode: 'off' }).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const offBody = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as {
        enable_thinking?: boolean;
        chat_template_kwargs?: { enable_thinking?: boolean };
      };
      expect(offBody.enable_thinking).toBe(false);
      expect(offBody.chat_template_kwargs).toEqual({ enable_thinking: false });

      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService({ ...mockConfig, thinkingMode: 'on' }).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const onBody = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as {
        enable_thinking?: boolean;
        chat_template_kwargs?: { enable_thinking?: boolean };
      };
      expect(onBody.enable_thinking).toBe(true);
      expect(onBody.chat_template_kwargs).toEqual({ enable_thinking: true });

      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"hi"}}');
      await new OpenAICompatibleService({ ...mockConfig, thinkingMode: 'auto' }).translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      const autoBody = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body as string,
      ) as { enable_thinking?: unknown; chat_template_kwargs?: unknown };
      expect(autoBody.enable_thinking).toBeUndefined();
      expect(autoBody.chat_template_kwargs).toBeUndefined();

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
        enable_thinking?: unknown;
        chat_template_kwargs?: unknown;
      };
      expect(flashOff.reasoning_effort).toBe('none');
      expect(flashOff.enable_thinking).toBeUndefined();
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
      {
      // Scenario 1: chat_template_kwargs rejected → retry without it.
      const fetchKwargs = vi
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
      globalThis.fetch = fetchKwargs;

      const kwargsService = new OpenAICompatibleService({
        ...mockConfig,
        thinkingMode: 'off',
      });
      const kwargsResult = await kwargsService.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(kwargsResult.success).toBe(true);
      expect(fetchKwargs).toHaveBeenCalledTimes(2);
      const kwargsSecondBody = JSON.parse(fetchKwargs.mock.calls[1]![1]?.body as string) as {
        enable_thinking?: unknown;
        chat_template_kwargs?: unknown;
      };
      expect(kwargsSecondBody.chat_template_kwargs).toBeUndefined();
      expect(kwargsSecondBody.enable_thinking).toBeUndefined();

      // Scenario 2: Gemini rejects reasoning_effort → retry without it.
      const fetchEffort = vi
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
      globalThis.fetch = fetchEffort;

      const effortService = new OpenAICompatibleService({
        ...mockConfig,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-3.6-flash',
        thinkingMode: 'off',
      });
      const effortResult = await effortService.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(effortResult.success).toBe(true);
      expect(fetchEffort).toHaveBeenCalledTimes(2);
      const effortFirstBody = JSON.parse(fetchEffort.mock.calls[0]![1]?.body as string) as {
        reasoning_effort?: string;
      };
      const effortSecondBody = JSON.parse(fetchEffort.mock.calls[1]![1]?.body as string) as {
        reasoning_effort?: unknown;
      };
      expect(effortFirstBody.reasoning_effort).toBe('minimal');
      expect(effortSecondBody.reasoning_effort).toBeUndefined();
      }

      // facet: retries without response_format when provider rejects it and
      // skips on subsequent requests.
      // First call: 400 with response_format error (like NVIDIA NIM / vLLM).
      // Second call: success without response_format (retry of first translate).
      // Third call: success without response_format (second translate — should
      //   NOT send response_format at all, no wasted 400).
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve(
            '{"error":{"message":"\'response_format\' with type \'json_object\' requires a JSON schema. Use \'response_format\' with type \'json_schema\' and provide a schema, or use \'guided_json\' directly with a JSON schema."}}',
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
      expect(result1.translations.get('p1')).toBe('Xin chào');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Second call (retry) should NOT include response_format in the body.
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string) as {
        response_format?: unknown;
      };
      expect(secondBody.response_format).toBeUndefined();

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

        for (const patch of [
          { model: 'different-model' },
          { baseUrl: 'https://other/v1' },
        ] as const) {
          globalThis.fetch = rejectingThenOkFetch();
          const resetService = new OpenAICompatibleService(mockConfigWithKey);
          await resetService.translate({
            texts: new Map([['p1', 'Hello']]),
            sourceLanguage: 'en',
            targetLanguage: 'vi',
          });
          resetService.updateConfig({ ...mockConfigWithKey, ...patch });
          await resetService.translate({
            texts: new Map([['p1', 'World']]),
            sourceLanguage: 'en',
            targetLanguage: 'vi',
          });
          const resetFetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
          const lastCall = resetFetchMock.mock.calls[resetFetchMock.mock.calls.length - 1];
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

    it('covers RPM defaults, dynamic limiting, and acquire-before-fetch ordering', async () => {
      // Phase 1: maxRpm from config (default/0/updateConfig) does not block a
      // single request.
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

      // Phase 2: changing maxRpm via updateConfig from 0 to N enables limiting.
      vi.useFakeTimers();
      const fetchSpy = mockTranslateResponse();
      globalThis.fetch = fetchSpy;

      // FR-5: acquire() is bounded by requestTimeoutMs — set it generously.
      const limited = new OpenAICompatibleService({
        ...mockConfig,
        maxRpm: 0,
        requestTimeoutMs: 120_000,
      });
      await limited.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      limited.updateConfig({ ...mockConfig, maxRpm: 1, requestTimeoutMs: 120_000 });

      await limited.translate({
        texts: new Map([['p1', 'World']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const p3 = limited.translate({
        texts: new Map([['p1', 'Foo']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(60_001);
      await p3;
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      {
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
      }
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

    it('detectPageCategory, classifyPdfParagraphs, and resegmentYoutubeAsr: re-throw ApiError on transport/rate-limit while returning {success:false} for content/parse failures, with empty short-circuits; stops issuing LLM batches once the run is aborted (Stop)', async () => {
      // detectPageCategory: throws on 429, fails parse, succeeds on valid JSON
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
      const unknown = await new OpenAICompatibleService(mockConfig).detectPageCategory(ctx);
      expect(unknown.success).toBe(true);
      expect(unknown.category).toBe('Other');

      globalThis.fetch = mockFetchResponse(JSON.stringify({ category: 'software development' }));
      const dOk = await new OpenAICompatibleService(mockConfig).detectPageCategory(ctx);
      expect(dOk.success).toBe(true);
      expect(dOk.category).toBe('Software Development');

      // Enriched signals should appear in the user prompt.
      globalThis.fetch = mockFetchResponse(JSON.stringify({ category: 'News' }));
      const enriched = await new OpenAICompatibleService(mockConfig).detectPageCategory({
        ...ctx,
        pathname: '/world/latest',
        h1: 'Breaking update',
        ogType: 'article',
        schemaTypes: ['NewsArticle'],
      });
      expect(enriched.success).toBe(true);
      expect(enriched.category).toBe('News');
      const body = JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
      const userContent = body.messages.find((m: { role: string }) => m.role === 'user').content as string;
      expect(userContent).toContain('/world/latest');
      expect(userContent).toContain('Breaking update');
      expect(userContent).toContain('article');
      expect(userContent).toContain('NewsArticle');

      // classifyPdfParagraphs: throws on 503, fails empty/parse, succeeds + empty short-circuit
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
      const cParseFail = await new OpenAICompatibleService(mockConfig).classifyPdfParagraphs([
        { id: 'p1', text: 'hi' },
      ]);
      expect(cParseFail.success).toBe(false);
      expect(cParseFail.error).toContain('Failed to parse classification');

      globalThis.fetch = mockFetchResponse('   ');
      const cEmpty = await new OpenAICompatibleService(mockConfig).classifyPdfParagraphs([
        { id: 'p1', text: 'hi' },
      ]);
      expect(cEmpty.success).toBe(false);
      expect(cEmpty.error).toContain('Empty response');

      globalThis.fetch = mockFetchResponse(JSON.stringify({ labels: { p1: 'prose' } }));
      const cOk = await new OpenAICompatibleService(mockConfig).classifyPdfParagraphs([
        { id: 'p1', text: 'hi' },
      ]);
      expect(cOk.success).toBe(true);
      expect(cOk.labels?.p1).toBe('prose');

      globalThis.fetch = vi.fn();
      const cShort = await new OpenAICompatibleService(mockConfig).classifyPdfParagraphs([]);
      expect(cShort.success).toBe(true);
      expect(globalThis.fetch).not.toHaveBeenCalled();

      // resegmentYoutubeAsr: valid cues, parse fail, 503 throw, empty short-circuit
      globalThis.fetch = mockFetchResponse(
        JSON.stringify({ segments: [{ start: 0, end: 2 }, { start: 3, end: 5 }] }),
      );
      const rOk = await new OpenAICompatibleService(mockConfig).resegmentYoutubeAsr(units, 'en');
      expect(rOk.success).toBe(true);
      expect(rOk.cues).toHaveLength(2);
      expect(rOk.cues?.[0]!.text).toMatch(/Hello there friend/i);
      expect(rOk.cues?.[1]!.text).toMatch(/how are you/i);

      globalThis.fetch = mockFetchResponse('not json {{{');
      const rBad = await new OpenAICompatibleService(mockConfig).resegmentYoutubeAsr(units, 'en');
      expect(rBad.success).toBe(false);
      expect(rBad.error).toMatch(/parse/i);

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
      const rEmpty = await new OpenAICompatibleService(mockConfig).resegmentYoutubeAsr([], 'en');
      expect(rEmpty.success).toBe(true);
      expect(rEmpty.cues).toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();

      const many = Array.from({ length: 130 }, (_, i) => ({
        text: `w${i}`,
        startMs: i * 100,
        endMs: i * 100 + 80,
      }));
      // Two batches at AI_ASR_BATCH_SIZE=120
      globalThis.fetch = mockFetchResponse(
        JSON.stringify({
          segments: [{ start: 0, end: 119 }],
        }),
      );
      // Second call needs a valid range relative to batch offset handling —
      // mock returns global-style ranges; use full-span parse-friendly payload twice.
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        call++;
        const segments =
          call === 1
            ? [{ start: 0, end: 119 }]
            : [{ start: 0, end: 9 }];
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            id: 'chatcmpl-test',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ segments }),
                },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          text: async () => '',
        };
      });

      const progress: Array<[number, number]> = [];
      const result = await new OpenAICompatibleService(mockConfig).resegmentYoutubeAsr(
        many,
        'en',
        (current, total) => progress.push([current, total]),
      );
      expect(result.success).toBe(true);
      expect(progress).toEqual([
        [1, 2],
        [2, 2],
      ]);

      // facet: stops issuing LLM batches once the run is aborted (Stop).
      const abortMany = Array.from({ length: 130 }, (_, i) => ({
        text: `w${i}`,
        startMs: i * 100,
        endMs: i * 100 + 80,
      }));
      const controller = new AbortController();
      let fetchCalls = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCalls++;
        // Stop lands while batch 1 is in flight: its request completes, batch 2
        // must never be issued.
        if (fetchCalls === 1) controller.abort();
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            id: 'chatcmpl-test',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ segments: [{ start: 0, end: 119 }] }),
                },
                finish_reason: 'stop',
              },
            ],
          }),
          text: async () => '',
        };
      });

      // Stop lands while batch 1 is in flight (see the fetch mock).
      const abortResult = await new OpenAICompatibleService(mockConfig).resegmentYoutubeAsr(
        abortMany,
        'en',
        undefined,
        controller.signal,
      );

      expect(abortResult).toEqual({ success: false, error: 'cancelled' });
      expect(fetchCalls).toBe(1);
    });
  });
});

// ── Shared service-test helpers (merged streaming/retry suites) ──────────────

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

function makeRequest(texts: Map<string, string>): TranslationRequest {
  return {
    texts,
    sourceLanguage: 'en',
    targetLanguage: 'vi',
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


describe('OpenAICompatibleService.translateStream', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('rejects immediately on an already-aborted signal (stream and non-stream) and cancels the reader when the caller aborts after headers while a read is pending', async () => {
    // facet: rejects immediately when the caller abort signal is already aborted.
    {
      const controller = new AbortController();
      controller.abort();

      const request = { ...makeRequest(new Map([['p1', 'Hi']])), signal: controller.signal };

      const service = new OpenAICompatibleService(
        makeConfig({ requestTimeoutMs: 60000 }),
      );

      const deadline = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('test deadline')), 100);
      });

      await expect(
        Promise.race([
          service.translateStream(request, () => {}),
          deadline,
        ]),
      ).rejects.toThrow('cancelled');

      expect(globalThis.fetch).not.toHaveBeenCalled();
    }

    // facet: rejects immediately when non-stream translate receives an
    // already-aborted signal and does not call fetch.
    {
      const controller = new AbortController();
      controller.abort();

      const service = new OpenAICompatibleService(makeConfig());

      const request = {
        ...makeRequest(new Map([['p1', 'Hi']])),
        signal: controller.signal,
      };

      await expect(service.translate(request)).rejects.toThrow(/cancelled/i);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    }

    // facet: rejects and cancels reader when caller aborts after headers while
    // read is pending.
    {
      const controller = new AbortController();
      let onReadCalled: () => void = () => {};
      const readCalled = new Promise<void>((resolve) => {
        onReadCalled = resolve;
      });
      const reader = {
        read: vi.fn().mockImplementation(() => {
          onReadCalled();
          return new Promise<never>(() => {});
        }),
        cancel: vi.fn().mockResolvedValue(undefined),
        releaseLock: vi.fn(),
      };

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: { getReader: () => reader },
        json: vi.fn(),
        text: vi.fn().mockResolvedValue(''),
        headers: new Headers(),
      } as unknown as Response);

      const service = new OpenAICompatibleService(makeConfig({ requestTimeoutMs: 1000 }));
      const p = service.translateStream(
        { ...makeRequest(new Map([['p1', 'Hi']])), signal: controller.signal },
        () => {},
      );

      await readCalled;
      controller.abort();

      await expect(p).rejects.toThrow(/cancelled/i);
      expect(reader.cancel).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects with idle timeout and cancels the reader using fake timers', async () => {
    vi.useFakeTimers();

    const reader = {
      read: vi.fn().mockImplementation(() => new Promise<never>(() => {})),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: { getReader: () => reader },
      json: vi.fn(),
      text: vi.fn().mockResolvedValue(''),
      headers: new Headers(),
    } as unknown as Response);

    const service = new OpenAICompatibleService(makeConfig({ requestTimeoutMs: 50 }));
    const p = service.translateStream(makeRequest(new Map([['p1', 'Hi']])), () => {});
    const rejected = expect(p).rejects.toThrow('Stream response timed out after 50ms');

    await vi.advanceTimersByTimeAsync(50);

    await rejected;
    expect(reader.cancel).toHaveBeenCalledTimes(1);
  });
});

function make429Response(retryAfter?: string): Response {
  const headers = new Headers();
  if (retryAfter !== undefined) {
    headers.set('retry-after', retryAfter);
  }
  return {
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
    headers,
  } as unknown as Response;
}

/** Build a mock 500 Response. */
function make500Response(): Response {
  return {
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
    headers: new Headers(),
  } as unknown as Response;
}

/** Build a mock 200 Response with the given content. */
function make200Response(content: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () =>
      Promise.resolve({
        choices: [{ message: { content }, finish_reason: 'stop' }],
      }),
    text: () => Promise.resolve(''),
    headers: new Headers(),
  } as unknown as Response;
}

/** Advance fake timers enough to flush all pending retry delays. */
async function flushTimers(): Promise<void> {
  // Max total delay for 429: 1000*2^0 + 1000*2^1 + 1000*2^2 + jitter ≈ 8500ms.
  // For HTTP-date Retry-After tests we use 10s, so 120_000 covers everything.
  await vi.advanceTimersByTimeAsync(120_000);
}

/** Start a translate call and attach an early catch handler to prevent
 *  unhandled-rejection warnings while fake timers flush the retry delays. */
function startTranslate(
  service: OpenAICompatibleService,
  texts: Map<string, string>,
): Promise<{ success: boolean; translations: Map<string, string>; error?: string }> {
  const promise = service.translate(makeRequest(texts));
  promise.catch(() => {});
  return promise;
}

describe('OpenAICompatibleService — 429 retry with backoff + jitter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  // ── Retry-After header ──────────────────────────────────────────────────

  it('covers the full retry matrix: Retry-After (seconds/HTTP-date), exponential backoff + jitter, cap message, zero-retry override, non-429 paths, and success-after-retry', async () => {
    // ── Retry-After header (seconds) ────────────────────────────────────────
    const fetchTimes: number[] = [];
    const fetchMock = vi.fn().mockImplementation(() => {
      fetchTimes.push(Date.now());
      return Promise.resolve(make429Response('2'));
    });
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(promise).rejects.toThrow(ApiError);

    // 4 fetch calls: 1 initial + 3 retries.
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Gap between first and second fetch should be >= 2000ms (Retry-After: 2s)
    // and <= 2500ms (2000 + 500 jitter).
    const gap = fetchTimes[1] - fetchTimes[0];
    expect(gap).toBeGreaterThanOrEqual(2000);
    expect(gap).toBeLessThanOrEqual(2500);

    // ── Retry-After header (HTTP-date) ─────────────────────────────────────
    const retryAfterDate = new Date(Date.now() + 10000).toUTCString();
    const dateFetchTimes: number[] = [];
    const dateFetchMock = vi.fn().mockImplementation(() => {
      dateFetchTimes.push(Date.now());
      return Promise.resolve(make429Response(retryAfterDate));
    });
    globalThis.fetch = dateFetchMock;

    const dateService = new OpenAICompatibleService(makeConfig());
    const datePromise = startTranslate(dateService, new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(datePromise).rejects.toThrow(ApiError);

    const dateGap = dateFetchTimes[1] - dateFetchTimes[0];
    expect(dateGap).toBeGreaterThanOrEqual(9000);
    expect(dateGap).toBeLessThanOrEqual(10500);

    // ── Exponential backoff (no Retry-After) ───────────────────────────────
    const backoffTimes: number[] = [];
    const backoffFetch = vi.fn().mockImplementation(() => {
      backoffTimes.push(Date.now());
      return Promise.resolve(make429Response());
    });
    globalThis.fetch = backoffFetch;

    const backoffService = new OpenAICompatibleService(makeConfig());
    const backoffPromise = startTranslate(backoffService, new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(backoffPromise).rejects.toThrow(ApiError);

    expect(backoffFetch).toHaveBeenCalledTimes(4);

    // First retry delay: base * 2^0 + jitter = 1000 + [0,500] -> [1000, 1500]
    const gap1 = backoffTimes[1] - backoffTimes[0];
    expect(gap1).toBeGreaterThanOrEqual(1000);
    expect(gap1).toBeLessThanOrEqual(1500);

    // Second retry delay: base * 2^1 + jitter = 2000 + [0,500] -> [2000, 2500]
    const gap2 = backoffTimes[2] - backoffTimes[1];
    expect(gap2).toBeGreaterThanOrEqual(2000);
    expect(gap2).toBeLessThanOrEqual(2500);

    // Third retry delay: base * 2^2 + jitter = 4000 + [0,500] -> [4000, 4500]
    const gap3 = backoffTimes[3] - backoffTimes[2];
    expect(gap3).toBeGreaterThanOrEqual(4000);
    expect(gap3).toBeLessThanOrEqual(4500);

    // ── Cap message + zero-retry override ──────────────────────────────────
    const capFetch = vi.fn().mockResolvedValue(make429Response());
    globalThis.fetch = capFetch;
    const capService = new OpenAICompatibleService(makeConfig());
    const capPromise = startTranslate(capService, new Map([['p1', 'Hello']]));
    await flushTimers();

    let thrown: unknown;
    try {
      await capPromise;
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).statusCode).toBe(429);
    expect((thrown as ApiError).message).toContain('Rate limit exceeded');
    expect((thrown as ApiError).message).toContain('batch size');
    expect(capFetch).toHaveBeenCalledTimes(4);

    const immediateFetch = vi.fn().mockResolvedValue(make429Response());
    globalThis.fetch = immediateFetch;
    const immediateService = new OpenAICompatibleService(makeConfig());
    immediateService.setMax429Retries(0);
    const immediatePromise = startTranslate(
      immediateService,
      new Map([['p1', 'Hello']]),
    );
    await flushTimers();
    await expect(immediatePromise).rejects.toMatchObject({ name: 'ApiError', statusCode: 429 });
    expect(immediateFetch).toHaveBeenCalledTimes(1);
    immediateService.setMax429Retries(null);

    // ── Non-429 errors use the existing retry path ─────────────────────────
    // 500 → existing retry (1 initial + 1 retry = 2 calls)
    const fetch500 = vi.fn().mockResolvedValue(make500Response());
    globalThis.fetch = fetch500;
    const service500 = new OpenAICompatibleService(makeConfig());
    const p500 = startTranslate(service500, new Map([['p1', 'Hello']]));
    await flushTimers();
    let thrown500: unknown;
    try {
      await p500;
    } catch (error) {
      thrown500 = error;
    }
    expect(thrown500).toBeInstanceOf(ApiError);
    expect((thrown500 as ApiError).statusCode).toBe(500);
    expect(fetch500).toHaveBeenCalledTimes(2);

    // network error → existing retry path (2 calls)
    const fetchNet = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    globalThis.fetch = fetchNet;
    const pNet = startTranslate(new OpenAICompatibleService(makeConfig()), new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(pNet).rejects.toThrow('ECONNREFUSED');
    expect(fetchNet).toHaveBeenCalledTimes(2);

    // 401 client error → not retried at all (1 call)
    const fetch401 = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('{"error":{"message":"Invalid API key"}}'),
      json: () => Promise.resolve({}),
      headers: new Headers(),
    } as unknown as Response);
    globalThis.fetch = fetch401;
    const p401 = startTranslate(new OpenAICompatibleService(makeConfig()), new Map([['p1', 'Hello']]));
    await flushTimers();
    let thrown401: unknown;
    try {
      await p401;
    } catch (error) {
      thrown401 = error;
    }
    expect(thrown401).toBeInstanceOf(ApiError);
    expect((thrown401 as ApiError).statusCode).toBe(401);
    expect(fetch401).toHaveBeenCalledTimes(1);

    // ── Success after 429 retry ─────────────────────────────────────────────
    // With Retry-After: 1 failed + 1 success = 2 calls.
    const fetchWithRetryAfter = vi.fn()
      .mockResolvedValueOnce(make429Response('1'))
      .mockResolvedValueOnce(make200Response('{"translations":{"p1":"Xin chao"}}'));
    globalThis.fetch = fetchWithRetryAfter;
    const serviceOk = new OpenAICompatibleService(makeConfig());
    const okPromise = startTranslate(serviceOk, new Map([['p1', 'Hello']]));
    await flushTimers();
    const result = await okPromise;

    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('Xin chao');
    expect(fetchWithRetryAfter).toHaveBeenCalledTimes(2);

    // Without Retry-After: 2 failed + 1 success = 3 calls.
    const fetchNoRetryAfter = vi.fn()
      .mockResolvedValueOnce(make429Response())
      .mockResolvedValueOnce(make429Response())
      .mockResolvedValueOnce(make200Response('{"translations":{"p1":"Xin chao"}}'));
    globalThis.fetch = fetchNoRetryAfter;
    const promise2 = startTranslate(new OpenAICompatibleService(makeConfig()), new Map([['p1', 'Hello']]));
    await flushTimers();
    const result2 = await promise2;

    expect(result2.success).toBe(true);
    expect(result2.translations.get('p1')).toBe('Xin chao');
    expect(fetchNoRetryAfter).toHaveBeenCalledTimes(3);
  });

});
