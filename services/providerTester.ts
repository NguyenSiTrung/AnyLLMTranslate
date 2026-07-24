/**
 * Provider Connection Tester — validates provider connectivity in 3 steps.
 * Step 1: Simple ping (minimal request, check 200)
 * Step 2: Model listing (GET /v1/models)
 * Step 3: Translation test (translate sample, measure latency, probe thinking)
 */

import type { ProviderConfig } from '@/types/config';
import {
  MAX_MODEL_LIST_PAGES,
  buildModelsListUrl,
  parseModelsListResponse,
} from '@/lib/modelListing';
import {
  applyThinkingModeToRequest,
  isThinkingKwargsRejected,
  normalizeThinkingMode,
} from '@/lib/thinkingMode';
import {
  detectThinkingSignals,
  evaluateThinkingProbe,
  stripThinkTags,
  type ThinkingProbeResult,
} from '@/lib/thinkingDetection';
import type { ChatCompletionRequest } from '@/types/translation';

/** Individual test step result */
export interface ConnectionTestStep {
  name: 'ping' | 'models' | 'translation';
  success: boolean;
  latencyMs: number;
  error?: string;
  data?: unknown;
}

/** Complete connection test result */
export interface ConnectionTestResult {
  overall: boolean;
  steps: ConnectionTestStep[];
  models: string[];
  translationSample?: string;
  totalLatencyMs: number;
  /**
   * Thinking/reasoning probe from the translation step.
   * Present when translation ran (success or content parse); absent if
   * translation never started or failed before a body was available.
   */
  thinking?: ThinkingProbeResult;
}

/** Progress callback for UI updates */
export type ConnectionTestProgress = (step: ConnectionTestStep, stepIndex: number) => void;

/** Test provider connection with structured 3-step validation */
export async function testConnection(
  config: ProviderConfig,
  onProgress?: ConnectionTestProgress,
  targetLanguage?: string,
): Promise<ConnectionTestResult> {

  const steps: ConnectionTestStep[] = [];
  let models: string[] = [];
  let translationSample: string | undefined;
  let thinking: ThinkingProbeResult | undefined;

  // Step 1: Simple ping
  const pingStep = await testPing(config);
  steps.push(pingStep);
  onProgress?.(pingStep, 0);

  if (!pingStep.success) {
    return {
      overall: false,
      steps,
      models,
      totalLatencyMs: sumLatency(steps),
    };
  }

  // Step 2: Model listing
  const modelsStep = await testModelListing(config);
  steps.push(modelsStep);
  onProgress?.(modelsStep, 1);

  if (modelsStep.success && Array.isArray(modelsStep.data)) {
    models = modelsStep.data as string[];
  }

  // Step 3: Translation test (applies thinkingMode + probes response)
  const translationStep = await testTranslation(config, targetLanguage);
  steps.push(translationStep);
  onProgress?.(translationStep, 2);

  if (translationStep.data && typeof translationStep.data === 'object') {
    const payload = translationStep.data as Partial<TranslationStepData>;
    if (typeof payload.sample === 'string') translationSample = payload.sample;
    if (payload.thinking) thinking = payload.thinking;
  }

  return {
    overall: steps.every((s) => s.success),
    steps,
    models,
    translationSample,
    totalLatencyMs: sumLatency(steps),
    thinking,
  };
}

/** Step 1: Send minimal request to verify API is reachable */
async function testPing(config: ProviderConfig): Promise<ConnectionTestStep> {
  const start = performance.now();
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        name: 'ping',
        success: false,
        latencyMs,
        error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    return { name: 'ping', success: true, latencyMs };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { name: 'ping', success: false, latencyMs: Math.round(performance.now() - start), error: 'Ping timed out after 15s' };
    }
    return {
      name: 'ping',
      success: false,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

export interface ListProviderModelsResult {
  success: boolean;
  models: string[];
  error?: string;
  latencyMs: number;
}

/** Fetch model IDs from GET {baseUrl}/models (follows has_more pages) without full connection test. */
export async function listProviderModels(
  config: Pick<ProviderConfig, 'baseUrl' | 'apiKey'>,
): Promise<ListProviderModelsResult> {
  const step = await testModelListing({
    ...config,
    preset: 'custom',
    model: 'test',
    temperature: 0,
    maxTokens: 1,
    displayName: '',
    requiresApiKey: Boolean(config.apiKey),
  });
  return {
    success: step.success,
    models: step.success && Array.isArray(step.data) ? (step.data as string[]) : [],
    error: step.error,
    latencyMs: step.latencyMs,
  };
}

/** Step 2: Call /v1/models (with has_more pagination) to enumerate available models */
async function testModelListing(config: ProviderConfig): Promise<ConnectionTestStep> {
  const start = performance.now();
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const seen = new Set<string>();
    const modelIds: string[] = [];
    let after: string | undefined;
    let pages = 0;

    while (pages < MAX_MODEL_LIST_PAGES) {
      pages += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(buildModelsListUrl(config.baseUrl, after), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        return {
          name: 'models',
          success: false,
          latencyMs: Math.round(performance.now() - start),
          error: `HTTP ${response.status}: Failed to list models`,
        };
      }

      const json: unknown = await response.json();
      const parsed = parseModelsListResponse(json);
      for (const id of parsed.ids) {
        if (!seen.has(id)) {
          seen.add(id);
          modelIds.push(id);
        }
      }

      if (!parsed.hasMore || !parsed.lastId) {
        break;
      }
      // Avoid infinite loop if provider keeps returning the same last_id.
      if (after === parsed.lastId) {
        break;
      }
      after = parsed.lastId;
    }

    return {
      name: 'models',
      success: true,
      latencyMs: Math.round(performance.now() - start),
      data: modelIds,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { name: 'models', success: false, latencyMs: Math.round(performance.now() - start), error: 'Model listing timed out after 15s' };
    }
    return {
      name: 'models',
      success: false,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Model listing failed',
    };
  }
}

/** Payload stored on the translation step's `data` field. */
export interface TranslationStepData {
  sample: string;
  thinking: ThinkingProbeResult;
}

function buildTranslationRequestBody(
  config: ProviderConfig,
  lang: string,
  includeThinkingControls: boolean,
): ChatCompletionRequest {
  const base: ChatCompletionRequest = {
    model: config.model,
    messages: [
      {
        role: 'system',
        content: `You are a translator. Translate the following text to ${lang}. Respond only with the translation.`,
      },
      { role: 'user', content: 'Hello, how are you today?' },
    ],
    max_tokens: 100,
    temperature: 0.3,
  };

  if (!includeThinkingControls) return base;

  return applyThinkingModeToRequest(base, config.thinkingMode, {
    baseUrl: config.baseUrl,
    thinkingEffort: config.thinkingEffort,
  });
}

function requestHasThinkingControls(body: ChatCompletionRequest): boolean {
  return (
    body.chat_template_kwargs !== undefined || body.reasoning_effort !== undefined
  );
}

/** Step 3: Translate a sample sentence; apply thinkingMode; probe reasoning. */
async function testTranslation(
  config: ProviderConfig,
  targetLanguage?: string,
): Promise<ConnectionTestStep> {
  const start = performance.now();
  const lang = targetLanguage || 'Vietnamese';
  const mode = normalizeThinkingMode(config.thinkingMode);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    // Apply provider thinkingMode (same rules as real translate).
    let body = buildTranslationRequestBody(config, lang, true);
    const controlsAttempted = requestHasThinkingControls(body);
    let controlsRejected = false;

    const postOnce = async (requestBody: ChatCompletionRequest) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        return await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let response = await postOnce(body);

    // Mirror openaiCompatible: if thinking controls are rejected, retry once without them.
    if (!response.ok && response.status === 400 && controlsAttempted) {
      const errorText = await response.text().catch(() => '');
      if (isThinkingKwargsRejected(errorText)) {
        controlsRejected = true;
        body = buildTranslationRequestBody(config, lang, false);
        response = await postOnce(body);
      } else {
        const latencyMs = Math.round(performance.now() - start);
        return {
          name: 'translation',
          success: false,
          latencyMs,
          error: `HTTP 400: ${errorText.slice(0, 200) || 'Translation test failed'}`,
        };
      }
    }

    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      return {
        name: 'translation',
        success: false,
        latencyMs,
        error: `HTTP ${response.status}: Translation test failed`,
      };
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
    };
    const message = json.choices?.[0]?.message;
    const rawContent = message?.content ?? '';
    const signals = detectThinkingSignals({ content: rawContent, message });
    const thinkingResult = evaluateThinkingProbe({
      mode,
      // True if we successfully forced controls, or attempted and were rejected.
      controlsSent: controlsAttempted,
      controlsRejected,
      thinkingDetected: signals.detected,
      sources: signals.sources,
    });

    const sample = stripThinkTags(rawContent);

    return {
      name: 'translation',
      success: true,
      latencyMs,
      data: { sample, thinking: thinkingResult } satisfies TranslationStepData,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { name: 'translation', success: false, latencyMs: Math.round(performance.now() - start), error: 'Translation test timed out after 30s' };
    }
    return {
      name: 'translation',
      success: false,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Translation test failed',
    };
  }
}

function sumLatency(steps: ConnectionTestStep[]): number {
  return steps.reduce((sum, s) => sum + s.latencyMs, 0);
}
