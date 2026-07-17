import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  health,
  createJob,
  getJob,
  downloadMono,
  downloadDual,
  cancelJob,
  ScientificPdfClientError,
  mapBridgeErrorCode,
  mapNetworkError,
} from '@/lib/scientificPdfClient';

const BASE = 'http://127.0.0.1:17890';

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('scientificPdfClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps bridge codes, HTTP statuses, and network errors', () => {
    expect(mapBridgeErrorCode('llm_auth', 401)).toBe('llm_auth');
    expect(mapBridgeErrorCode('llm_error', 502)).toBe('llm_error');
    expect(mapBridgeErrorCode(undefined, 404)).toBe('not_found');
    expect(mapBridgeErrorCode(undefined, 409)).toBe('not_ready');
    expect(mapBridgeErrorCode(undefined, 500)).toBe('internal');
    expect(mapBridgeErrorCode(undefined, 418)).toBe('unknown');
    expect(mapNetworkError(new TypeError('Failed to fetch')).code).toBe('offline');
    expect(mapNetworkError(new DOMException('Aborted', 'AbortError')).code).toBe('timeout');
  });

  it('health: success, URL normalize, offline, timeout, AbortSignal', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'ok', version: '1.0.0', pdf2zh: 'available' }),
    );
    const result = await health(BASE);
    expect(result).toEqual({ status: 'ok', version: '1.0.0', pdf2zh: 'available' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/health`,
      expect.objectContaining({ method: 'GET' }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
    await health('http://127.0.0.1:17890/v1/jobs/');
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`${BASE}/health`);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(health(BASE)).rejects.toMatchObject({
      name: 'ScientificPdfClientError',
      code: 'offline',
    });

    fetchMock.mockRejectedValueOnce(
      new DOMException('The operation was aborted', 'AbortError'),
    );
    await expect(health(BASE, { timeoutMs: 1 })).rejects.toMatchObject({ code: 'timeout' });

    fetchMock.mockImplementation((_url, init) => {
      expect((init as RequestInit | undefined)?.signal).toBeDefined();
      return Promise.resolve(jsonResponse({ status: 'ok' }));
    });
    await health(BASE, { signal: new AbortController().signal });
  });

  it('createJob posts multipart and maps llm_auth / invalid_request', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'job_abc', state: 'queued' }, 202));
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const job = await createJob(BASE, {
      file: pdfBytes,
      fileName: 'paper.pdf',
      config: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        lang_in: 'en',
        lang_out: 'vi',
      },
    });
    expect(job).toEqual({ id: 'job_abc', state: 'queued' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('config')).toBe(
      JSON.stringify({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        lang_in: 'en',
        lang_out: 'vi',
      }),
    );
    expect(form.get('file')).toBeInstanceOf(Blob);

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'llm_auth', message: 'API key rejected' } }, 401),
    );
    await expect(
      createJob(BASE, {
        file: new ArrayBuffer(4),
        config: {
          baseUrl: 'https://api.example.com/v1',
          model: 'm',
          lang_in: 'en',
          lang_out: 'vi',
        },
      }),
    ).rejects.toMatchObject({ code: 'llm_auth', message: 'API key rejected', status: 401 });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'invalid_request', message: 'Missing file' } }, 400),
    );
    await expect(
      createJob(BASE, {
        file: new Blob([]),
        config: {
          baseUrl: 'https://api.example.com/v1',
          model: 'm',
          lang_in: 'en',
          lang_out: 'vi',
        },
      }),
    ).rejects.toBeInstanceOf(ScientificPdfClientError);
  });

  it('getJob: progress, 404, failed state payload, parse error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ id: 'job_1', state: 'running', progress: 0.4, message: 'translating' }),
    );
    const job = await getJob(BASE, 'job_1');
    expect(job.state).toBe('running');
    expect(job.progress).toBe(0.4);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${BASE}/v1/jobs/job_1`);

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: { code: 'not_found', message: 'Unknown job id' } }, 404),
    );
    await expect(getJob(BASE, 'missing')).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        id: 'job_fail',
        state: 'failed',
        error: { code: 'llm_error', message: 'Model overloaded' },
      }),
    );
    const failed = await getJob(BASE, 'job_fail');
    expect(failed.state).toBe('failed');
    expect(failed.error?.code).toBe('llm_error');

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );
    await expect(getJob(BASE, 'job_x')).rejects.toMatchObject({ code: 'parse' });
  });

  it('download mono/dual and cancel job paths', async () => {
    const monoBytes = new Uint8Array([1, 2, 3, 4]);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(monoBytes, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
    const mono = await downloadMono(BASE, 'job_1');
    expect(mono).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(mono)).toEqual(monoBytes);
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe(`${BASE}/v1/jobs/job_1/mono`);

    const dualBytes = new Uint8Array([9, 8]);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(dualBytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
    );
    const dual = await downloadDual(BASE, 'job_2');
    expect(new Uint8Array(dual)).toEqual(dualBytes);
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe(`${BASE}/v1/jobs/job_2/dual`);

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: { code: 'not_ready', message: 'Still processing' } }, 409),
    );
    await expect(downloadMono(BASE, 'job_1')).rejects.toMatchObject({
      code: 'not_ready',
      status: 409,
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(cancelJob(BASE, 'job_1')).resolves.toBeUndefined();
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe(`${BASE}/v1/jobs/job_1`);
    expect((vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit).method).toBe('DELETE');

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: { code: 'not_found', message: 'gone' } }, 404),
    );
    await expect(cancelJob(BASE, 'gone')).rejects.toMatchObject({ code: 'not_found' });
  });
});
