/**
 * Langflow translation service.
 * Sends requests to Langflow's non-OpenAI-compatible API format.
 * Reuses system/user prompt builders and response parsers from base.ts.
 */

import type { PageContext, ProviderConfig } from '@/types/config';
import type {
  TranslationRequest,
  TranslationResult,
} from '@/types/translation';
import type { TranslationService } from './base';
import { buildSystemPrompt, buildUserPrompt, parseTranslationResponse } from './base';
import { PREDEFINED_CATEGORIES } from '@/lib/categories';

/** Langflow request body (non-OpenAI format) */
interface LangflowRequestBody {
  input_type: 'text';
  output_type: 'text';
  input_value: string;
  tweaks: Record<string, Record<string, unknown>>;
}

/**
 * Resolve a simple dot-bracket path like "outputs[0].outputs[0].results.text.text"
 * against a JSON response object. Returns undefined on any missing intermediate key.
 */
function resolveJsonPath(obj: unknown, path: string): unknown {
  // Split on `.` and `[n]` patterns
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = obj;

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export class LangflowService implements TranslationService {
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

      console.log('AnyLLMTranslate [Langflow]: LLM Request', {
        endpointUrl: this.config.endpointUrl,
        componentId: this.config.componentId,
        systemPrompt,
        userPrompt,
      });

      const responseText = await this.sendToLangflow(systemPrompt, userPrompt);

      console.log('AnyLLMTranslate [Langflow]: LLM Response', { responseText });

      if (!responseText.trim()) {
        return {
          success: false,
          translations: new Map(),
          error: 'Empty response from Langflow',
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
      const responseText = await this.sendToLangflow(
        'Reply with exactly: {"status":"ok"}',
        'Test connection',
      );

      if (!responseText.trim()) {
        return { success: false, error: 'Empty response from Langflow' };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      return { success: false, error: message };
    }
  }

  async detectPageCategory(
    pageContext: PageContext,
  ): Promise<{ success: boolean; category?: string; error?: string }> {
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

      const responseText = await this.sendToLangflow(systemPrompt, userPrompt);

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

  /**
   * Send a prompt pair to the Langflow endpoint and extract the response text.
   * Uses the configured `responseTextPath` to locate the response text in the
   * Langflow response JSON.
   */
  private async sendToLangflow(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    return this.fetchWithRetry(systemPrompt, userPrompt, 2);
  }

  private async fetchWithRetry(
    systemPrompt: string,
    userPrompt: string,
    maxRetries: number,
    attempt = 1,
  ): Promise<string> {
    const endpointUrl = this.config.endpointUrl?.trim();
    if (!endpointUrl) {
      throw new Error('Langflow endpoint URL is not configured');
    }

    const componentId = this.config.componentId?.trim();
    if (!componentId) {
      throw new Error('Langflow component ID is not configured');
    }

    const body: LangflowRequestBody = {
      input_type: 'text',
      output_type: 'text',
      input_value: userPrompt,
      tweaks: {
        [componentId]: {
          system_message: systemPrompt,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stream: false,
          remove_think_text: true,
        },
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['x-api-key'] = this.config.apiKey;
    }

    const timeout = this.config.requestTimeoutMs ?? 60000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.detail) {
            errorMessage = typeof errorJson.detail === 'string'
              ? errorJson.detail
              : JSON.stringify(errorJson.detail);
          }
        } catch {
          if (errorBody) {
            errorMessage += ` — ${errorBody.slice(0, 200)}`;
          }
        }

        // Retry on 5xx errors, not on client errors (4xx)
        const shouldRetry = response.status >= 500 && attempt <= maxRetries;
        if (shouldRetry) {
          const backoff = 500 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          return this.fetchWithRetry(systemPrompt, userPrompt, maxRetries, attempt + 1);
        }

        throw new Error(errorMessage);
      }

      const responseJson = await response.json();

      // Extract text using configurable response path
      const responsePath = this.config.responseTextPath?.trim()
        || 'outputs[0].outputs[0].results.text.text';

      const extractedText = resolveJsonPath(responseJson, responsePath);

      if (extractedText == null) {
        throw new Error(
          `Could not extract response text at path "${responsePath}". ` +
          `Response keys: ${JSON.stringify(Object.keys(responseJson))}`,
        );
      }

      return String(extractedText);
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Langflow request timed out after ${timeout}ms`, { cause: error });
      }

      // Retry on network errors (no response.status available)
      if (attempt <= maxRetries && !(error instanceof Error && error.message.startsWith('HTTP 4'))) {
        const backoff = 500 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.fetchWithRetry(systemPrompt, userPrompt, maxRetries, attempt + 1);
      }

      throw error;
    }
  }
}

// Export for testing
export { resolveJsonPath };
