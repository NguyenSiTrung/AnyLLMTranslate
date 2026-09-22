import { describe, expect, it } from 'vitest';
import {
  parseModelsListResponse,
  filterModelIds,
  buildModelsListUrl,
  MAX_MODEL_LIST_PAGES,
} from '@/lib/modelListing';
import {
  OPENAI_COMPATIBLE_CATALOG,
  filterCatalog,
  getCatalogEntryById,
  getKeyUrlForProvider,
  groupByCategory,
  inferCatalogId,
  resolveProviderIdentity,
} from '@/lib/openAiCompatibleCatalog';
import {
  isGoogleAiStudioProvider,
  resolveProviderModels,
  isMultiModelActive,
  resolveModelStrategy,
  normalizeGoogleModels,
  makeSlotId,
} from '@/lib/googleMultiModel';
import type { PoolProvider } from '@/types/config';

/**
 * Tests for OpenAI-compatible model list parsing, filtering, and pagination URL helpers.
 */


describe('modelListing / openAiCompatibleCatalog', () => {
  it('parses model lists/pagination URLs and lists/filters providers with identity/category groups', () => {
    // facet: parses model lists, filters ids, and builds pagination URLs
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

    // filterModelIds and buildModelsListUrl
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

    // facet: lists/filters providers, resolves key URLs, identity fallbacks,
    // category groups, and includes the OpenCode Go entry
    const ids = OPENAI_COMPATIBLE_CATALOG.map((e) => e.id);
    expect(ids).toContain('openrouter');
    expect(ids).toContain('ollama');
    expect(ids).toContain('groq');
    expect(ids).toContain('google-ai-studio');
    expect(ids).toContain('opencode-zen');
    expect(ids).toContain('deepseek');
    expect(ids).toContain('opencode-go');
    expect(ids).toContain('nous-portal');
    expect(getCatalogEntryById('openrouter')?.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(getCatalogEntryById('openrouter')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('google-ai-studio')?.baseUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai',
    );
    expect(getCatalogEntryById('google-ai-studio')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('google-ai-studio')?.getKeyUrl).toBe(
      'https://aistudio.google.com/apikey',
    );
    expect(getCatalogEntryById('opencode-zen')?.baseUrl).toBe('https://opencode.ai/zen/v1');
    expect(getCatalogEntryById('opencode-zen')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('opencode-zen')?.getKeyUrl).toBe('https://opencode.ai/auth');
    expect(getCatalogEntryById('opencode-zen')?.defaultModel).toBe('deepseek-v4-flash-free');
    expect(getCatalogEntryById('deepseek')?.baseUrl).toBe('https://api.deepseek.com');
    expect(getCatalogEntryById('deepseek')?.requiresApiKey).toBe(true);
    expect(getCatalogEntryById('deepseek')?.getKeyUrl).toBe(
      'https://platform.deepseek.com/api_keys',
    );
    expect(getCatalogEntryById('deepseek')?.defaultModel).toBe('deepseek-v4-flash');
    expect(getCatalogEntryById('nous-portal')).toMatchObject({
      id: 'nous-portal',
      displayName: 'Nous Portal',
      baseUrl: 'https://inference-api.nousresearch.com/v1',
      requiresApiKey: true,
      defaultModel: 'Hermes-4-70B',
      getKeyUrl: 'https://portal.nousresearch.com/api-keys',
      supportsModelListing: true,
      category: 'cloud',
    });
    expect(filterCatalog('gemini').some((e) => e.id === 'google-ai-studio')).toBe(true);
    expect(filterCatalog('opencode').some((e) => e.id === 'opencode-zen')).toBe(true);
    expect(filterCatalog('deepseek').some((e) => e.id === 'deepseek')).toBe(true);
    expect(filterCatalog('nous').map((provider) => provider.id)).toContain('nous-portal');
    expect(getKeyUrlForProvider('https://generativelanguage.googleapis.com/v1beta/openai')).toBe(
      'https://aistudio.google.com/apikey',
    );
    expect(getKeyUrlForProvider('https://opencode.ai/zen/v1')).toBe('https://opencode.ai/auth');
    expect(getKeyUrlForProvider('https://api.deepseek.com')).toBe(
      'https://platform.deepseek.com/api_keys',
    );
    expect(getKeyUrlForProvider('https://inference-api.nousresearch.com/v1')).toBe(
      'https://portal.nousresearch.com/api-keys',
    );
    expect(inferCatalogId('https://generativelanguage.googleapis.com/v1beta/openai/')).toBe(
      'google-ai-studio',
    );
    expect(inferCatalogId('https://opencode.ai/zen/v1/')).toBe('opencode-zen');
    expect(inferCatalogId('https://api.deepseek.com/')).toBe('deepseek');
    expect(inferCatalogId('https://inference-api.nousresearch.com/v1/')).toBe('nous-portal');

    expect(filterCatalog('')).toHaveLength(OPENAI_COMPATIBLE_CATALOG.length);
    expect(filterCatalog('router').some((e) => e.id === 'openrouter')).toBe(true);
    expect(filterCatalog('GROQ')).toHaveLength(1);

    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/keys');
    expect(getKeyUrlForProvider('https://openrouter.ai/api/v1/')).toBe('https://openrouter.ai/keys');
    expect(getKeyUrlForProvider('http://localhost:11434/v1')).toBeUndefined();
    expect(getKeyUrlForProvider('')).toBeUndefined();

    // Identity fallback chain and category grouping
    expect(resolveProviderIdentity('Whatever', 'groq', 'https://example.com').monogram).toBe('GQ');
    expect(
      resolveProviderIdentity('Whatever', 'custom', 'https://api.groq.com/openai/v1').monogram,
    ).toBe('⚙');
    expect(
      resolveProviderIdentity('Whatever', undefined, 'http://localhost:11434/v1').monogram,
    ).toBe('OL');
    expect(
      resolveProviderIdentity('My Provider', undefined, 'https://api.unknown.com/v1').monogram,
    ).toBe('M');
    expect(resolveProviderIdentity('  ', undefined, '').monogram).toBe('?');

    expect(inferCatalogId('')).toBe('custom');
    expect(inferCatalogId('https://openrouter.ai/api/v1/')).toBe('openrouter');
    expect(inferCatalogId('https://api.unknown.com/v1')).toBe('custom');

    const groups = groupByCategory();
    expect(groups.map((g) => g.category)).toEqual(['cloud', 'local', 'custom']);
    expect(groups.find((g) => g.category === 'local')?.entries.map((e) => e.id)).toEqual([
      'ollama',
      'lm-studio',
      'cherry-studio',
    ]);
    const filtered = groupByCategory(filterCatalog('ollama'));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.category).toBe('local');

    // OpenCode Go entry: metadata, filtering, and URL inference.
    const entry = getCatalogEntryById('opencode-go');
    expect(entry).toMatchObject({
      id: 'opencode-go',
      displayName: 'OpenCode Go',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      requiresApiKey: true,
      getKeyUrl: 'https://opencode.ai/auth',
      defaultModel: 'deepseek-v4-flash',
      supportsModelListing: true,
      category: 'cloud',
      monogram: 'OG',
    });
    expect(filterCatalog('go').map((provider) => provider.id)).toContain('opencode-go');
    expect(filterCatalog('opencode')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'opencode-zen' }),
        expect.objectContaining({ id: 'opencode-go' }),
      ]),
    );
    expect(inferCatalogId('https://opencode.ai/zen/go/v1/')).toBe('opencode-go');
    expect(getKeyUrlForProvider('https://opencode.ai/zen/go/v1')).toBe(
      'https://opencode.ai/auth',
    );
    expect(getCatalogEntryById('opencode-zen')?.baseUrl).toBe(
      'https://opencode.ai/zen/v1',
    );

    // Cherry Studio entry: metadata, filtering, and URL inference.
    expect(getCatalogEntryById('cherry-studio')).toMatchObject({
      id: 'cherry-studio',
      displayName: 'Cherry Studio',
      baseUrl: 'http://127.0.0.1:23333/v1',
      requiresApiKey: true,
      placeholder: 'cs-sk-...',
      supportsModelListing: true,
      category: 'local',
      monogram: 'CS',
    });
    expect(getCatalogEntryById('cherry-studio')?.getKeyUrl).toBeUndefined();
    expect(filterCatalog('cherry').map((provider) => provider.id)).toContain('cherry-studio');
    expect(inferCatalogId('http://127.0.0.1:23333/v1/')).toBe('cherry-studio');
    expect(getKeyUrlForProvider('http://127.0.0.1:23333/v1')).toBeUndefined();
    expect(
      resolveProviderIdentity('Whatever', undefined, 'http://127.0.0.1:23333/v1').monogram,
    ).toBe('CS');
  });
});

function google(overrides: Partial<PoolProvider> = {}): PoolProvider {
  return {
    id: 'g1',
    displayName: 'Google AI Studio (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    catalogId: 'google-ai-studio',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
    ...overrides,
  };
}

function openrouter(): PoolProvider {
  return {
    id: 'or1',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    catalogId: 'openrouter',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    enabled: true,
    keys: [],
  };
}

describe('Google AI Studio model helpers', () => {
  it('detects providers, resolves models, normalizes strategies, and builds slot ids', () => {
    expect(isGoogleAiStudioProvider(google())).toBe(true);
    expect(
      isGoogleAiStudioProvider(
        google({
          catalogId: undefined,
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        }),
      ),
    ).toBe(true);
    expect(isGoogleAiStudioProvider(openrouter())).toBe(false);

    expect(resolveProviderModels(google())).toEqual(['gemini-2.5-flash']);
    expect(isMultiModelActive(google())).toBe(false);

    // Must not return [] — empty list would skip the provider in resolveSlots
    // and surface "pool is empty" for DEFAULT_SETTINGS (model: '').
    expect(resolveProviderModels({ baseUrl: '', model: '' })).toEqual(['']);
    expect(resolveProviderModels(google({ model: '', models: undefined }))).toEqual(['']);
    expect(isMultiModelActive(google({ model: '', models: undefined }))).toBe(false);

    // Multi-model: ordered unique models.
    const p = google({
      model: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'],
    });
    expect(resolveProviderModels(p)).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ]);
    expect(isMultiModelActive(p)).toBe(true);
    const multi = google({
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    });
    expect(resolveModelStrategy(multi)).toBe('preferred_failover');
    expect(resolveModelStrategy({ ...multi, modelStrategy: 'round_robin' })).toBe(
      'round_robin',
    );
    expect(resolveModelStrategy(google({ modelStrategy: 'round_robin' }))).toBe(
      'preferred_failover',
    );

    const n = normalizeGoogleModels(
      google({
        model: 'old',
        models: ['  gemini-2.5-flash  ', 'gemini-2.5-flash-lite', ''],
      }),
    );
    expect(n.model).toBe('gemini-2.5-flash');
    expect(n.models).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);

    const stripped = normalizeGoogleModels({
      ...openrouter(),
      models: ['a', 'b'],
      modelStrategy: 'round_robin',
    });
    expect(stripped.models).toBeUndefined();
    expect(stripped.modelStrategy).toBeUndefined();

    expect(makeSlotId('k1', 'm', false)).toBe('k1');
    expect(makeSlotId('k1', 'gemini-2.5-flash', true)).toBe('k1::gemini-2.5-flash');
  });
});
