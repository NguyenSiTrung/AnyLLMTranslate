/**
 * Static catalog of popular OpenAI-compatible API providers.
 * Catalog IDs are not stored in ProviderPreset — selection keeps preset: 'custom'.
 */

export interface OpenAiCompatibleCatalogEntry {
  id: string;
  displayName: string;
  keywords: string[];
  baseUrl: string;
  requiresApiKey: boolean;
  placeholder?: string;
  defaultModel?: string;
  supportsModelListing: boolean;
}

export const OPENAI_COMPATIBLE_CATALOG: OpenAiCompatibleCatalogEntry[] = [
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    keywords: ['openrouter', 'router', 'aggregator'],
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    placeholder: 'sk-or-...',
    defaultModel: 'openai/gpt-4o-mini',
    supportsModelListing: true,
  },
  {
    id: 'nvidia-nim',
    displayName: 'NVIDIA NIM',
    keywords: ['nvidia', 'nim', 'build.nvidia'],
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    requiresApiKey: true,
    placeholder: 'nvapi-...',
    defaultModel: 'meta/llama-3.1-8b-instruct',
    supportsModelListing: true,
  },
  {
    id: 'groq',
    displayName: 'Groq',
    keywords: ['groq', 'lpu'],
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    placeholder: 'gsk_...',
    defaultModel: 'llama-3.1-8b-instant',
    supportsModelListing: true,
  },
  {
    id: 'together',
    displayName: 'Together AI',
    keywords: ['together', 'together.ai'],
    baseUrl: 'https://api.together.xyz/v1',
    requiresApiKey: true,
    placeholder: '...',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    supportsModelListing: true,
  },
  {
    id: 'fireworks',
    displayName: 'Fireworks AI',
    keywords: ['fireworks', 'fireworks.ai'],
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    requiresApiKey: true,
    placeholder: 'fw_...',
    defaultModel: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    supportsModelListing: true,
  },
  {
    id: 'mistral',
    displayName: 'Mistral AI',
    keywords: ['mistral', 'la plateforme'],
    baseUrl: 'https://api.mistral.ai/v1',
    requiresApiKey: true,
    placeholder: '...',
    defaultModel: 'mistral-small-latest',
    supportsModelListing: true,
  },
  {
    id: 'ollama',
    displayName: 'Ollama',
    keywords: ['ollama', 'local', 'localhost'],
    baseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    defaultModel: 'llama3.2',
    supportsModelListing: true,
  },
  {
    id: 'lm-studio',
    displayName: 'LM Studio',
    keywords: ['lm studio', 'lmstudio', 'local'],
    baseUrl: 'http://localhost:1234/v1',
    requiresApiKey: false,
    defaultModel: '',
    supportsModelListing: true,
  },
  {
    id: 'custom',
    displayName: 'Custom endpoint',
    keywords: ['custom', 'other', 'vllm', 'litellm'],
    baseUrl: '',
    requiresApiKey: false,
    supportsModelListing: true,
  },
];

/** Case-insensitive search across display name, id, and keywords. */
export function filterCatalog(
  query: string,
  entries: OpenAiCompatibleCatalogEntry[] = OPENAI_COMPATIBLE_CATALOG,
): OpenAiCompatibleCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter((entry) => {
    if (entry.displayName.toLowerCase().includes(q)) return true;
    if (entry.id.toLowerCase().includes(q)) return true;
    return entry.keywords.some((kw) => kw.toLowerCase().includes(q));
  });
}

export function getCatalogEntryById(id: string): OpenAiCompatibleCatalogEntry | undefined {
  return OPENAI_COMPATIBLE_CATALOG.find((e) => e.id === id);
}