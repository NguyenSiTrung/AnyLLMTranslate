/**
 * Provider Connection Tester — validates provider connectivity in 3 steps.
 * Step 1: Simple ping (minimal request, check 200 + non-empty completion)
 * Step 2: Model listing (GET /v1/models) — optional, does not block overall success
 * Step 3: Translation test (translate sample, measure latency)
 */

import type { ProviderConfig } from '@/types/config';

/** Strip trailing slashes and accidental full-endpoint paths from pasted curl URLs. */
export function normalizeProviderBaseUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, '');
  url = url.replace(/\/chat\/completions$/i, '');
  return url.replace(/\/+$/, '');
}

function providerUrl(baseUrl: string, path: string): string {
  return `${normalizeProviderBaseUrl(baseUrl)}${path}`;
}

type ProviderErrorBody = {
  error?: { message?: string };
  message?: string;
};

type CompletionMessage = {
  content?: string | null;
  reasoning?: string | null;
};

/** Parse provider JSON/text error bodies into a human-readable message. */
export function parseProviderErrorBody(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `HTTP ${status}`;
  try {
    const json = JSON.parse(trimmed) as ProviderErrorBody;
    if (json.error?.message) return json.error.message;
    if (json.message) return json.message;
  } catch {
    // fall through to raw text
  }
  return trimmed.slice(0, 300);
}

/** Extract assistant text from content or reasoning (NVIDIA VLMs / reasoning models). */
export function extractCompletionText(json: {
  choices?: Array<{ message?: CompletionMessage }>;
  error?: { message?: string };
}): string | undefined {
  if (json.error?.message) return undefined;
  const msg = json.choices?.[0]?.message;
  if (!msg) return undefined;
  const content = (msg.content ?? '').trim();
  if (content) return content;
  const reasoning = (msg.reasoning ?? '').trim();
  return reasoning || undefined;
}

/** Extra request hints for reasoning/VLM models (ignored by most text-only LLMs). */
function reasoningModelHints(): Record<string, unknown> {
  return { chat_template_kwargs: { thinking: false } };
}

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

  // Step 2: Model listing (optional — many endpoints omit GET /models)
  const modelsStep = await testModelListing(config);
  steps.push(modelsStep);
  onProgress?.(modelsStep, 1);

  if (modelsStep.success && Array.isArray(modelsStep.data)) {
    models = modelsStep.data as string[];
  }

  // Step 3: Translation test
  const translationStep = await testTranslation(config, targetLanguage);
  steps.push(translationStep);
  onProgress?.(translationStep, 2);

  if (translationStep.success && typeof translationStep.data === 'string') {
    translationSample = translationStep.data;
  }

  return {
    // Reachability + translation are required; model listing is best-effort.
    overall: pingStep.success && translationStep.success,
    steps,
    models,
    translationSample,
    totalLatencyMs: sumLatency(steps),
  };
}

/** Step 1: Send minimal request to verify API is reachable and model responds */
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

    const response = await fetch(providerUrl(config.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 64,
        ...reasoningModelHints(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);
    const responseText = await response.text().catch(() => '');

    if (!response.ok) {
      const detail = parseProviderErrorBody(responseText, response.status);
      return {
        name: 'ping',
        success: false,
        latencyMs,
        error: `HTTP ${response.status}: ${detail}`,
      };
    }

    let json: { choices?: Array<{ message?: CompletionMessage }>; error?: { message?: string } };
    try {
      json = JSON.parse(responseText) as typeof json;
    } catch {
      return {
        name: 'ping',
        success: false,
        latencyMs,
        error: 'Reachability check returned non-JSON response',
      };
    }

    const text = extractCompletionText(json);
    if (!text) {
      const apiError = json.error?.message;
      return {
        name: 'ping',
        success: false,
        latencyMs,
        error: apiError
          ? `Reachability check failed: ${apiError}`
          : 'Reachability check returned an empty completion — verify the model ID',
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

/** Fetch model IDs from GET {baseUrl}/models without running full connection test. */
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

/** Step 2: Call /v1/models to enumerate available models */
async function testModelListing(config: ProviderConfig): Promise<ConnectionTestStep> {
  const start = performance.now();
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(providerUrl(config.baseUrl, '/models'), {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      const detail = parseProviderErrorBody(await response.text().catch(() => ''), response.status);
      return {
        name: 'models',
        success: false,
        latencyMs,
        error: `HTTP ${response.status}: Failed to list models — ${detail}`,
      };
    }

    const json = await response.json() as { data?: { id: string }[] };
    const modelIds = (json.data ?? []).map((m) => m.id);

    return {
      name: 'models',
      success: true,
      latencyMs,
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

/** Step 3: Translate a sample sentence and return result + latency */
async function testTranslation(config: ProviderConfig, targetLanguage?: string): Promise<ConnectionTestStep> {
  const start = performance.now();
  const lang = targetLanguage || 'Vietnamese';
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(providerUrl(config.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: `You are a translator. Translate the following text to ${lang}. Respond only with the translation.`,
          },
          { role: 'user', content: 'Hello, how are you today?' },
        ],
        max_tokens: 1024,
        temperature: 0.3,
        ...reasoningModelHints(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);
    const responseText = await response.text().catch(() => '');

    if (!response.ok) {
      const detail = parseProviderErrorBody(responseText, response.status);
      return {
        name: 'translation',
        success: false,
        latencyMs,
        error: `HTTP ${response.status}: ${detail}`,
      };
    }

    let json: { choices?: Array<{ message?: CompletionMessage }>; error?: { message?: string } };
    try {
      json = JSON.parse(responseText) as typeof json;
    } catch {
      return {
        name: 'translation',
        success: false,
        latencyMs,
        error: 'Translation test returned non-JSON response',
      };
    }

    const content = extractCompletionText(json);
    if (!content) {
      const apiError = json.error?.message;
      return {
        name: 'translation',
        success: false,
        latencyMs,
        error: apiError
          ? `Translation test failed: ${apiError}`
          : 'Translation test returned an empty completion',
      };
    }

    return {
      name: 'translation',
      success: true,
      latencyMs,
      data: content,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { name: 'translation', success: false, latencyMs: Math.round(performance.now() - start), error: 'Translation test timed out after 60s' };
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