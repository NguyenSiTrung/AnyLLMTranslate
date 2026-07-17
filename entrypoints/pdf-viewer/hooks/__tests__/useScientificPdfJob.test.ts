/**
 * Unit tests for Scientific PDF job helpers (base64 / progress semantics via hook API).
 * Full chrome.runtime orchestration is covered lightly with mocks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    scientificPdf: {
      enabled: true,
      serverUrl: 'http://127.0.0.1:17890',
      preferScientific: false,
      setupCompletedAt: '2026-07-17T00:00:00Z',
    },
    sourceLanguage: 'en',
    targetLanguage: 'vi',
  }),
}));

import { useScientificPdfJob } from '../useScientificPdfJob';

describe('useScientificPdfJob', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
        getURL: (p: string) => `chrome-extension://id/${p}`,
      },
      tabs: { create: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshHealth sets ready when health ok', async () => {
    sendMessage.mockResolvedValueOnce({ success: true, status: 'ok' });
    const { result } = renderHook(() =>
      useScientificPdfJob({ pdfUrl: 'https://example.com/a.pdf' }),
    );
    let ok = false;
    await act(async () => {
      ok = await result.current.refreshHealth();
    });
    expect(ok).toBe(true);
    expect(result.current.healthOk).toBe(true);
    expect(result.current.bridgeStatus).toBe('ready');
  });

  it('startJob fails open with offline when health fails', async () => {
    sendMessage.mockResolvedValueOnce({ success: false, error: 'offline', code: 'offline' });
    const { result } = renderHook(() =>
      useScientificPdfJob({ pdfUrl: 'https://example.com/a.pdf' }),
    );
    await act(async () => {
      await result.current.startJob();
    });
    expect(result.current.progress.stage).toBe('error');
    expect(result.current.progress.errorCode).toBe('offline');
    expect(result.current.isRunning).toBe(false);
  });

  it('startJob create failure surfaces error', async () => {
    sendMessage
      .mockResolvedValueOnce({ success: true, status: 'ok' }) // health
      .mockResolvedValueOnce({ success: false, error: 'pool not ready', code: 'llm_auth' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4').buffer,
      }),
    );

    const { result } = renderHook(() =>
      useScientificPdfJob({ pdfUrl: 'https://example.com/a.pdf', fileName: 'a.pdf' }),
    );
    await act(async () => {
      await result.current.startJob();
    });
    expect(result.current.progress.stage).toBe('error');
    expect(result.current.progress.error).toMatch(/pool not ready|Could not start/i);
  });
});
