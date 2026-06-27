/**
 * OpenAI-compatible translation service.
 * Works with any `/v1/chat/completions` endpoint.
 */

import type { PageContext, ProviderConfig } from '@/types/config';
import type {
  TranslationRequest,
  TranslationResult,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '@/types/translation';
import type { TranslationService } from './base';
import { buildSystemPrompt, buildUserPrompt, parseTranslationResponse } from './base';
import { buildSubtitleSystemPrompt } from './subtitlePrompt';
import { extractProperNouns } from './subtitleResponse';
import type { ClassifyPdfParagraphsResult, PdfParagraphLabel } from '@/types/messages';
import { PREDEFINED_CATEGORIES } from '@/lib/categories';
import { isDebugLoggingEnabled } from './debugLog';
import { createRateLimiter, type RateLimiter } from '@/lib/rateLimiter';

/** Custom error class carrying the HTTP status code so retry logic can
 *  distinguish 4xx client errors (no retry) from 5xx/network errors (retry)
 *  without fragile string matching on error.message. */
export class ApiError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export class OpenAICompatibleService implements TranslationService {
  private config: ProviderConfig;
  private rateLimiter: RateLimiter;
  /** Set to true when the provider rejects `response_format: { type: 'json_object' }`
   *  (e.g. NVIDIA NIM / vLLM with certain models). Once detected, all subsequent
   *  requests omit response_format to avoid a wasted failed call on every request. */
  private responseFormatDisabled = false;
  /** FR-4: the (baseUrl, model) identity the response_format rejection was
   *  learned against. `updateConfig` only clears {@link responseFormatDisabled}
   *  when this identity changes, so a pool `rebuild()` that re-applies the SAME
   *  provider+model (e.g. only maxRpm changed) does NOT forget the learned
   *  rejection — avoiding a wasted 400 on every request after each rebuild. */
  private responseFormatIdentity: { baseUrl: string; model: string } | null = null;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.rateLimiter = createRateLimiter(config.maxRpm ?? 0);
  }

  /** Update the provider config (e.g., on settings change) */
  updateConfig(config: ProviderConfig): void {
    // FR-4: only reset the response_format rejection memory when the provider
    // identity (baseUrl + model) actually changes. The provider pool's rebuild
    // calls updateConfig on preserved members even when only peripheral fields
    // like maxRpm changed — resetting there would re-pay the 400 every time.
    const identityChanged =
      !this.responseFormatIdentity ||
      this.responseFormatIdentity.baseUrl !== config.baseUrl ||
      this.responseFormatIdentity.model !== config.model;
    if (identityChanged) {
      this.responseFormatDisabled = false;
      this.responseFormatIdentity = null;
    }
    this.config = config;
    this.rateLimiter.setMaxRpm(config.maxRpm ?? 0);
  }

  /** Build a chat completion request, conditionally including response_format
   *  based on whether the provider has rejected it in a prior call. */
  private buildCompletionRequest(
    base: Omit<ChatCompletionRequest, 'response_format'>,
  ): ChatCompletionRequest {
    if (this.responseFormatDisabled) {
      return base;
    }
    return { ...base, response_format: { type: 'json_object' } };
  }

  /**
   * Translate a batch of texts. Error contract (FR-1):
   *  - Transport / auth / rate-limit / network failures **re-throw** an
   *    {@link ApiError} (carrying `statusCode`) so the provider pool's circuit
   *    breaker + failover fires. Without the re-throw, pool failover was dead
   *    code in production (the pool's `dispatchWithFailover` only reacts to a
   *    thrown error, not a returned `{success:false}`).
   *  - Content problems (empty response, unparseable JSON, partial back-fill)
   *    still return `{success:false}` / `{success:true, partial}` — those are
   *    request-specific and would likely fail on the next key too, so failover
   *    wouldn't help.
   */
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    // Prompt routing (highest precedence first):
    //  1. preScanSystemPrompt → use verbatim (per-film name-extraction call).
    //  2. subtitleKnobs       → profile-driven subtitle prompt (customSystemPrompt ignored).
    //  3. (neither)           → web-page prompt, honoring customSystemPrompt.
    const systemPrompt = request.preScanSystemPrompt
      ? request.preScanSystemPrompt
      : request.subtitleKnobs
        ? buildSubtitleSystemPrompt(
            request.targetLanguage,
            request.subtitleKnobs,
            request.glossaryBlock,
            request.rollingGlossaryBlock,
          )
        : buildSystemPrompt(
            request.targetLanguage,
            request.customSystemPrompt,
            request.glossaryBlock,
            request.pageContext,
          );
    const userPrompt = buildUserPrompt(request.texts, request.sourceLanguage);

    const completionRequest: ChatCompletionRequest = this.buildCompletionRequest({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });

    if (isDebugLoggingEnabled()) {
      console.log('AnyLLMTranslate: LLM Request', { model: this.config.model, systemPrompt, userPrompt });
    }

    // fetchWithRetry throws ApiError on transport/auth/rate-limit failures.
    // We deliberately do NOT wrap it in try/catch — those errors must propagate
    // to the pool's failover layer (FR-1).
    const response = await this.fetchCompletion(completionRequest);
    const responseText = response.choices[0]?.message?.content ?? '';

    if (isDebugLoggingEnabled()) {
      console.log('AnyLLMTranslate: LLM Response', { responseText });
    }

    // --- Content problems below: these return {success:false} (no failover) ---

    if (!responseText.trim()) {
      return {
        success: false,
        translations: new Map(),
        error: 'Empty response from LLM',
      };
    }

    const expectedIds = Array.from(request.texts.keys());

    // Parse is a CONTENT concern, not a transport concern: a malformed JSON from
    // key 2 would likely also fail to parse, so failover wouldn't help. Wrap
    // parseTranslationResponse so its thrown Error becomes {success:false}
    // WITHOUT swallowing the ApiError that fetchCompletion may have already
    // thrown above (fetchCompletion runs BEFORE this block and is not wrapped).
    let translations: Map<string, string>;
    try {
      translations = parseTranslationResponse(responseText, expectedIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse translation response';
      return {
        success: false,
        translations: new Map(),
        error: message,
      };
    }

    // P2 correctness: when the LLM omits some IDs, fall back to the original
    // text so callers don't silently drop content (a partial response was
    // previously reported as success: true with a short map, losing pieces).
    let partial = false;
    if (translations.size < expectedIds.length) {
      partial = true;
      for (const id of expectedIds) {
        if (!translations.has(id)) {
          translations.set(id, request.texts.get(id) ?? '');
        }
      }
    }

    // Subtitle path: extract proper nouns for the rolling glossary.
    // Web-page path: properNouns stays undefined.
    const properNouns = request.subtitleKnobs
      ? extractProperNouns(responseText)
      : undefined;

    return {
      success: true,
      translations,
      // Surfaced for callers/stats that want to distinguish a clean response
      // from a repaired partial one. Still success (content is not lost).
      partial,
      properNouns,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const completionRequest: ChatCompletionRequest = this.buildCompletionRequest({
        model: this.config.model,
        messages: [
          { role: 'user', content: 'Reply with exactly: {"status":"ok"}' },
        ],
        temperature: 0,
        max_tokens: 20,
      });

      const response = await this.fetchCompletion(completionRequest);
      const content = response.choices[0]?.message?.content ?? '';

      if (!content.trim()) {
        return { success: false, error: 'Empty response from server' };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      return { success: false, error: message };
    }
  }

  /**
   * Detect a page's category. Error contract (FR-1):
   *  - Transport / auth / rate-limit failures re-throw {@link ApiError} so the
   *    pool can fail over. Only the JSON PARSE of an otherwise-200 response
   *    returns {success:false} (content problem).
   */
  async detectPageCategory(pageContext: PageContext): Promise<{ success: boolean; category?: string; error?: string }> {
    const categoryList = PREDEFINED_CATEGORIES.join('\n- ');
    const systemPrompt = `You are an AI that categorizes web pages.
Based on the page title, description, and domain, determine the most appropriate category from the following list:
- ${categoryList}
- Other

Rules:
- Respond ONLY with valid JSON in this format: {"category": "category_name"}
- You MUST choose exactly one category from the list above.
- If you cannot determine the category, return "Other".`;

    const userPrompt = `Title: ${pageContext.title || 'N/A'}\nDescription: ${pageContext.description || 'N/A'}\nDomain: ${pageContext.domain || 'N/A'}`;

    const completionRequest: ChatCompletionRequest = this.buildCompletionRequest({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 50,
    });

    // Transport/auth/rate-limit errors propagate (FR-1) — do NOT wrap fetchCompletion.
    const response = await this.fetchCompletion(completionRequest);
    const responseText = response.choices[0]?.message?.content ?? '';

    // Content problem: parse failure of a 200 response returns {success:false}.
    let parsed: { category?: string };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch?.[1]) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch {
          return { success: false, error: 'Failed to parse category response' };
        }
      } else {
        return { success: false, error: 'Failed to parse category response' };
      }
    }

    return { success: true, category: parsed.category };
  }

  async classifyPdfParagraphs(
    paragraphs: Array<{ id: string; text: string }>,
  ): Promise<ClassifyPdfParagraphsResult> {
    if (paragraphs.length === 0) {
      return { success: true, labels: {} };
    }

    // Batch to avoid exceeding the model's context window on large pages.
    const BATCH_SIZE = 50;
    const allLabels: Record<string, PdfParagraphLabel> = {};

    for (let batchStart = 0; batchStart < paragraphs.length; batchStart += BATCH_SIZE) {
      const batch = paragraphs.slice(batchStart, batchStart + BATCH_SIZE);
      const result = await this.classifyPdfBatch(batch);
      if (!result.success) {
        return result;
      }
      Object.assign(allLabels, result.labels);
    }

    return { success: true, labels: allLabels };
  }

  /**
   * Classify a single batch of paragraphs (≤50 entries). Error contract (FR-1):
   *  - Transport / auth / rate-limit failures re-throw {@link ApiError} (pool
   *    failover). Only empty-response / parse failures return {success:false}.
   */
  private async classifyPdfBatch(
    paragraphs: Array<{ id: string; text: string }>,
  ): Promise<ClassifyPdfParagraphsResult> {
    const systemPrompt = `You classify paragraphs extracted from a PDF page.
For each paragraph id, return exactly one label:
- "prose": normal sentences or paragraphs of running text that should be translated.
- "figure": chart axis labels, legend entries, table cell text, diagram annotations, isolated numbers, single-word labels, or any short fragment that is part of a figure, chart, or table and is NOT a full sentence of prose.

Rules:
- When in doubt between prose and figure, prefer "prose" (it is safer to translate than to skip real prose).
- Mathematical formulas will already have been filtered out by the caller — do not return "math".
- Respond ONLY with valid JSON in this format: {"labels": {"id1": "prose", "id2": "figure"}}`;

    const userPrompt = `Classify each of the following paragraphs. Respond with the JSON object only.\n\n${JSON.stringify(
      Object.fromEntries(paragraphs.map((p) => [p.id, p.text])),
      null,
      2,
    )}`;

    const completionRequest: ChatCompletionRequest = this.buildCompletionRequest({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
    });

    // Transport/auth/rate-limit errors propagate (FR-1).
    const response = await this.fetchCompletion(completionRequest);
    const responseText = response.choices[0]?.message?.content ?? '';
    if (!responseText.trim()) {
      return { success: false, error: 'Empty response from LLM' };
    }

    let parsed: { labels?: Record<string, string> };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch?.[1]) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch {
          return { success: false, error: 'Failed to parse classification response' };
        }
      } else {
        return { success: false, error: 'Failed to parse classification response' };
      }
    }

    const rawLabels = parsed.labels ?? {};
    const labels: Record<string, PdfParagraphLabel> = {};
    for (const [id, rawLabel] of Object.entries(rawLabels)) {
      // Normalize: anything that is not explicitly "figure" becomes "prose".
      labels[id] = rawLabel === 'figure' ? 'figure' : 'prose';
    }
    return { success: true, labels };
  }

  /**
   * Per-service 5xx retry count. FR-8 #13: this layering is explicitly bounded
   * and documented. There are two retry layers:
   *   1. Per-service `fetchWithRetry` (this constant) — retries a transient 5xx
   *      on the SAME key. Bounded to PER_SERVICE_MAX_RETRIES (currently 1) so a
   *      provider-wide outage doesn't hammer one key.
   *   2. Pool `dispatchWithFailover` — on an exhausted same-key retry, opens the
   *      breaker and walks the remaining healthy keys (bounded by healthy.length).
   * Worst-case total calls for a provider-wide outage =
   *   `keys × (1 + PER_SERVICE_MAX_RETRIES)`. With 1 retry and a 3-key pool
   *   that's 6 calls — failover is the primary recovery; the per-service retry
   *   smooths single-call transient hiccups without exploding the fan-out.
   *
   * NOTE: a higher per-service retry count would multiply the outage fan-out
   * (keys × attempts) and is why this is kept at 1. The subtitle path's
   * `withRetry` (lib/subtitleRetry.ts) is a SEPARATE, request-level retry that
   * sits above the pool — it can still re-enter after a breaker cooldown
   * expires, but each re-entry is itself bounded by this same layering.
   */
  private static readonly PER_SERVICE_MAX_RETRIES = 1;

  private async fetchCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    return this.fetchWithRetry(request, OpenAICompatibleService.PER_SERVICE_MAX_RETRIES);
  }

  private async fetchWithRetry(
    request: ChatCompletionRequest,
    maxRetries: number,
    attempt = 1,
  ): Promise<ChatCompletionResponse> {
    const timeout = this.config.requestTimeoutMs ?? 60000;
    // RPM rate limiting: wait for a slot before starting the request-timeout
    // clock (so the timeout doesn't fire during the RPM wait). FR-5: bound the
    // wait by the request timeout so a low-maxRpm limiter under load fails fast
    // with a clear RateLimitTimeoutError instead of hanging past the user's
    // configured bound.
    await this.rateLimiter.acquire(timeout);

    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only add Authorization header if API key is provided
    // Local providers (Ollama, LM Studio) don't need auth
    if (this.config.apiKey) {
      // P2 security: warn when an API key is sent over a non-https URL — the
      // Authorization header (and request body) travel in cleartext. We still
      // send (local LLM providers legitimately use http://) but log loudly so a
      // user who mistyped a cloud-provider URL (http instead of https) notices.
      try {
        if (new URL(this.config.baseUrl).protocol === 'http:') {
          console.warn(
            'AnyLLMTranslate: API key is being sent over an insecure (http://) connection. ' +
              'If this is a cloud provider, use https:// to avoid exposing your key.',
          );
        }
      } catch {
        // Malformed baseUrl — the fetch below will surface the real error.
      }
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        // Try to extract a meaningful error message from the response body
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          if (errorBody) {
            errorMessage += ` — ${errorBody.slice(0, 200)}`;
          }
        }

        // Some providers (e.g. NVIDIA NIM / vLLM) reject
        // `response_format: { type: 'json_object' }` without a JSON schema.
        // The system prompt already instructs the model to return JSON, and
        // parseTranslationResponse() has robust fallback parsing, so retry
        // once without response_format when we detect this specific error.
        // The flag is set permanently so all subsequent requests skip
        // response_format from the start (no wasted failed call every time).
        if (
          request.response_format &&
          response.status === 400 &&
          errorMessage.includes('response_format')
        ) {
          this.responseFormatDisabled = true;
          // FR-4: remember the (baseUrl, model) this rejection was learned
          // against so updateConfig only clears it on a real identity change.
          this.responseFormatIdentity = {
            baseUrl: this.config.baseUrl,
            model: this.config.model,
          };
          const strippedRequest = { ...request };
          delete strippedRequest.response_format;
          return this.fetchWithRetry(strippedRequest, maxRetries, attempt);
        }

        // Retry on 5xx or network-like errors, but NOT on 4xx client errors
        const shouldRetry = response.status >= 500 && attempt <= maxRetries;
        if (shouldRetry) {
          const backoff = 500 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          return this.fetchWithRetry(request, maxRetries, attempt + 1);
        }

        throw new ApiError(errorMessage, response.status);
      }

      return (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Translation request timed out after ${timeout}ms`, { cause: error });
      }

      // Retry on network errors (no response.status available).
      // 4xx client errors should NOT be retried (determined via ApiError.statusCode,
      // not fragile string matching on error.message).
      const isClientError = error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500;
      if (attempt <= maxRetries && !isClientError) {
        const backoff = 500 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.fetchWithRetry(request, maxRetries, attempt + 1);
      }

      throw error;
    }
  }
}
