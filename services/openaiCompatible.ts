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
import type { ClassifyPdfParagraphsResult, PdfParagraphLabel } from '@/types/messages';
import { PREDEFINED_CATEGORIES } from '@/lib/categories';
import { isDebugLoggingEnabled } from './debugLog';

export class OpenAICompatibleService implements TranslationService {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /** Update the provider config (e.g., on settings change) */
  updateConfig(config: ProviderConfig): void {
    this.config = config;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    try {
      const systemPrompt = buildSystemPrompt(
        request.targetLanguage,
        request.customSystemPrompt,
        request.glossaryBlock,
        request.pageContext,
      );
      const userPrompt = buildUserPrompt(request.texts, request.sourceLanguage);

      const completionRequest: ChatCompletionRequest = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' },
      };

      if (isDebugLoggingEnabled()) {
        console.log('AnyLLMTranslate: LLM Request', { model: this.config.model, systemPrompt, userPrompt });
      }

      const response = await this.fetchCompletion(completionRequest);
      const responseText = response.choices[0]?.message?.content ?? '';

      if (isDebugLoggingEnabled()) {
        console.log('AnyLLMTranslate: LLM Response', { responseText });
      }

      if (!responseText.trim()) {
        return {
          success: false,
          translations: new Map(),
          error: 'Empty response from LLM',
        };
      }

      const expectedIds = Array.from(request.texts.keys());
      const translations = parseTranslationResponse(responseText, expectedIds);

      return {
        success: true,
        translations,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown translation error';
      return {
        success: false,
        translations: new Map(),
        error: message,
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const completionRequest: ChatCompletionRequest = {
        model: this.config.model,
        messages: [
          { role: 'user', content: 'Reply with exactly: {"status":"ok"}' },
        ],
        temperature: 0,
        max_tokens: 20,
        response_format: { type: 'json_object' },
      };

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

  async detectPageCategory(pageContext: PageContext): Promise<{ success: boolean; category?: string; error?: string }> {
    try {
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

      const completionRequest: ChatCompletionRequest = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 50,
        response_format: { type: 'json_object' },
      };

      const response = await this.fetchCompletion(completionRequest);
      const responseText = response.choices[0]?.message?.content ?? '';
      
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (jsonMatch?.[1]) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          return { success: false, error: 'Failed to parse category response' };
        }
      }
      
      return { success: true, category: parsed.category };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async classifyPdfParagraphs(
    paragraphs: Array<{ id: string; text: string }>,
  ): Promise<ClassifyPdfParagraphsResult> {
    if (paragraphs.length === 0) {
      return { success: true, labels: {} };
    }
    try {
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

      const completionRequest: ChatCompletionRequest = {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      };

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
          parsed = JSON.parse(jsonMatch[1]);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Classification failed';
      return { success: false, error: message };
    }
  }

  private async fetchCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    return this.fetchWithRetry(request, 2);
  }

  private async fetchWithRetry(
    request: ChatCompletionRequest,
    maxRetries: number,
    attempt = 1,
  ): Promise<ChatCompletionResponse> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Only add Authorization header if API key is provided
    // Local providers (Ollama, LM Studio) don't need auth
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const timeout = this.config.requestTimeoutMs ?? 60000;
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

        // Retry on 5xx or network-like errors, but NOT on 4xx client errors
        const shouldRetry = response.status >= 500 && attempt <= maxRetries;
        if (shouldRetry) {
          const backoff = 500 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          return this.fetchWithRetry(request, maxRetries, attempt + 1);
        }

        throw new Error(errorMessage);
      }

      return (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Translation request timed out after ${timeout}ms`, { cause: error });
      }

      // Retry on network errors (no response.status available)
      if (attempt <= maxRetries && !(error instanceof Error && error.message.startsWith('HTTP 4'))) {
        const backoff = 500 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.fetchWithRetry(request, maxRetries, attempt + 1);
      }

      throw error;
    }
  }
}
