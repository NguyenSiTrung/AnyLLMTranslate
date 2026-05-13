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

/**
 * Produce a human-readable summary of a JSON structure up to `depth` levels.
 * Example: `{ outputs: [{ outputs: [{ results: {…} }] }] }` → helps users find the right path.
 */
function describeStructure(obj: unknown, depth: number): string {
  if (depth <= 0 || obj == null) return typeof obj === 'object' ? '{…}' : String(typeof obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return `[${describeStructure(obj[0], depth - 1)}, …(${obj.length})]`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>);
    if (keys.length === 0) return '{}';
    const entries = keys.map((k) => `${k}: ${describeStructure((obj as Record<string, unknown>)[k], depth - 1)}`);
    return `{ ${entries.join(', ')} }`;
  }

  if (typeof obj === 'string') return obj.length > 40 ? `"${obj.slice(0, 40)}…"` : `"${obj}"`;
  return String(obj);
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

      console.log('AnyLLMTranslate [Langflow]: LLM Response', {
        responseText: responseText.slice(0, 500),
        length: responseText.length,
      });

      if (!responseText.trim()) {
        return {
          success: false,
          translations: new Map(),
          error: 'Empty response from Langflow',
        };
      }

      const expectedIds = Array.from(request.texts.keys());

      // Try structured JSON parse first (standard LLM JSON response)
      try {
        const translations = parseTranslationResponse(responseText, expectedIds);
        return { success: true, translations };
      } catch (jsonError) {
        // Langflow flows often return plain text instead of JSON.
        // Fall back to treating the entire response as the translation.
        console.warn(
          'AnyLLMTranslate [Langflow]: JSON parse failed, falling back to plain-text mode.',
          jsonError instanceof Error ? jsonError.message : jsonError,
        );

        const translations = new Map<string, string>();

        if (expectedIds.length === 1) {
          // Single text: use entire response as the translation
          translations.set(expectedIds[0], responseText.trim());
        } else {
          // Multiple texts: try line-based mapping (one translation per line)
          const lines = responseText.trim().split('\n').filter((l) => l.trim());
          for (let i = 0; i < expectedIds.length; i++) {
            if (i < lines.length) {
              translations.set(expectedIds[i], lines[i].trim());
            }
          }

          if (translations.size === 0) {
            return {
              success: false,
              translations: new Map(),
              error: 'Langflow returned plain text but could not map to expected translation IDs',
            };
          }
        }

        return { success: true, translations };
      }
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

      // Extract text using configurable response path with fallback alternatives
      const configuredPath = this.config.responseTextPath?.trim() || '';
      const FALLBACK_PATHS = [
        'outputs[0].outputs[0].results.text.text',   // Langflow >= 1.x (plural)
        'outputs[0].outputs[0].results.message.text', // Langflow message variant
        'output.text',                                // Langflow simple output
      ];

      // Build candidate list: user-configured path first, then fallbacks
      const candidates = configuredPath
        ? [configuredPath, ...FALLBACK_PATHS.filter((p) => p !== configuredPath)]
        : FALLBACK_PATHS;

      console.log('AnyLLMTranslate [Langflow]: Raw response structure', {
        topKeys: Object.keys(responseJson),
        candidates,
        preview: JSON.stringify(responseJson).slice(0, 500),
      });

      let extractedText: unknown;
      let matchedPath: string | undefined;

      for (const candidate of candidates) {
        extractedText = resolveJsonPath(responseJson, candidate);
        if (extractedText != null) {
          matchedPath = candidate;
          break;
        }
      }

      if (extractedText == null) {
        // Build a structural hint showing 3 levels deep
        const structHint = describeStructure(responseJson, 3);
        throw new Error(
          `Could not extract response text. Tried paths: ${JSON.stringify(candidates)}. ` +
          `Response structure: ${structHint}`,
        );
      }

      if (matchedPath && matchedPath !== configuredPath && configuredPath) {
        console.warn(
          `AnyLLMTranslate [Langflow]: Configured path "${configuredPath}" failed, ` +
          `but fallback "${matchedPath}" succeeded. Consider updating your Response Text Path setting.`,
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
