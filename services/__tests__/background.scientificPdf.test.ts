import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleMessage,
  __resetSemaphoreForTest,
  __resetTranslationServiceForTest,
  __resetSettingsCacheForTest,
} from '../background';
import { DEFAULT_SETTINGS, type ExtensionSettings } from '@/types/config';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string | string[] | Record<string, unknown>) => {
        if (typeof key === 'string') {
          return { [key]: mockStorage[key] };
        }
        return { ...mockStorage };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    id: 'test-extension-id',
  },
  tabs: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onRemoved: {
      addListener: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
});

function seedSettings(partial: Partial<ExtensionSettings> = {}): void {
  mockStorage['anyllm-translate-settings'] = {
    ...DEFAULT_SETTINGS,
    ...partial,
    provider: {
      ...DEFAULT_SETTINGS.provider,
      ...(partial.provider ?? {}),
      baseUrl: 'https://api.example.com/v1',
      model: 'test-model',
      apiKey: 'sk-test-key',
      requiresApiKey: true,
      connectionStatus: 'success',
    },
    providers: partial.providers ?? [
      {
        id: 'p1',
        displayName: 'Test',
        baseUrl: 'https://api.example.com/v1',
        model: 'test-model',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        keys: [
          {
            id: 'k1',
            apiKey: 'sk-test-key',
            maxRpm: 20,
            concurrencyLimit: 1,
            interval: 0,
            enabled: true,
          },
        ],
      },
    ],
    scientificPdf: {
      enabled: true,
      serverUrl: 'http://127.0.0.1:17890',
      setupCompletedAt: '2026-07-17T00:00:00.000Z',
      ...(partial.scientificPdf ?? {}),
    },
    sourceLanguage: partial.sourceLanguage ?? 'en',
    targetLanguage: partial.targetLanguage ?? 'vi',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('background — scientific PDF handlers', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    __resetSemaphoreForTest();
    __resetTranslationServiceForTest();
    __resetSettingsCacheForTest();
    // Stub only fetch — do not unstub chrome (module-level mockStorage chrome API).
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('fetch not mocked for this call'))),
    );
    seedSettings();
  });

  afterEach(() => {
    vi.mocked(fetch).mockReset();
  });

  describe('SCIENTIFIC_PDF_HEALTH', () => {
    it('returns success when bridge reports ok, maps offline when fetch fails', async () => {
      // Scenario 1: bridge reports ok.
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ status: 'ok', version: '1.0.0', pdf2zh: 'available' }),
      );

      const okResult = await handleMessage(
        { action: 'SCIENTIFIC_PDF_HEALTH' },
        {} as chrome.runtime.MessageSender,
      );

      expect(okResult).toMatchObject({
        success: true,
        status: 'ok',
        version: '1.0.0',
        serverUrl: 'http://127.0.0.1:17890',
      });

      // Scenario 2: fetch fails → offline.
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const offlineResult = await handleMessage(
        { action: 'SCIENTIFIC_PDF_HEALTH' },
        {} as chrome.runtime.MessageSender,
      );

      expect(offlineResult).toMatchObject({ success: false, code: 'offline' });
    });
  });

  describe('SCIENTIFIC_PDF_CREATE_JOB', () => {
    it('injects pool credentials + languages into createJob multipart', async () => {
      // Arrange
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ id: 'job_1', state: 'queued' }, 202),
      );
      const fileBase64 = btoa('%PDF-1.4 fake');

      // Act
      const result = await handleMessage(
        {
          action: 'SCIENTIFIC_PDF_CREATE_JOB',
          fileBase64,
          fileName: 'paper.pdf',
        },
        {} as chrome.runtime.MessageSender,
      );

      // Assert
      expect(result).toEqual({ success: true, jobId: 'job_1', state: 'queued' });
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://127.0.0.1:17890/v1/jobs');
      expect(init.method).toBe('POST');
      const form = init.body as FormData;
      const config = JSON.parse(String(form.get('config')));
      expect(config).toEqual({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test-key',
        model: 'test-model',
        lang_in: 'en',
        lang_out: 'vi',
        maxRpm: 20,
        concurrencyLimit: 1,
        interval: 0,
      });
    });

    it('gates on empty pool (no dispatchable credentials) and rejects missing fileBase64', async () => {
      seedSettings({
        providers: [],
        provider: {
          ...DEFAULT_SETTINGS.provider,
          baseUrl: '',
          model: '',
          apiKey: '',
        },
      });
      // Override after seed — empty pool
      mockStorage['anyllm-translate-settings'] = {
        ...(mockStorage['anyllm-translate-settings'] as object),
        providers: [],
        provider: {
          ...DEFAULT_SETTINGS.provider,
          baseUrl: '',
          model: '',
          apiKey: '',
          requiresApiKey: true,
        },
      };
      __resetSettingsCacheForTest();

      const emptyPoolResult = await handleMessage(
        {
          action: 'SCIENTIFIC_PDF_CREATE_JOB',
          fileBase64: btoa('x'),
        },
        {} as chrome.runtime.MessageSender,
      );

      expect(emptyPoolResult).toMatchObject({ success: false });
      expect((emptyPoolResult as { code?: string }).code).toMatch(/pool|empty|not-configured|key/i);
      expect(fetch).not.toHaveBeenCalled();

      // Missing fileBase64 is a distinct invalid-request gate.
      const missingFileResult = await handleMessage(
        {
          action: 'SCIENTIFIC_PDF_CREATE_JOB',
          fileBase64: '',
        },
        {} as chrome.runtime.MessageSender,
      );

      expect(missingFileResult).toMatchObject({ success: false, code: 'invalid_request' });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('SCIENTIFIC_PDF_DOWNLOAD', () => {
    it('returns base64 PDF for mono artifact', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(pdfBytes, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      );

      const result = await handleMessage(
        {
          action: 'SCIENTIFIC_PDF_DOWNLOAD',
          jobId: 'job_1',
          artifact: 'mono',
        },
        {} as chrome.runtime.MessageSender,
      );

      expect(result).toMatchObject({ success: true, artifact: 'mono' });
      const typed = result as { fileBase64?: string };
      expect(typed.fileBase64).toBe(btoa(String.fromCharCode(...pdfBytes)));
    });
  });
});
