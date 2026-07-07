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
  it('includes required provider entries', () => {
    const ids = OPENAI_COMPATIBLE_CATALOG.map((e) => e.id);
    expect(ids).toContain('openrouter');
    expect(ids).toContain('ollama');
    expect(ids).toContain('groq');
  });

  it('filterCatalog returns all when query is empty', () => {
    expect(filterCatalog('')).toHaveLength(OPENAI_COMPATIBLE_CATALOG.length);
    expect(filterCatalog('   ')).toHaveLength(OPENAI_COMPATIBLE_CATALOG.length);
  });

  it('filterCatalog matches by name/keyword and is case-insensitive', () => {
    expect(filterCatalog('openrouter').some((e) => e.id === 'openrouter')).toBe(true);
    expect(filterCatalog('router').some((e) => e.id === 'openrouter')).toBe(true);
    const results = filterCatalog('GROQ');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('groq');
  });

  it('getCatalogEntryById returns entry with baseUrl', () => {
    const entry = getCatalogEntryById('openrouter');
    expect(entry?.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(entry?.requiresApiKey).toBe(true);
  });
});

describe('getKeyUrl — catalog field', () => {
  it('keyed entries have getKeyUrl, keyless entries omit it', () => {
    const keyed = OPENAI_COMPATIBLE_CATALOG.filter((e) => e.requiresApiKey);
    for (const entry of keyed) {
      expect(entry.getKeyUrl).toBeTruthy();
      expect(entry.getKeyUrl).toMatch(/^https?:\/\//);
    }
    const keyless = OPENAI_COMPATIBLE_CATALOG.filter((e) => !e.requiresApiKey);
    for (const entry of keyless) {
      expect(entry.getKeyUrl).toBeUndefined();
    }
  });
});

describe('getKeyUrlForProvider', () => {
  it('resolves a known keyed provider by base URL', () => {
    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/keys');
  });

  it('returns undefined for keyless providers (Ollama)', () => {
    expect(getKeyUrlForProvider('http://localhost:11434/v1')).toBeUndefined();
  });

  it('returns undefined for unknown or empty base URLs', () => {
    expect(getKeyUrlForProvider('https://api.unknown.com/v1')).toBeUndefined();
    expect(getKeyUrlForProvider('')).toBeUndefined();
    expect(getKeyUrlForProvider('   ')).toBeUndefined();
  });

  it('handles trailing slash in base URL', () => {
    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/keys');
  });
});

describe('identity badge metadata (FR-2)', () => {
  it('every entry has an accent + monogram', () => {
    for (const entry of OPENAI_COMPATIBLE_CATALOG) {
      expect(entry.accent, `${entry.id}.accent`).toBeDefined();
      expect(entry.monogram, `${entry.id}.monogram`).toBeTruthy();
    }
  });

  it('assigns the spec accents per provider', () => {
    expect(getCatalogEntryById('groq')?.accent).toBe('orange');
    expect(getCatalogEntryById('ollama')?.accent).toBe('teal');
  });

  it('assigns the spec monograms per provider', () => {
    expect(getCatalogEntryById('groq')?.monogram).toBe('GQ');
    expect(getCatalogEntryById('custom')?.monogram).toBe('⚙');
  });
});

describe('resolveProviderIdentity (FR-2 fallback chain)', () => {
  it('uses the catalog entry when an explicit non-custom catalogId is set', () => {
    const id = resolveProviderIdentity('Whatever', 'groq', 'https://example.com');
    expect(id.accent).toBe('orange');
    expect(id.monogram).toBe('GQ');
  });

  it('uses the custom entry (gear) when catalogId is explicitly custom', () => {
    // The custom template is a real catalog entry with its own gear monogram;
    // an explicit catalogId always wins over URL inference.
    const id = resolveProviderIdentity('Whatever', 'custom', 'https://api.groq.com/openai/v1');
    expect(id.accent).toBe('zinc');
    expect(id.monogram).toBe('⚙');
  });

  it('falls back to the URL-inferred entry when catalogId is undefined', () => {
    const id = resolveProviderIdentity('Whatever', undefined, 'http://localhost:11434/v1');
    expect(id.accent).toBe('teal');
    expect(id.monogram).toBe('OL');
  });

  it('falls back to zinc + first letter for unknown or empty URL', () => {
    expect(resolveProviderIdentity('My Provider', undefined, 'https://api.unknown.com/v1').monogram).toBe('M');
    expect(resolveProviderIdentity('Acme', undefined, '').monogram).toBe('A');
  });

  it('returns ? when display name is empty and nothing resolves', () => {
    const id = resolveProviderIdentity('  ', undefined, '');
    expect(id.monogram).toBe('?');
  });
});

describe('inferCatalogId (URL inference)', () => {
  it('returns custom for empty URL', () => {
    expect(inferCatalogId('')).toBe('custom');
    expect(inferCatalogId('   ')).toBe('custom');
  });

  it('matches a known catalog URL exactly, normalizing trailing slashes', () => {
    expect(inferCatalogId('https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(inferCatalogId('https://openrouter.ai/api/v1/')).toBe('openrouter');
  });

  it('returns custom for an unknown URL', () => {
    expect(inferCatalogId('https://api.unknown.com/v1')).toBe('custom');
  });
});

describe('category field + groupByCategory (FR-7)', () => {
  it('every entry has a category matching its bucket (cloud/local/custom)', () => {
    for (const entry of OPENAI_COMPATIBLE_CATALOG) {
      expect(entry.category, `${entry.id}.category`).toBeDefined();
    }
    const cloud = ['openrouter', 'nvidia-nim', 'groq', 'together', 'fireworks', 'mistral'];
    const local = ['ollama', 'lm-studio'];
    for (const id of cloud) expect(getCatalogEntryById(id)?.category).toBe('cloud');
    for (const id of local) expect(getCatalogEntryById(id)?.category).toBe('local');
  });

  it('groupByCategory returns groups in order and puts each entry in its bucket', () => {
    const groups = groupByCategory();
    expect(groups.map((g) => g.category)).toEqual(['cloud', 'local', 'custom']);
    const findIds = (cat: 'cloud' | 'local' | 'custom'): string[] => {
      const g = groups.find((x) => x.category === cat);
      return g ? g.entries.map((e) => e.id) : [];
    };
    expect(findIds('cloud')).toHaveLength(6);
    expect(findIds('local')).toEqual(['ollama', 'lm-studio']);
    expect(findIds('custom')).toEqual(['custom']);
  });

  it('groupByCategory omits empty groups and respects filtered input', () => {
    const filtered = filterCatalog('ollama');
    const groups = groupByCategory(filtered);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe('local');
  });
});