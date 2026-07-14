/**
 * Tests for listProviderModels — single page + has_more pagination.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { listProviderModels } from '@/services/providerTester';

describe('listProviderModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns all model ids from a single-page /models response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'model-a' }, { id: 'model-b' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listProviderModels({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
    });

    expect(result.success).toBe(true);
    expect(result.models).toEqual(['model-a', 'model-b']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/v1/models');
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
  });

  it('follows has_more pagination via after cursor until complete', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'page1-a' }, { id: 'page1-b' }],
          has_more: true,
          last_id: 'page1-b',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'page2-a' }],
          has_more: false,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listProviderModels({
      baseUrl: 'https://api.example.com/v1',
      apiKey: '',
    });

    expect(result.success).toBe(true);
    expect(result.models).toEqual(['page1-a', 'page1-b', 'page2-a']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/v1/models');
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://api.example.com/v1/models?after=page1-b',
    );
  });

  it('dedupes model ids across pages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'shared' }, { id: 'only-1' }],
          has_more: true,
          last_id: 'only-1',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'shared' }, { id: 'only-2' }],
          has_more: false,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listProviderModels({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'k',
    });

    expect(result.models).toEqual(['shared', 'only-1', 'only-2']);
  });

  it('returns error when first page is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    const result = await listProviderModels({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'bad',
    });

    expect(result.success).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.error).toMatch(/401/);
  });
});
