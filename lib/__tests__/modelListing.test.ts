/**
 * Tests for OpenAI-compatible model list parsing, filtering, and pagination URL helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  parseModelsListResponse,
  filterModelIds,
  buildModelsListUrl,
  MAX_MODEL_LIST_PAGES,
} from '@/lib/modelListing';

describe('modelListing', () => {
  it('parseModelsListResponse extracts ids, pagination, and guards invalid payloads', () => {
    expect(
      parseModelsListResponse({
        object: 'list',
        data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }],
      }),
    ).toMatchObject({ ids: ['gpt-4o-mini', 'gpt-4o'], hasMore: false, lastId: 'gpt-4o' });

    expect(
      parseModelsListResponse({
        data: [{ id: 'a' }, { id: 'b' }],
        has_more: true,
        last_id: 'b',
      }),
    ).toMatchObject({ hasMore: true, lastId: 'b' });

    expect(
      parseModelsListResponse({
        data: [{ id: 'm1' }, { id: 'm2' }],
        has_more: true,
      }).lastId,
    ).toBe('m2');

    expect(parseModelsListResponse([{ id: 'local-1' }, { id: 'local-2' }]).ids).toEqual([
      'local-1',
      'local-2',
    ]);
    expect(parseModelsListResponse({ data: [{ name: 'x' }, { id: 'ok' }] }).ids).toEqual(['ok']);
    expect(parseModelsListResponse(null).ids).toEqual([]);
    expect(parseModelsListResponse({}).ids).toEqual([]);
    expect(parseModelsListResponse('nope').ids).toEqual([]);
  });

  it('filterModelIds and buildModelsListUrl', () => {
    const models = ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta/llama-3.1-8b'];
    expect(filterModelIds(models, '')).toEqual(models);
    expect(filterModelIds(models, '   ')).toEqual(models);
    expect(filterModelIds(models, 'GPT')).toEqual(['openai/gpt-4o']);
    expect(filterModelIds(models, 'claude')).toEqual(['anthropic/claude-3.5-sonnet']);
    expect(filterModelIds(models, 'meta/')).toEqual(['meta/llama-3.1-8b']);
    expect(filterModelIds(models, 'does-not-exist')).toEqual([]);

    expect(buildModelsListUrl('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/models',
    );
    expect(buildModelsListUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/models',
    );
    expect(buildModelsListUrl('https://api.example.com/v1', 'model-page-1')).toBe(
      'https://api.example.com/v1/models?after=model-page-1',
    );

    expect(MAX_MODEL_LIST_PAGES).toBeGreaterThanOrEqual(5);
    expect(MAX_MODEL_LIST_PAGES).toBeLessThanOrEqual(50);
  });
});
