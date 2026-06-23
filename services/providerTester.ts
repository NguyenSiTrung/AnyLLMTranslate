/**
 * Provider Connection Tester — validates provider connectivity in 3 steps.
 * Step 1: Simple ping (minimal request, check 200)
 * Step 2: Model listing (GET /v1/models)
 * Step 3: Translation test (translate sample, measure latency)
 */

import type { ProviderConfig } from '@/types/config';

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

  // Step 2: Model listing
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
    overall: steps.every((s) => s.success),
    steps,
    models,
    translationSample,
    totalLatencyMs: sumLatency(steps),
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

    const response = await fetch(`${config.baseUrl}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      return {
        name: 'models',
        success: false,
        latencyMs,
        error: `HTTP ${response.status}: Failed to list models`,
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
    const timer = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
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
        max_tokens: 100,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);

    if (!response.ok) {
      return {
        name: 'translation',
        success: false,
        latencyMs,
        error: `HTTP ${response.status}: Translation test failed`,
      };
    }

    const json = await response.json() as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? '';

    return {
      name: 'translation',
      success: true,
      latencyMs,
      data: content.trim(),
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
