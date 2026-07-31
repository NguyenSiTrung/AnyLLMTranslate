/**
 * Static catalog of popular OpenAI-compatible API providers.
 * Catalog IDs are not stored in ProviderPreset — selection keeps preset: 'custom'.
 */

/**
 * The accent-color union used for provider identity badges. Mirrors the
 * `AccentColor` union in `ui/SectionHeader.tsx` — the two MUST stay in sync
 * (intentionally duplicated so this `lib/` module stays free of UI imports).
 */
export type ProviderAccent = 'blue' | 'pink' | 'emerald' | 'amber' | 'zinc' | 'teal' | 'cyan' | 'orange';

/**
 * Catalog category for the AddProviderModal grouping (FR-7).
 * - `cloud`  — hosted commercial APIs (OpenRouter, NVIDIA, Groq, Together, Fireworks, Mistral, Google AI Studio)
 * - `local`  — self-hosted / localhost runtimes (Ollama, LM Studio)
 * - `custom` — user-defined endpoint
 */
export type CatalogCategory = 'cloud' | 'local' | 'custom';

export interface OpenAiCompatibleCatalogEntry {
  id: string;
  displayName: string;
  keywords: string[];
  baseUrl: string;
  requiresApiKey: boolean;
  placeholder?: string;
  defaultModel?: string;
  supportsModelListing: boolean;
  /** URL to obtain or manage API keys for this provider (omitted for keyless). */
  getKeyUrl?: string;
  /** Accent color for the identity badge (FR-2). Falls back to `zinc`. */
  accent?: ProviderAccent;
  /** 1–3 character monogram for the identity badge (FR-2). Falls back to the
   *  first letter of `displayName`, or a gear for the `custom` entry. */
  monogram?: string;
  /** Category for the AddProviderModal grouping (FR-7). Defaults to `cloud`. */
  category?: CatalogCategory;
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
    getKeyUrl: 'https://openrouter.ai/keys',
    accent: 'zinc',
    monogram: 'OR',
    category: 'cloud',
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
    getKeyUrl: 'https://build.nvidia.com/models/api-key',
    accent: 'emerald',
    monogram: 'NV',
    category: 'cloud',
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
    getKeyUrl: 'https://console.groq.com/keys',
    accent: 'orange',
    monogram: 'GQ',
    category: 'cloud',
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
    getKeyUrl: 'https://api.together.xyz/settings/api-keys',
    accent: 'pink',
    monogram: 'TG',
    category: 'cloud',
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
    getKeyUrl: 'https://fireworks.ai/api-keys',
    accent: 'amber',
    monogram: 'FW',
    category: 'cloud',
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
    getKeyUrl: 'https://console.mistral.ai/api-keys/',
    accent: 'amber',
    monogram: 'MI',
    category: 'cloud',
  },
  {
    id: 'google-ai-studio',
    displayName: 'Google AI Studio (Gemini)',
    keywords: [
      'google',
      'gemini',
      'ai studio',
      'aistudio',
      'generativelanguage',
      'google ai',
    ],
    // Official OpenAI-compatible endpoint (chat/completions + models).
    // Trailing slash stripped by callers; path must end with /openai.
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresApiKey: true,
    placeholder: 'AIza...',
    // Flash is a good default for translation latency; 3.x also works.
    defaultModel: 'gemini-2.5-flash',
    supportsModelListing: true,
    getKeyUrl: 'https://aistudio.google.com/apikey',
    accent: 'blue',
    monogram: 'G',
    category: 'cloud',
  },
  {
    id: 'opencode-zen',
    displayName: 'OpenCode Zen',
    keywords: ['opencode', 'zen', 'opencode.ai', 'opencode zen'],
    // OpenAI-compatible chat/completions + models gateway.
    // Callers append /chat/completions and /models.
    baseUrl: 'https://opencode.ai/zen/v1',
    requiresApiKey: true,
    placeholder: '...',
    // Fast free-tier default suited to translation latency.
    defaultModel: 'deepseek-v4-flash-free',
    supportsModelListing: true,
    getKeyUrl: 'https://opencode.ai/auth',
    accent: 'teal',
    monogram: 'OZ',
    category: 'cloud',
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek Official',
    keywords: ['deepseek', 'deep seek', 'api.deepseek'],
    // Official OpenAI-compatible base (docs use https://api.deepseek.com +
    // /chat/completions). /v1 is also accepted by DeepSeek as an alias.
    baseUrl: 'https://api.deepseek.com',
    requiresApiKey: true,
    placeholder: 'sk-...',
    // Flash is the latency-friendly default for translation.
    defaultModel: 'deepseek-v4-flash',
    supportsModelListing: true,
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
    accent: 'cyan',
    monogram: 'DS',
    category: 'cloud',
  },
  {
    id: 'ollama',
    displayName: 'Ollama',
    keywords: ['ollama', 'local', 'localhost'],
    baseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    defaultModel: 'llama3.2',
    supportsModelListing: true,
    accent: 'teal',
    monogram: 'OL',
    category: 'local',
  },
  {
    id: 'lm-studio',
    displayName: 'LM Studio',
    keywords: ['lm studio', 'lmstudio', 'local'],
    baseUrl: 'http://localhost:1234/v1',
    requiresApiKey: false,
    defaultModel: '',
    supportsModelListing: true,
    accent: 'cyan',
    monogram: 'LM',
    category: 'local',
  },
  {
    id: 'custom',
    displayName: 'Custom endpoint',
    keywords: ['custom', 'other', 'vllm', 'litellm'],
    baseUrl: '',
    requiresApiKey: false,
    supportsModelListing: true,
    accent: 'zinc',
    monogram: '⚙',
    category: 'custom',
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

/**
 * Group a (possibly filtered) set of catalog entries by category for the
 * AddProviderModal (FR-7). Returns categories in display order
 * (`cloud`, `local`, `custom`) and omits empty groups. Entries with no
 * explicit category default to `cloud`.
 */
export function groupByCategory(
  entries: OpenAiCompatibleCatalogEntry[] = OPENAI_COMPATIBLE_CATALOG,
): { category: CatalogCategory; entries: OpenAiCompatibleCatalogEntry[] }[] {
  const buckets: Record<CatalogCategory, OpenAiCompatibleCatalogEntry[]> = {
    cloud: [],
    local: [],
    custom: [],
  };
  for (const entry of entries) {
    const cat = entry.category ?? 'cloud';
    buckets[cat].push(entry);
  }
  return (['cloud', 'local', 'custom'] as const)
    .map((category) => ({ category, entries: buckets[category] }))
    .filter((g) => g.entries.length > 0);
}

export function getCatalogEntryById(id: string): OpenAiCompatibleCatalogEntry | undefined {
  return OPENAI_COMPATIBLE_CATALOG.find((e) => e.id === id);
}

/**
 * Resolve the identity badge metadata (accent + monogram) for a provider,
 * implementing the FR-2 fallback chain:
 *   1. the catalog entry for `catalogId` (when explicitly set — including
 *      `custom`, which has its own gear monogram)
 *   2. the catalog entry inferred from `baseUrl` (via {@link inferCatalogId}),
 *      but ONLY when the inference matched a real provider — `inferCatalogId`
 *      returns `'custom'` as a default sentinel, which is NOT treated as a
 *      match here (an unknown URL should not get the custom-template gear)
 *   3. zinc accent + first letter of `displayName`
 *
 * The monogram falls back to the first letter of `displayName` when the
 * resolved entry has none. Pure/dependency-free.
 */
export function resolveProviderIdentity(
  displayName: string,
  catalogId: string | undefined,
  baseUrl: string,
): { accent: ProviderAccent; monogram: string } {
  /** First letter of displayName (uppercased), or '?' when blank. */
  const monogramFallback = (): string => {
    const trimmed = displayName.trim();
    return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?';
  };
  // Step 1: an explicitly-set catalogId always wins (including 'custom').
  if (catalogId) {
    const entry = getCatalogEntryById(catalogId);
    if (entry) {
      return { accent: entry.accent ?? 'zinc', monogram: entry.monogram ?? monogramFallback() };
    }
  }
  // Step 2: infer from the base URL, but only accept a real (non-custom) match.
  const inferred = inferCatalogId(baseUrl);
  if (inferred !== 'custom') {
    const entry = getCatalogEntryById(inferred);
    if (entry) {
      return { accent: entry.accent ?? 'zinc', monogram: entry.monogram ?? monogramFallback() };
    }
  }
  // Step 3: zinc + first letter of displayName.
  return { accent: 'zinc', monogram: monogramFallback() };
}

/**
 * Infer a catalog id from a base URL by exact host+path match. Returns
 * `'custom'` when the URL is empty or matches no entry. Canonical inference
 * shared by the catalog picker, model picker, key row, and identity badge.
 */
export function inferCatalogId(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) return 'custom';
  for (const e of OPENAI_COMPATIBLE_CATALOG) {
    const entryUrl = e.baseUrl.trim().replace(/\/+$/, '');
    if (entryUrl && entryUrl === normalized) return e.id;
  }
  return 'custom';
}

/**
 * Resolve the "Get API key" URL for a provider by matching its base URL
 * against the catalog. Returns `undefined` for unknown or keyless providers
 * (Ollama, LM Studio, Custom).
 */
export function getKeyUrlForProvider(baseUrl: string): string | undefined {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) return undefined;
  for (const entry of OPENAI_COMPATIBLE_CATALOG) {
    if (!entry.getKeyUrl) continue;
    const entryUrl = entry.baseUrl.replace(/\/+$/, '');
    if (entryUrl && (normalized === entryUrl || normalized.startsWith(entryUrl + '/'))) {
      return entry.getKeyUrl;
    }
  }
  return undefined;
}