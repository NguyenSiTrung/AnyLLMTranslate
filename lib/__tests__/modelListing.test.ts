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

describe('parseModelsListResponse', () => {
  it('extracts model ids from standard OpenAI { data: [{ id }] } payload', () => {
    const result = parseModelsListResponse({
      object: 'list',
      data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }],
    });
    expect(result.ids).toEqual(['gpt-4o-mini', 'gpt-4o']);
    expect(result.hasMore).toBe(false);
    expect(result.lastId).toBe('gpt-4o');
  });

  it('reads has_more and last_id when present', () => {
    const result = parseModelsListResponse({
      data: [{ id: 'a' }, { id: 'b' }],
      has_more: true,
      last_id: 'b',
    });
    expect(result.hasMore).toBe(true);
    expect(result.lastId).toBe('b');
  });

  it('falls back lastId to the last data item when last_id is omitted', () => {
    const result = parseModelsListResponse({
      data: [{ id: 'm1' }, { id: 'm2' }],
      has_more: true,
    });
    expect(result.lastId).toBe('m2');
  });

  it('accepts a bare array of model objects', () => {
    const result = parseModelsListResponse([{ id: 'local-1' }, { id: 'local-2' }]);
    expect(result.ids).toEqual(['local-1', 'local-2']);
    expect(result.hasMore).toBe(false);
  });

  it('skips entries without string ids and returns empty for invalid payloads', () => {
    expect(parseModelsListResponse({ data: [{ name: 'x' }, { id: 'ok' }] }).ids).toEqual(['ok']);
    expect(parseModelsListResponse(null).ids).toEqual([]);
    expect(parseModelsListResponse({}).ids).toEqual([]);
    expect(parseModelsListResponse('nope').ids).toEqual([]);
  });
});

describe('filterModelIds', () => {
  const models = ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'meta/llama-3.1-8b'];

  it('returns all models for empty or whitespace query', () => {
    expect(filterModelIds(models, '')).toEqual(models);
    expect(filterModelIds(models, '   ')).toEqual(models);
  });

  it('filters case-insensitively by substring', () => {
    expect(filterModelIds(models, 'GPT')).toEqual(['openai/gpt-4o']);
    expect(filterModelIds(models, 'claude')).toEqual(['anthropic/claude-3.5-sonnet']);
    expect(filterModelIds(models, 'meta/')).toEqual(['meta/llama-3.1-8b']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterModelIds(models, 'does-not-exist')).toEqual([]);
  });
});

describe('buildModelsListUrl', () => {
  it('builds base /models URL without query when after is omitted', () => {
    expect(buildModelsListUrl('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/models',
    );
    expect(buildModelsListUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/models',
    );
  });

  it('appends after cursor for pagination', () => {
    expect(buildModelsListUrl('https://api.example.com/v1', 'model-page-1')).toBe(
      'https://api.example.com/v1/models?after=model-page-1',
    );
  });
});

describe('MAX_MODEL_LIST_PAGES', () => {
  it('caps pagination to a safe positive limit', () => {
    expect(MAX_MODEL_LIST_PAGES).toBeGreaterThanOrEqual(5);
    expect(MAX_MODEL_LIST_PAGES).toBeLessThanOrEqual(50);
  });
});
