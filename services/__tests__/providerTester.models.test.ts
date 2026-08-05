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

  it('covers single-page, pagination, deduplication, and first-page error responses', async () => {
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
    {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    const failed = await listProviderModels({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'bad',
    });

    expect(failed.success).toBe(false);
    expect(failed.models).toEqual([]);
    expect(failed.error).toMatch(/401/);
    }
    {
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

    // Folded scenario: duplicate ids across pages are deduped.
    const dedupFetch = vi
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
    vi.stubGlobal('fetch', dedupFetch);

    const deduped = await listProviderModels({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'k',
    });

    expect(deduped.models).toEqual(['shared', 'only-1', 'only-2']);
    }
  });

});
