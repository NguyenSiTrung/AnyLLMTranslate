/**
 * HTTP client for the local Scientific PDF bridge (pdf2zh).
 *
 * Pure fetch wrapper — no chrome APIs, no credential storage.
 * Server URLs are normalized via {@link normalizeScientificPdfServerUrl}.
 *
 * @see docs/scientific-pdf-bridge-api.md
 */

import { normalizeScientificPdfServerUrl } from '@/lib/scientificPdf';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Client-facing error codes (network + bridge + parse). */
export type ScientificPdfErrorCode =
  | 'offline'
  | 'timeout'
  | 'parse'
  | 'llm_auth'
  | 'llm_error'
  | 'invalid_request'
  | 'not_found'
  | 'not_ready'
  | 'internal'
  | 'cancelled'
  | 'unknown';

/** Shared bridge error body (4xx/5xx JSON). */
export interface BridgeErrorBody {
  error: {
    code: string;
    message: string;
  };
}

/** GET /health success body. */
export interface BridgeHealthResponse {
  status: string;
  version?: string;
  pdf2zh?: 'available' | 'unavailable' | 'unknown' | string;
}

/** Per-job LLM + language config sent as multipart `config` JSON. */
export interface ScientificPdfJobConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  lang_in: string;
  lang_out: string;
  /**
   * From active pool key — same semantics as extension throttle:
   * maxRpm 0 = unlimited; concurrencyLimit 0 = unlimited; interval ms between requests (0 = off).
   */
  maxRpm?: number;
  concurrencyLimit?: number;
  interval?: number;
  /**
   * Optional pdf2zh-style page selection ("1-3, 5", 1-based, inclusive).
   * Omitted → translate the whole document.
   */
  pages?: string;
}

export type ScientificPdfJobState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ScientificPdfJobError {
  code: string;
  message: string;
}

export interface ScientificPdfJobArtifacts {
  mono?: boolean;
  dual?: boolean;
}

/** Job snapshot from create (202) or poll (200). */
export interface ScientificPdfJob {
  id: string;
  state: ScientificPdfJobState;
  progress?: number;
  message?: string;
  error?: ScientificPdfJobError;
  artifacts?: ScientificPdfJobArtifacts;
}

export interface ScientificPdfRequestOptions {
  signal?: AbortSignal;
  /** Abort after this many ms (default varies by method). */
  timeoutMs?: number;
}

export interface CreateJobInput {
  file: Blob | ArrayBuffer | Uint8Array;
  fileName?: string;
  config: ScientificPdfJobConfig;
}

/** Typed error thrown by all client methods. */
export class ScientificPdfClientError extends Error {
  readonly code: ScientificPdfErrorCode;
  readonly status?: number;

  constructor(code: ScientificPdfErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ScientificPdfClientError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_HEALTH_TIMEOUT_MS = 5_000;
const DEFAULT_JSON_TIMEOUT_MS = 30_000;
const DEFAULT_CREATE_TIMEOUT_MS = 120_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 180_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** GET /health — bridge readiness probe. */
export async function health(
  serverUrl: string,
  opts?: ScientificPdfRequestOptions,
): Promise<BridgeHealthResponse> {
  const base = normalizeScientificPdfServerUrl(serverUrl);
  const res = await bridgeFetch(`${base}/health`, {
    method: 'GET',
    timeoutMs: opts?.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS,
    signal: opts?.signal,
  });
  return parseJsonBody<BridgeHealthResponse>(res);
}

/**
 * POST /v1/jobs — multipart PDF + config JSON.
 * Expects 202 with `{ id, state }`.
 */
export async function createJob(
  serverUrl: string,
  input: CreateJobInput,
  opts?: ScientificPdfRequestOptions,
): Promise<ScientificPdfJob> {
  const base = normalizeScientificPdfServerUrl(serverUrl);
  const form = new FormData();
  const blob = toBlob(input.file);
  form.append('file', blob, input.fileName ?? 'document.pdf');
  form.append('config', JSON.stringify(input.config));

  const res = await bridgeFetch(`${base}/v1/jobs`, {
    method: 'POST',
    body: form,
    timeoutMs: opts?.timeoutMs ?? DEFAULT_CREATE_TIMEOUT_MS,
    signal: opts?.signal,
  });
  return parseJsonBody<ScientificPdfJob>(res);
}

/** GET /v1/jobs/:id — poll job state. */
export async function getJob(
  serverUrl: string,
  jobId: string,
  opts?: ScientificPdfRequestOptions,
): Promise<ScientificPdfJob> {
  const base = normalizeScientificPdfServerUrl(serverUrl);
  const id = encodeURIComponent(jobId);
  const res = await bridgeFetch(`${base}/v1/jobs/${id}`, {
    method: 'GET',
    timeoutMs: opts?.timeoutMs ?? DEFAULT_JSON_TIMEOUT_MS,
    signal: opts?.signal,
  });
  return parseJsonBody<ScientificPdfJob>(res);
}

/** GET /v1/jobs/:id/mono — monolingual translated PDF bytes. */
export async function downloadMono(
  serverUrl: string,
  jobId: string,
  opts?: ScientificPdfRequestOptions,
): Promise<ArrayBuffer> {
  return downloadArtifact(serverUrl, jobId, 'mono', opts);
}

/** GET /v1/jobs/:id/dual — bilingual dual-layout PDF bytes. */
export async function downloadDual(
  serverUrl: string,
  jobId: string,
  opts?: ScientificPdfRequestOptions,
): Promise<ArrayBuffer> {
  return downloadArtifact(serverUrl, jobId, 'dual', opts);
}

/** DELETE /v1/jobs/:id — cancel / cleanup (optional endpoint). */
export async function cancelJob(
  serverUrl: string,
  jobId: string,
  opts?: ScientificPdfRequestOptions,
): Promise<void> {
  const base = normalizeScientificPdfServerUrl(serverUrl);
  const id = encodeURIComponent(jobId);
  const res = await bridgeFetch(`${base}/v1/jobs/${id}`, {
    method: 'DELETE',
    timeoutMs: opts?.timeoutMs ?? DEFAULT_JSON_TIMEOUT_MS,
    signal: opts?.signal,
    // 204 has no body
    allowEmpty: true,
  });
  if (res.status === 204 || res.status === 200) return;
  // Non-empty error body path
  await throwFromErrorResponse(res);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function downloadArtifact(
  serverUrl: string,
  jobId: string,
  artifact: 'mono' | 'dual',
  opts?: ScientificPdfRequestOptions,
): Promise<ArrayBuffer> {
  const base = normalizeScientificPdfServerUrl(serverUrl);
  const id = encodeURIComponent(jobId);
  const res = await bridgeFetch(`${base}/v1/jobs/${id}/${artifact}`, {
    method: 'GET',
    timeoutMs: opts?.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS,
    signal: opts?.signal,
  });
  if (!res.ok) {
    await throwFromErrorResponse(res);
  }
  try {
    return await res.arrayBuffer();
  } catch (err) {
    throw new ScientificPdfClientError(
      'parse',
      err instanceof Error ? err.message : 'Failed to read PDF body',
      res.status,
    );
  }
}

interface BridgeFetchInit {
  method: string;
  body?: BodyInit;
  timeoutMs: number;
  signal?: AbortSignal;
  allowEmpty?: boolean;
}

async function bridgeFetch(url: string, init: BridgeFetchInit): Promise<Response> {
  const { signal, cleanup } = combineAbort(init.signal, init.timeoutMs);
  try {
    const res = await fetch(url, {
      method: init.method,
      body: init.body,
      signal,
    });

    // Success path for JSON/binary; error mapping below.
    if (res.ok || (init.allowEmpty && (res.status === 204 || res.status === 200))) {
      return res;
    }

    await throwFromErrorResponse(res);
    // throwFromErrorResponse always throws; satisfy TS
    return res;
  } catch (err) {
    if (err instanceof ScientificPdfClientError) throw err;
    throw mapNetworkError(err);
  } finally {
    cleanup();
  }
}

async function parseJsonBody<T>(res: Response): Promise<T> {
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    throw new ScientificPdfClientError(
      'parse',
      err instanceof Error ? err.message : 'Failed to read response body',
      res.status,
    );
  }

  if (!text.trim()) {
    throw new ScientificPdfClientError('parse', 'Empty response body', res.status);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ScientificPdfClientError(
      'parse',
      `Invalid JSON response (HTTP ${res.status})`,
      res.status,
    );
  }
}

async function throwFromErrorResponse(res: Response): Promise<never> {
  let body: BridgeErrorBody | null = null;
  try {
    const text = await res.text();
    if (text.trim()) {
      body = JSON.parse(text) as BridgeErrorBody;
    }
  } catch {
    // fall through with status-based mapping
  }

  const bridgeCode = body?.error?.code;
  const bridgeMessage = body?.error?.message;
  const code = mapBridgeErrorCode(bridgeCode, res.status);
  const message =
    bridgeMessage ||
    (res.status === 409
      ? 'Artifact not ready'
      : res.status === 404
        ? 'Job not found'
        : `Bridge request failed (HTTP ${res.status})`);

  throw new ScientificPdfClientError(code, message, res.status);
}

/** Map bridge / HTTP status to a stable client code. */
export function mapBridgeErrorCode(
  bridgeCode: string | undefined,
  status: number,
): ScientificPdfErrorCode {
  const normalized = (bridgeCode ?? '').toLowerCase();
  if (normalized === 'llm_auth') return 'llm_auth';
  if (normalized === 'llm_error') return 'llm_error';
  if (normalized === 'invalid_request') return 'invalid_request';
  if (normalized === 'not_found') return 'not_found';
  if (normalized === 'timeout') return 'timeout';
  if (normalized === 'internal') return 'internal';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';

  if (status === 401 || status === 403) return 'llm_auth';
  if (status === 404) return 'not_found';
  if (status === 409) return 'not_ready';
  if (status === 400 || status === 422) return 'invalid_request';
  if (status >= 500) return 'internal';
  return 'unknown';
}

export function mapNetworkError(err: unknown): ScientificPdfClientError {
  if (err instanceof ScientificPdfClientError) return err;

  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  // AbortController timeout or caller abort
  if (name === 'AbortError' || lower.includes('aborted') || lower.includes('abort')) {
    // Distinguish timeout vs caller cancel when possible
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return new ScientificPdfClientError('timeout', message || 'Request timed out');
    }
    // Our timer uses AbortSignal.timeout / abort without custom reason —
    // treat generic AbortError as timeout (most common client path).
    return new ScientificPdfClientError('timeout', message || 'Request timed out');
  }

  if (
    name === 'TypeError' ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes('load failed')
  ) {
    return new ScientificPdfClientError(
      'offline',
      message || 'Scientific PDF bridge is unreachable',
    );
  }

  return new ScientificPdfClientError('unknown', message || 'Unknown bridge error');
}

function toBlob(file: Blob | ArrayBuffer | Uint8Array): Blob {
  if (file instanceof Blob) return file;
  if (file instanceof ArrayBuffer) {
    return new Blob([file], { type: 'application/pdf' });
  }
  // Uint8Array — copy into a fresh ArrayBuffer-backed view for BlobPart typing
  const copy = new Uint8Array(file.byteLength);
  copy.set(file);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}

/**
 * Combine optional external signal with a timeout. Returns a cleanup that
 * clears the timer (safe to call multiple times).
 */
function combineAbort(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'AbortError'));
  }, timeoutMs);

  const onExternalAbort = (): void => {
    controller.abort(external?.reason ?? new DOMException('Aborted', 'AbortError'));
  };

  if (external) {
    if (external.aborted) {
      onExternalAbort();
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const cleanup = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (external) {
      external.removeEventListener('abort', onExternalAbort);
    }
  };

  return { signal: controller.signal, cleanup };
}
