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

  describe('mapBridgeErrorCode / mapNetworkError', () => {
    it('maps bridge codes and HTTP statuses', () => {
      // Arrange / Act / Assert
      expect(mapBridgeErrorCode('llm_auth', 401)).toBe('llm_auth');
      expect(mapBridgeErrorCode('llm_error', 502)).toBe('llm_error');
      expect(mapBridgeErrorCode(undefined, 404)).toBe('not_found');
      expect(mapBridgeErrorCode(undefined, 409)).toBe('not_ready');
      expect(mapBridgeErrorCode(undefined, 500)).toBe('internal');
      expect(mapBridgeErrorCode(undefined, 418)).toBe('unknown');
    });

    it('maps network failures to offline and aborts to timeout', () => {
      expect(mapNetworkError(new TypeError('Failed to fetch')).code).toBe('offline');
      expect(mapNetworkError(new DOMException('Aborted', 'AbortError')).code).toBe('timeout');
    });
  });

  describe('health', () => {
    it('returns parsed health body on success', async () => {
      // Arrange
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ status: 'ok', version: '1.0.0', pdf2zh: 'available' }),
      );

      // Act
      const result = await health(BASE);

      // Assert
      expect(result).toEqual({ status: 'ok', version: '1.0.0', pdf2zh: 'available' });
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/health`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('normalizes server URL (strips path / trailing slash)', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      await health('http://127.0.0.1:17890/v1/jobs/');

      expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/health`);
    });

    it('maps connection refused to offline', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(health(BASE)).rejects.toMatchObject({
        name: 'ScientificPdfClientError',
        code: 'offline',
      });
    });

    it('maps abort/timeout to timeout code', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

      await expect(health(BASE, { timeoutMs: 1 })).rejects.toMatchObject({
        code: 'timeout',
      });
    });
  });

  describe('createJob', () => {
    it('posts multipart form and returns job on 202', async () => {
      // Arrange
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ id: 'job_abc', state: 'queued' }, 202),
      );
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

      // Act
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

      // Assert
      expect(job).toEqual({ id: 'job_abc', state: 'queued' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
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
      const filePart = form.get('file');
      expect(filePart).toBeInstanceOf(Blob);
    });

    it('maps llm_auth bridge error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'llm_auth', message: 'API key rejected' } },
          401,
        ),
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
      ).rejects.toMatchObject({
        code: 'llm_auth',
        message: 'API key rejected',
        status: 401,
      });
    });

    it('maps invalid_request on 400', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'invalid_request', message: 'Missing file' } },
          400,
        ),
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
  });

  describe('getJob', () => {
    it('returns job progress snapshot', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({
          id: 'job_1',
          state: 'running',
          progress: 0.4,
          message: 'translating',
        }),
      );

      const job = await getJob(BASE, 'job_1');

      expect(job.state).toBe('running');
      expect(job.progress).toBe(0.4);
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${BASE}/v1/jobs/job_1`);
    });

    it('maps 404 not_found', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ error: { code: 'not_found', message: 'Unknown job id' } }, 404),
      );

      await expect(getJob(BASE, 'missing')).rejects.toMatchObject({
        code: 'not_found',
        status: 404,
      });
    });

    it('maps failed job error body on 200 as success payload (caller inspects state)', async () => {
      // Polling returns 200 with state=failed; client does not throw for ok responses
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({
          id: 'job_fail',
          state: 'failed',
          error: { code: 'llm_error', message: 'Model overloaded' },
        }),
      );

      const job = await getJob(BASE, 'job_fail');
      expect(job.state).toBe('failed');
      expect(job.error?.code).toBe('llm_error');
    });

    it('throws parse when body is not JSON', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      );

      await expect(getJob(BASE, 'job_x')).rejects.toMatchObject({ code: 'parse' });
    });
  });

  describe('downloadMono / downloadDual', () => {
    it('returns ArrayBuffer for mono PDF', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(bytes, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      );

      const buf = await downloadMono(BASE, 'job_1');
      expect(buf).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(buf)).toEqual(bytes);
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${BASE}/v1/jobs/job_1/mono`);
    });

    it('returns ArrayBuffer for dual PDF', async () => {
      const bytes = new Uint8Array([9, 8]);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
      );

      const buf = await downloadDual(BASE, 'job_2');
      expect(new Uint8Array(buf)).toEqual(bytes);
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${BASE}/v1/jobs/job_2/dual`);
    });

    it('maps 409 to not_ready', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'not_ready', message: 'Still processing' } },
          409,
        ),
      );

      await expect(downloadMono(BASE, 'job_1')).rejects.toMatchObject({
        code: 'not_ready',
        status: 409,
      });
    });
  });

  describe('cancelJob', () => {
    it('resolves on 204', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

      await expect(cancelJob(BASE, 'job_1')).resolves.toBeUndefined();
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${BASE}/v1/jobs/job_1`);
      expect((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
    });

    it('throws not_found on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ error: { code: 'not_found', message: 'gone' } }, 404),
      );

      await expect(cancelJob(BASE, 'gone')).rejects.toMatchObject({ code: 'not_found' });
    });
  });

  describe('request options', () => {
    it('forwards caller AbortSignal', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockImplementation((_url, init) => {
        const signal = (init as RequestInit | undefined)?.signal;
        expect(signal).toBeDefined();
        return Promise.resolve(jsonResponse({ status: 'ok' }));
      });

      const controller = new AbortController();
      await health(BASE, { signal: controller.signal });
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
