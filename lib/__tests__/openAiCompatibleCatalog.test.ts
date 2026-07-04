import { describe, it, expect } from 'vitest';
import {
  OPENAI_COMPATIBLE_CATALOG,
  filterCatalog,
  getCatalogEntryById,
  getKeyUrlForProvider,
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

  it('filterCatalog matches OpenRouter by name and keyword', () => {
    expect(filterCatalog('openrouter').some((e) => e.id === 'openrouter')).toBe(true);
    expect(filterCatalog('router').some((e) => e.id === 'openrouter')).toBe(true);
  });

  it('filterCatalog is case-insensitive', () => {
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
  it('keyed entries have getKeyUrl', () => {
    const keyed = OPENAI_COMPATIBLE_CATALOG.filter((e) => e.requiresApiKey);
    for (const entry of keyed) {
      expect(entry.getKeyUrl).toBeTruthy();
      expect(entry.getKeyUrl).toMatch(/^https?:\/\//);
    }
  });

  it('keyless entries (ollama, lm-studio, custom) omit getKeyUrl', () => {
    const keyless = OPENAI_COMPATIBLE_CATALOG.filter((e) => !e.requiresApiKey);
    for (const entry of keyless) {
      expect(entry.getKeyUrl).toBeUndefined();
    }
  });

  it('OpenRouter getKeyUrl is correct', () => {
    expect(getCatalogEntryById('openrouter')?.getKeyUrl).toBe('https://openrouter.ai/keys');
  });

  it('Groq getKeyUrl is correct', () => {
    expect(getCatalogEntryById('groq')?.getKeyUrl).toBe('https://console.groq.com/keys');
  });
});

describe('getKeyUrlForProvider', () => {
  it('resolves OpenRouter by base URL', () => {
    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/keys');
  });

  it('resolves Groq by base URL', () => {
    expect(getKeyUrlForProvider('https://api.groq.com/openai/v1')).toBe('https://console.groq.com/keys');
  });

  it('resolves NVIDIA NIM by base URL', () => {
    expect(getKeyUrlForProvider('https://integrate.api.nvidia.com/v1')).toBe('https://build.nvidia.com/models/api-key');
  });

  it('resolves Together AI by base URL', () => {
    expect(getKeyUrlForProvider('https://api.together.xyz/v1')).toBe('https://api.together.xyz/settings/api-keys');
  });

  it('resolves Fireworks AI by base URL', () => {
    expect(getKeyUrlForProvider('https://api.fireworks.ai/inference/v1')).toBe('https://fireworks.ai/api-keys');
  });

  it('resolves Mistral AI by base URL', () => {
    expect(getKeyUrlForProvider('https://api.mistral.ai/v1')).toBe('https://console.mistral.ai/api-keys/');
  });

  it('returns undefined for keyless providers (Ollama)', () => {
    expect(getKeyUrlForProvider('http://localhost:11434/v1')).toBeUndefined();
  });

  it('returns undefined for unknown base URLs', () => {
    expect(getKeyUrlForProvider('https://api.unknown.com/v1')).toBeUndefined();
  });

  it('returns undefined for empty base URL', () => {
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
    expect(getCatalogEntryById('openrouter')?.accent).toBe('zinc');
    expect(getCatalogEntryById('nvidia-nim')?.accent).toBe('emerald');
    expect(getCatalogEntryById('groq')?.accent).toBe('orange');
    expect(getCatalogEntryById('together')?.accent).toBe('pink');
    expect(getCatalogEntryById('fireworks')?.accent).toBe('amber');
    expect(getCatalogEntryById('mistral')?.accent).toBe('amber');
    expect(getCatalogEntryById('ollama')?.accent).toBe('teal');
    expect(getCatalogEntryById('lm-studio')?.accent).toBe('cyan');
    expect(getCatalogEntryById('custom')?.accent).toBe('zinc');
  });

  it('assigns the spec monograms per provider', () => {
    expect(getCatalogEntryById('openrouter')?.monogram).toBe('OR');
    expect(getCatalogEntryById('nvidia-nim')?.monogram).toBe('NV');
    expect(getCatalogEntryById('groq')?.monogram).toBe('GQ');
    expect(getCatalogEntryById('together')?.monogram).toBe('TG');
    expect(getCatalogEntryById('fireworks')?.monogram).toBe('FW');
    expect(getCatalogEntryById('mistral')?.monogram).toBe('MI');
    expect(getCatalogEntryById('ollama')?.monogram).toBe('OL');
    expect(getCatalogEntryById('lm-studio')?.monogram).toBe('LM');
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

  it('falls back to zinc + first letter for an unknown URL', () => {
    const id = resolveProviderIdentity('My Provider', undefined, 'https://api.unknown.com/v1');
    expect(id.accent).toBe('zinc');
    expect(id.monogram).toBe('M');
  });

  it('falls back to zinc + first letter for an empty URL', () => {
    const id = resolveProviderIdentity('Acme', undefined, '');
    expect(id.accent).toBe('zinc');
    expect(id.monogram).toBe('A');
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

  it('matches a known catalog URL exactly', () => {
    expect(inferCatalogId('https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(inferCatalogId('https://api.groq.com/openai/v1')).toBe('groq');
  });

  it('normalizes a trailing slash before matching', () => {
    expect(inferCatalogId('https://openrouter.ai/api/v1/')).toBe('openrouter');
  });

  it('returns custom for an unknown URL', () => {
    expect(inferCatalogId('https://api.unknown.com/v1')).toBe('custom');
  });
});