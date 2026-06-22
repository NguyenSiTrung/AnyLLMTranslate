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
  const translationStep = await testTranslation(config);
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

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1,
      }),
    });

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
    return {
      name: 'ping',
      success: false,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/** Step 2: Call /v1/models to enumerate available models */
async function testModelListing(config: ProviderConfig): Promise<ConnectionTestStep> {
  const start = performance.now();
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.baseUrl}/models`, {
      method: 'GET',
      headers,
    });

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
    return {
      name: 'models',
      success: false,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Model listing failed',
    };
  }
}

/** Step 3: Translate a sample sentence and return result + latency */
async function testTranslation(config: ProviderConfig): Promise<ConnectionTestStep> {
  const start = performance.now();
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a translator. Translate the following text to Vietnamese. Respond only with the translation.',
          },
          { role: 'user', content: 'Hello, how are you today?' },
        ],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

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
