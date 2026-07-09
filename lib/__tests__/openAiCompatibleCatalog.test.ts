import { describe, it, expect } from 'vitest';
import {
  OPENAI_COMPATIBLE_CATALOG,
  filterCatalog,
  getCatalogEntryById,
  getKeyUrlForProvider,
  groupByCategory,
  inferCatalogId,
  resolveProviderIdentity,
} from '@/lib/openAiCompatibleCatalog';

describe('openAiCompatibleCatalog', () => {
  it('includes required provider entries and resolves by id', () => {
    const ids = OPENAI_COMPATIBLE_CATALOG.map((e) => e.id);
    expect(ids).toContain('openrouter');
    expect(ids).toContain('ollama');
    expect(ids).toContain('groq');
    const entry = getCatalogEntryById('openrouter');
    expect(entry?.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(entry?.requiresApiKey).toBe(true);
  });

  it('filterCatalog matches by name/keyword (empty query returns all)', () => {
    expect(filterCatalog('')).toHaveLength(OPENAI_COMPATIBLE_CATALOG.length);
    expect(filterCatalog('router').some((e) => e.id === 'openrouter')).toBe(true);
    expect(filterCatalog('GROQ')).toHaveLength(1);
  });
});

describe('getKeyUrlForProvider', () => {
  it('resolves keyed providers and normalizes trailing slash', () => {
    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/keys');
    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/keys');
    expect(getKeyUrlForProvider('http://localhost:11434/v1')).toBeUndefined();
    expect(getKeyUrlForProvider('')).toBeUndefined();
  });
});

describe('resolveProviderIdentity (FR-2 fallback chain)', () => {
  it('prefers explicit catalogId over URL inference', () => {
    expect(resolveProviderIdentity('Whatever', 'groq', 'https://example.com').monogram).toBe('GQ');
    expect(resolveProviderIdentity('Whatever', 'custom', 'https://api.groq.com/openai/v1').monogram).toBe('⚙');
  });

  it('falls back to URL-inferred or first-letter monogram', () => {
    expect(resolveProviderIdentity('Whatever', undefined, 'http://localhost:11434/v1').monogram).toBe('OL');
    expect(resolveProviderIdentity('My Provider', undefined, 'https://api.unknown.com/v1').monogram).toBe('M');
    expect(resolveProviderIdentity('  ', undefined, '').monogram).toBe('?');
  });
});

describe('inferCatalogId + groupByCategory', () => {
  it('infers catalog id from base URL', () => {
    expect(inferCatalogId('')).toBe('custom');
    expect(inferCatalogId('https://openrouter.ai/api/v1/')).toBe('openrouter');
    expect(inferCatalogId('https://api.unknown.com/v1')).toBe('custom');
  });

  it('groupByCategory buckets entries and omits empty groups for filtered input', () => {
    const groups = groupByCategory();
    expect(groups.map((g) => g.category)).toEqual(['cloud', 'local', 'custom']);
    expect(groups.find((g) => g.category === 'local')?.entries.map((e) => e.id)).toEqual([
      'ollama',
      'lm-studio',
    ]);
    const filtered = groupByCategory(filterCatalog('ollama'));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('local');
  });
});
