# TTS Hybrid Credentials UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded OpenAI-only TTS model/voice dropdowns with hybrid credentials (pool provider pick or custom TTS endpoint full override), free-text model + Load models, and a conditional voice field that is omitted from the speech request when empty.

**Architecture:** Extend `TtsSettings` and pure resolvers in `lib/tts/`. Options Advanced Speech UI reads pool providers and resolves credentials the same way background `SYNTHESIZE_SPEECH` does. Custom source fully overrides pool. Provider TTS body only includes `voice` when non-empty. Load models reuses `listProviderModels` against the resolved TTS base URL + key.

**Tech Stack:** TypeScript, Vitest, React (Options), existing `listProviderModels` / `Input` / `Select` / `Toggle` UI primitives, chrome.storage settings via zustand `settingsStore`.

**Spec:** `docs/superpowers/specs/2026-07-29-tts-hybrid-credentials-ux-design.md`  
**Beads:** AnyLLMTranslate-70c

## Global Constraints

- Custom TTS credentials **fully override** pool when `credentialSource === 'custom'` and `customBaseUrl` is non-empty; never mix custom base URL with pool API key.
- Invalid explicit `poolProviderId` (missing/disabled) → credentials `null` (no silent swap to another provider).
- Empty `poolProviderId` with source `pool` → first usable enabled pool provider (backward compatible).
- Empty `voice` → omit `voice` from TTS JSON body.
- New defaults: `model: ''`, `voice: ''`; existing stored values must not be wiped by merge.
- Mistral Voxtral / non-OpenAI speech APIs are out of scope; OpenAI-compatible `POST …/audio/speech` only.
- API keys must not enter content-script Speak paths (background only for synthesize).
- Do not use TodoWrite; use beads (`bd`) for task tracking.
- Prefer TDD: failing test → implement → pass → commit per task.

## File map

| File | Role |
|------|------|
| `types/config.ts` | Extend `TtsSettings`, defaults; optional OpenAI voice suggestions constant |
| `lib/tts/resolveTtsBackend.ts` | Hybrid `pickTtsCredentials` / `hasProviderTtsCredentials`; host + voice-field helpers |
| `lib/tts/providerTts.ts` | Conditional `voice`; empty-model error |
| `lib/__tests__/ttsResolve.test.ts` | Resolver + host tests |
| `lib/__tests__/providerTts.test.ts` | Body shape tests |
| `entrypoints/options/sections/AdvancedSection.tsx` | `TtsSettingsGroup` UI rewrite |
| `services/background.ts` | Unchanged call shape if `pickTtsCredentials` stays API-compatible |
| `content/selectionBubble/speak.ts` | No change if `hasProviderTtsCredentials` / merge stay compatible |

---

### Task 1: Extend `TtsSettings` types and defaults

**Files:**
- Modify: `types/config.ts` (TtsSettings block ~301–349)
- Test: `lib/__tests__/ttsResolve.test.ts` (merge defaults assertions in Task 2; this task only types + defaults)

**Interfaces:**
- Produces:
  - `TtsCredentialSource = 'pool' | 'custom'`
  - `TtsSettings` fields: existing + `credentialSource`, `poolProviderId`, `customBaseUrl`, `customApiKey`, `showVoiceField`
  - `DEFAULT_TTS_SETTINGS` with empty model/voice and pool defaults
  - `OPENAI_TTS_VOICE_SUGGESTIONS` (optional datalist); remove sole reliance on `TTS_MODEL_OPTIONS` / `TTS_VOICE_OPTIONS` (keep temporarily re-exported as suggestions or delete if unused after UI task)

- [ ] **Step 1: Update types and defaults in `types/config.ts`**

Replace the TTS block with:

```ts
export type TtsPreferredBackend = 'auto' | 'browser' | 'provider';

/** Where Speak gets OpenAI-compatible TTS base URL + API key. */
export type TtsCredentialSource = 'pool' | 'custom';

export interface TtsSettings {
  /** Master switch for Speak (default true). */
  enabled: boolean;
  /**
   * auto = provider when TTS credentials resolve, else browser;
   * browser = always local speechSynthesis;
   * provider = try OpenAI-compatible TTS, fail-open to browser.
   */
  preferredBackend: TtsPreferredBackend;
  /** Free-text TTS model id. Empty = unset. */
  model: string;
  /**
   * Optional voice id. Empty = omit from provider request body.
   * May remain stored while the voice field is hidden in UI.
   */
  voice: string;
  /** Playback rate 0.5–2 (browser utterance rate; provider `speed` when supported). */
  rate: number;
  /** pool (default) | custom full override for Speak only. */
  credentialSource: TtsCredentialSource;
  /**
   * PoolProvider.id when credentialSource === 'pool'.
   * Empty = first usable enabled provider (migration / default).
   */
  poolProviderId: string;
  /** Used only when credentialSource === 'custom'. */
  customBaseUrl: string;
  customApiKey: string;
  /** User forced the voice field visible for non-OpenAI-style hosts. */
  showVoiceField: boolean;
}

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  enabled: true,
  preferredBackend: 'auto',
  model: '',
  voice: '',
  rate: 1,
  credentialSource: 'pool',
  poolProviderId: '',
  customBaseUrl: '',
  customApiKey: '',
  showVoiceField: false,
};

/** Suggestion-only OpenAI voices for datalist when voice field is shown. */
export const OPENAI_TTS_VOICE_SUGGESTIONS = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
] as const;

/** @deprecated Use free-text model + Load models. Kept briefly for any stray imports. */
export const TTS_VOICE_OPTIONS = OPENAI_TTS_VOICE_SUGGESTIONS;

/** @deprecated Use free-text model + Load models. */
export const TTS_MODEL_OPTIONS = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] as const;
```

Ensure `ExtensionSettings.tts` and `DEFAULT_SETTINGS.tts` still spread `DEFAULT_TTS_SETTINGS`.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -40`  
Expected: errors only in files still assuming old required dropdown-only usage or old default `tts-1` in tests (fix in later tasks). If AdvancedSection still imports and compiles, fine.

- [ ] **Step 3: Commit**

```bash
git add types/config.ts
git commit -m "feat(tts): extend TtsSettings for hybrid credentials"
```

---

### Task 2: Hybrid credential resolution + host helpers (TDD)

**Files:**
- Modify: `lib/tts/resolveTtsBackend.ts`
- Test: `lib/__tests__/ttsResolve.test.ts`

**Interfaces:**
- Consumes: `TtsSettings`, `ExtensionSettings`, `PoolProvider` from `@/types/config`
- Produces (keep existing names where possible):
  - `mergeTtsSettings(partial?): TtsSettings` — deep-merge new fields from defaults
  - `pickTtsCredentials(settings): TtsCredentialPick | null` — hybrid rules
  - `hasProviderTtsCredentials(settings): boolean` — `pickTtsCredentials !== null`
  - `isOpenAiStyleTtsHost(baseUrl: string): boolean`
  - `shouldOfferVoiceField(tts: TtsSettings, baseUrl: string): boolean`
  - `TtsCredentialPick` unchanged shape: `{ baseUrl, apiKey, model, voice, rate }`
  - `resolveTtsBackend`, `clampRate`, `speechEndpointFromBaseUrl` unchanged behavior

**Resolution rules (implement exactly):**

1. `mergeTtsSettings` → `{ ...DEFAULT_TTS_SETTINGS, ...partial }`
2. If `tts.credentialSource === 'custom'`:
   - empty `customBaseUrl.trim()` → `null`
   - else return pick from custom base (strip trailing `/`), `customApiKey`, tts model/voice/rate
3. If source is `pool` (default):
   - If `poolProviderId` non-empty: find provider with that id; if missing or `!enabled` → `null`
   - If id empty: iterate `settings.providers` for first enabled with baseUrl + usable key (same as today)
   - Usable key: enabled key; if `requiresApiKey`, key must be non-empty
   - Legacy `settings.provider` only when pool yields nothing **and** `poolProviderId` is empty (do not use legacy when explicit id was invalid)
4. `isOpenAiStyleTtsHost`: parse URL hostname (try/catch); true if `api.openai.com`, ends with `.openai.com`, or ends with `.openai.azure.com`
5. `shouldOfferVoiceField(tts, baseUrl)`: `tts.showVoiceField === true` OR `isOpenAiStyleTtsHost(baseUrl)`

- [ ] **Step 1: Write failing tests** in `lib/__tests__/ttsResolve.test.ts`

Replace/extend the credentials describe block. Include helpers to build a pool provider:

```ts
import {
  resolveTtsBackend,
  hasProviderTtsCredentials,
  pickTtsCredentials,
  speechEndpointFromBaseUrl,
  clampRate,
  mergeTtsSettings,
  isOpenAiStyleTtsHost,
  shouldOfferVoiceField,
} from '@/lib/tts/resolveTtsBackend';
import type { ExtensionSettings, PoolProvider } from '@/types/config';
import { DEFAULT_SETTINGS, DEFAULT_TTS_SETTINGS } from '@/types/config';

function poolProvider(over: Partial<PoolProvider> & Pick<PoolProvider, 'id'>): PoolProvider {
  return {
    displayName: over.displayName ?? over.id,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    requiresApiKey: true,
    temperature: 0.3,
    maxTokens: 4096,
    requestTimeoutMs: 60000,
    thinkingMode: 'off',
    thinkingEffort: 'medium',
    enabled: true,
    keys: [
      {
        id: 'k1',
        apiKey: 'sk-test',
        maxRpm: 60,
        concurrencyLimit: 2,
        interval: 0,
        enabled: true,
      },
    ],
    ...over,
  };
}

function baseSettings(over: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return { ...DEFAULT_SETTINGS, ...over };
}

describe('pickTtsCredentials hybrid', () => {
  it('uses first usable pool provider when poolProviderId is empty', () => {
    const s = baseSettings({
      tts: { ...DEFAULT_TTS_SETTINGS, model: 'tts-1', voice: 'nova' },
      providers: [
        poolProvider({ id: 'p1', baseUrl: 'https://api.openai.com/v1' }),
        poolProvider({
          id: 'p2',
          baseUrl: 'https://other.example/v1',
          keys: [
            {
              id: 'k2',
              apiKey: 'sk-other',
              maxRpm: 0,
              concurrencyLimit: 1,
              interval: 0,
              enabled: true,
            },
          ],
        }),
      ],
    });
    const pick = pickTtsCredentials(s);
    expect(pick?.baseUrl).toBe('https://api.openai.com/v1');
    expect(pick?.apiKey).toBe('sk-test');
    expect(pick?.model).toBe('tts-1');
    expect(pick?.voice).toBe('nova');
  });

  it('uses explicit poolProviderId', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'pool',
        poolProviderId: 'p2',
        model: 'my-tts',
      },
      providers: [
        poolProvider({ id: 'p1' }),
        poolProvider({
          id: 'p2',
          baseUrl: 'https://tts.example/v1',
          keys: [
            {
              id: 'k2',
              apiKey: 'sk-p2',
              maxRpm: 0,
              concurrencyLimit: 1,
              interval: 0,
              enabled: true,
            },
          ],
        }),
      ],
    });
    const pick = pickTtsCredentials(s);
    expect(pick?.baseUrl).toBe('https://tts.example/v1');
    expect(pick?.apiKey).toBe('sk-p2');
    expect(pick?.model).toBe('my-tts');
  });

  it('returns null when explicit poolProviderId is missing or disabled', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'pool',
        poolProviderId: 'gone',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    expect(pickTtsCredentials(s)).toBeNull();
    expect(hasProviderTtsCredentials(s)).toBe(false);

    const disabled = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        poolProviderId: 'p1',
      },
      providers: [poolProvider({ id: 'p1', enabled: false })],
    });
    expect(pickTtsCredentials(disabled)).toBeNull();
  });

  it('custom source fully overrides pool when base URL set', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'custom',
        customBaseUrl: 'https://custom-tts.example/v1',
        customApiKey: 'sk-custom',
        model: 'custom-model',
        voice: '',
        poolProviderId: 'p1',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    const pick = pickTtsCredentials(s);
    expect(pick?.baseUrl).toBe('https://custom-tts.example/v1');
    expect(pick?.apiKey).toBe('sk-custom');
    expect(pick?.model).toBe('custom-model');
    expect(pick?.voice).toBe('');
  });

  it('custom source with empty base URL returns null (does not fall back to pool)', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        credentialSource: 'custom',
        customBaseUrl: '  ',
        customApiKey: 'sk-custom',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    expect(pickTtsCredentials(s)).toBeNull();
  });
});

describe('isOpenAiStyleTtsHost / shouldOfferVoiceField', () => {
  it('detects OpenAI hosts only', () => {
    expect(isOpenAiStyleTtsHost('https://api.openai.com/v1')).toBe(true);
    expect(isOpenAiStyleTtsHost('https://east.openai.azure.com/openai/v1')).toBe(true);
    expect(isOpenAiStyleTtsHost('https://api.mistral.ai/v1')).toBe(false);
    expect(isOpenAiStyleTtsHost('not-a-url')).toBe(false);
  });

  it('offers voice for OpenAI host or showVoiceField', () => {
    expect(
      shouldOfferVoiceField(
        { ...DEFAULT_TTS_SETTINGS, showVoiceField: false },
        'https://api.openai.com/v1',
      ),
    ).toBe(true);
    expect(
      shouldOfferVoiceField(
        { ...DEFAULT_TTS_SETTINGS, showVoiceField: false },
        'https://api.mistral.ai/v1',
      ),
    ).toBe(false);
    expect(
      shouldOfferVoiceField(
        { ...DEFAULT_TTS_SETTINGS, showVoiceField: true },
        'https://api.mistral.ai/v1',
      ),
    ).toBe(true);
  });
});

describe('mergeTtsSettings', () => {
  it('fills new hybrid fields from defaults without wiping partials', () => {
    const m = mergeTtsSettings({ model: 'tts-1', voice: 'alloy' });
    expect(m.model).toBe('tts-1');
    expect(m.voice).toBe('alloy');
    expect(m.credentialSource).toBe('pool');
    expect(m.poolProviderId).toBe('');
    expect(m.showVoiceField).toBe(false);
  });
});
```

Keep existing `resolveTtsBackend`, `speechEndpointFromBaseUrl`, and `clampRate` tests; update any assertion that expected default model `tts-1` from merge without partial model to expect `''`.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm exec vitest run lib/__tests__/ttsResolve.test.ts`  
Expected: FAIL (missing exports / old first-only behavior / default model).

- [ ] **Step 3: Implement `lib/tts/resolveTtsBackend.ts`**

Full file target:

```ts
/**
 * Pure TTS backend resolution for selection Speak.
 */

import type { ExtensionSettings, PoolProvider, TtsSettings } from '@/types/config';
import { DEFAULT_TTS_SETTINGS } from '@/types/config';

export type ResolvedTtsBackend = 'browser' | 'provider' | 'disabled';

export function mergeTtsSettings(partial?: Partial<TtsSettings> | null): TtsSettings {
  return {
    ...DEFAULT_TTS_SETTINGS,
    ...(partial ?? {}),
  };
}

export interface TtsCredentialPick {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  rate: number;
}

function clampRate(rate: number | undefined): number {
  const n = typeof rate === 'number' && Number.isFinite(rate) ? rate : 1;
  return Math.min(2, Math.max(0.5, n));
}

export { clampRate };

function pickFromProvider(
  p: PoolProvider,
  tts: TtsSettings,
): TtsCredentialPick | null {
  const baseUrl = (p.baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!baseUrl) return null;
  const keys = (p.keys ?? []).filter((k) => k.enabled);
  for (const k of keys) {
    const apiKey = (k.apiKey ?? '').trim();
    if (p.requiresApiKey && !apiKey) continue;
    return {
      baseUrl,
      apiKey,
      model: (tts.model || '').trim(),
      voice: (tts.voice || '').trim(),
      rate: clampRate(tts.rate),
    };
  }
  return null;
}

/** OpenAI-compatible speech hosts that commonly expect a `voice` field. */
export function isOpenAiStyleTtsHost(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`)
      .hostname
      .toLowerCase();
    if (host === 'api.openai.com') return true;
    if (host === 'openai.com' || host.endsWith('.openai.com')) return true;
    if (host.endsWith('.openai.azure.com')) return true;
    return false;
  } catch {
    return false;
  }
}

export function shouldOfferVoiceField(tts: TtsSettings, baseUrl: string): boolean {
  if (tts.showVoiceField) return true;
  return isOpenAiStyleTtsHost(baseUrl);
}

/**
 * Hybrid credential pick: custom full override, else explicit/first pool provider.
 */
export function pickTtsCredentials(settings: ExtensionSettings): TtsCredentialPick | null {
  const tts = mergeTtsSettings(settings.tts);
  const model = (tts.model || '').trim();
  const voice = (tts.voice || '').trim();
  const rate = clampRate(tts.rate);

  if (tts.credentialSource === 'custom') {
    const baseUrl = (tts.customBaseUrl ?? '').trim().replace(/\/+$/, '');
    if (!baseUrl) return null;
    return {
      baseUrl,
      apiKey: (tts.customApiKey ?? '').trim(),
      model,
      voice,
      rate,
    };
  }

  const providers = settings.providers ?? [];
  const explicitId = (tts.poolProviderId ?? '').trim();

  if (explicitId) {
    const match = providers.find((p) => p.id === explicitId);
    if (!match || !match.enabled) return null;
    return pickFromProvider(match, tts);
  }

  for (const p of providers) {
    if (!p.enabled) continue;
    const picked = pickFromProvider(p, tts);
    if (picked) return picked;
  }

  // Legacy single provider only when no explicit pool id
  const legacy = settings.provider;
  const baseUrl = (legacy?.baseUrl ?? '').trim().replace(/\/+$/, '');
  if (baseUrl) {
    const apiKey = (legacy.apiKey ?? '').trim();
    if (!legacy.requiresApiKey || apiKey) {
      return { baseUrl, apiKey, model, voice, rate };
    }
  }

  return null;
}

export function hasProviderTtsCredentials(settings: ExtensionSettings): boolean {
  return pickTtsCredentials(settings) !== null;
}

export function resolveTtsBackend(
  tts: TtsSettings,
  providerAvailable: boolean,
): ResolvedTtsBackend {
  if (!tts.enabled) return 'disabled';
  switch (tts.preferredBackend) {
    case 'browser':
      return 'browser';
    case 'provider':
      return providerAvailable ? 'provider' : 'browser';
    case 'auto':
    default:
      return providerAvailable ? 'provider' : 'browser';
  }
}

/** OpenAI-compatible speech endpoint from a chat-completions base URL. */
export function speechEndpointFromBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/audio/speech')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/audio/speech`;
  return `${trimmed}/v1/audio/speech`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm exec vitest run lib/__tests__/ttsResolve.test.ts`  
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tts/resolveTtsBackend.ts lib/__tests__/ttsResolve.test.ts
git commit -m "feat(tts): hybrid pool/custom credential resolution"
```

---

### Task 3: Provider TTS body — omit empty voice; reject empty model (TDD)

**Files:**
- Modify: `lib/tts/providerTts.ts`
- Test: `lib/__tests__/providerTts.test.ts`

**Interfaces:**
- Consumes: `TtsCredentialPick` from `resolveTtsBackend`
- Produces: `fetchProviderSpeech` with updated body rules

- [ ] **Step 1: Add failing tests** to `lib/__tests__/providerTts.test.ts`

```ts
  it('omits voice from body when voice is empty', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1]).buffer, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );

    await fetchProviderSpeech(
      'Hello',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'tts-1',
        voice: '',
        rate: 1.2,
      },
      fetchImpl as unknown as typeof fetch,
    );

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('tts-1');
    expect(body.speed).toBe(1.2);
    expect(body).not.toHaveProperty('voice');
  });

  it('includes voice when non-empty', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1]).buffer, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );

    await fetchProviderSpeech(
      'Hello',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'tts-1',
        voice: 'alloy',
        rate: 1,
      },
      fetchImpl as unknown as typeof fetch,
    );

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string);
    expect(body.voice).toBe('alloy');
  });

  it('returns error when model is empty without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchProviderSpeech(
      'Hello',
      {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: '  ',
        voice: 'alloy',
        rate: 1,
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/model/i);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm exec vitest run lib/__tests__/providerTts.test.ts`  
Expected: FAIL on omit-voice and/or empty-model.

- [ ] **Step 3: Implement body changes in `fetchProviderSpeech`**

After empty-input check, add:

```ts
  const model = (creds.model ?? '').trim();
  if (!model) {
    return { success: false, error: 'TTS model is not set (Settings → Advanced → Speech)' };
  }

  const voice = (creds.voice ?? '').trim();

  const body: Record<string, unknown> = {
    model,
    input,
    speed: creds.rate,
    response_format: 'mp3',
  };
  if (voice) {
    body.voice = voice;
  }
```

Use `body` in `JSON.stringify(body)` instead of the old always-voice object.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm exec vitest run lib/__tests__/providerTts.test.ts`  
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tts/providerTts.ts lib/__tests__/providerTts.test.ts
git commit -m "fix(tts): omit empty voice and require model for provider speech"
```

---

### Task 4: Advanced Speech UI — hybrid credentials + free-text model/voice

**Files:**
- Modify: `entrypoints/options/sections/AdvancedSection.tsx` (`TtsSettingsGroup` ~122–270 and call site ~912–916)
- Optionally read for patterns: `entrypoints/options/components/ModelPicker.tsx`

**Interfaces:**
- Consumes:
  - `TtsSettings`, `DEFAULT_TTS_SETTINGS`, `OPENAI_TTS_VOICE_SUGGESTIONS`, `TtsCredentialSource`, `TtsPreferredBackend`
  - `pickTtsCredentials`, `shouldOfferVoiceField`, `mergeTtsSettings` from `@/lib/tts/resolveTtsBackend`
  - `listProviderModels` from `@/services/providerTester`
  - `useSettingsStore` providers list (pass `providers` into group or read store inside)
- Produces: updated `TtsSettingsGroup` writing full `TtsSettings` via `onChange`

- [ ] **Step 1: Change `TtsSettingsGroup` props to receive providers**

```tsx
function TtsSettingsGroup({
  tts,
  providers,
  onChange,
}: {
  tts: TtsSettings;
  providers: ExtensionSettings['providers'];
  onChange: (tts: TtsSettings) => void;
}) {
  const merged = mergeTtsSettings(tts);
  // ...
}
```

Call site:

```tsx
<TtsSettingsGroup
  tts={settings.tts ?? DEFAULT_TTS_SETTINGS}
  providers={settings.providers ?? []}
  onChange={(tts) => updateSettings({ tts })}
/>
```

- [ ] **Step 2: Implement credential source UI**

Inside the dimmed block (when enabled), after Backend select:

1. **Credential source** — two options via `Select` or radio-style buttons:
   - `pool` → "Use provider from pool"
   - `custom` → "Custom TTS endpoint"

2. **If pool:** `Select` of enabled providers:
   ```ts
   const enabledProviders = (providers ?? []).filter((p) => p.enabled);
   options = [
     { value: '', label: 'First available provider' },
     ...enabledProviders.map((p) => ({
       value: p.id,
       label: `${p.displayName || p.id} · ${p.baseUrl}`,
     })),
   ];
   ```
   Value = `merged.poolProviderId`.  
   If `poolProviderId` set but not in list, show warning text: “Selected TTS provider is missing or disabled.”

3. **If custom:**  
   - `Input` Base URL → `customBaseUrl`  
   - `Input` type password/text API key → `customApiKey`  
   - Helper description: “Fully overrides pool for Speak only. OpenAI-compatible POST /v1/audio/speech.”

- [ ] **Step 3: Model free-text + Load models**

```tsx
const [loadingModels, setLoadingModels] = useState(false);
const [modelChoices, setModelChoices] = useState<string[]>([]);
const [modelListError, setModelListError] = useState<string | null>(null);

// Resolve preview credentials for Load models (same pure helper as background)
const previewCreds = useMemo(() => {
  // Build a minimal settings snapshot for pickTtsCredentials
  return pickTtsCredentials({
    .../* need full ExtensionSettings — better pass settings or use local resolve */,
  } as ExtensionSettings);
}, [merged, providers]);
```

**Prefer:** pass full `settings: ExtensionSettings` into the group and call `pickTtsCredentials(settings)` after merging the in-progress `tts` override:

```ts
const previewSettings: ExtensionSettings = { ...settings, tts: merged };
const creds = pickTtsCredentials(previewSettings);
```

Load models button:

```ts
const handleLoadModels = async () => {
  const creds = pickTtsCredentials({ ...settings, tts: merged });
  if (!creds?.baseUrl) {
    showError('Configure a pool provider or custom TTS base URL first');
    return;
  }
  setLoadingModels(true);
  setModelListError(null);
  try {
    const result = await listProviderModels({
      baseUrl: creds.baseUrl,
      apiKey: creds.apiKey,
    });
    if (!result.success) {
      setModelChoices([]);
      setModelListError(result.error ?? 'Failed to list models');
      showError(result.error ?? 'Failed to list models');
      return;
    }
    setModelChoices(result.models);
    if (result.models.length === 0) {
      showError('No models returned');
    } else {
      showSuccess(`Loaded ${result.models.length} models`);
    }
  } finally {
    setLoadingModels(false);
  }
};
```

UI:

- `Input` id `tts-model` bound to `merged.model`
- Button “Load models” (disabled while loading or no base URL)
- If `modelChoices.length > 0`, show a scrollable button list or `<select>` of choices; on pick `patch({ model: id })`
- Optional: prefer showing TTS-ish ids first (`/tts|speech|audio|voice/i`) but still list all under the same list (no hard filter that hides models)

- [ ] **Step 4: Conditional voice field**

```ts
const voiceBaseUrl =
  pickTtsCredentials({ ...settings, tts: merged })?.baseUrl ?? merged.customBaseUrl;
const showVoice = shouldOfferVoiceField(merged, voiceBaseUrl || '');
```

- Checkbox/Toggle: “Show voice field” → `showVoiceField`
- When `showVoice`: `Input` for voice + optional `<datalist id="tts-voice-suggestions">` from `OPENAI_TTS_VOICE_SUGGESTIONS`
- When not shown: do not clear stored `voice` (keep for later)

- [ ] **Step 5: Fix imports**

Remove unused `TTS_MODEL_OPTIONS` / `TTS_VOICE_OPTIONS` Select-only usage. Import:

```ts
import {
  DEFAULT_TTS_SETTINGS,
  OPENAI_TTS_VOICE_SUGGESTIONS,
  type TtsCredentialSource,
  type TtsPreferredBackend,
  type TtsSettings,
  type ExtensionSettings,
} from '@/types/config';
import {
  mergeTtsSettings,
  pickTtsCredentials,
  shouldOfferVoiceField,
} from '@/lib/tts/resolveTtsBackend';
import { listProviderModels } from '@/services/providerTester';
```

- [ ] **Step 6: Update Test voice** to keep using `SYNTHESIZE_SPEECH` (background already uses `pickTtsCredentials`). Ensure settings are saved before test if store is live-updated on each patch (current pattern auto-saves via `updateSettings` — OK).

- [ ] **Step 7: Typecheck + focused tests**

```bash
pnpm exec tsc --noEmit 2>&1 | head -50
pnpm exec vitest run lib/__tests__/ttsResolve.test.ts lib/__tests__/providerTts.test.ts
```

Expected: no TS errors from this change; unit tests PASS.

- [ ] **Step 8: Commit**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx types/config.ts
git commit -m "feat(tts): Advanced Speech hybrid credentials and free-text model UI"
```

---

### Task 5: Wire-up verification + fix leftover defaults in tests

**Files:**
- Modify if needed: `lib/__tests__/ttsResolve.test.ts`, any test still expecting default `model: 'tts-1'`
- Grep: `tts-1` / `TTS_MODEL_OPTIONS` / `voice: 'alloy'` in tests
- Verify: `services/background.ts` `handleSynthesizeSpeech` still compiles (uses `pickTtsCredentials` — no API change)
- Verify: `content/selectionBubble/speak.ts` still uses `hasProviderTtsCredentials`

- [ ] **Step 1: Grep leftovers**

```bash
rg -n "TTS_MODEL_OPTIONS|TTS_VOICE_OPTIONS|DEFAULT_TTS_SETTINGS\.model|model: 'tts-1'" --glob '!docs/**' --glob '!node_modules/**' | head -40
```

Update any broken unit test expectations to new defaults or explicit stored values.

- [ ] **Step 2: Run broader tests**

```bash
pnpm exec vitest run lib/__tests__/ttsResolve.test.ts lib/__tests__/providerTts.test.ts content/__tests__/selectionBubble/speak.test.ts entrypoints/options/sections/__tests__/
pnpm exec tsc --noEmit
```

Expected: PASS / clean (or only pre-existing unrelated failures — do not expand scope).

- [ ] **Step 3: Manual checklist (document in commit body if useful)**

1. Options → Advanced → Speech → Enable on  
2. Credential source Pool → pick a provider → set model via Load models or type → Test voice  
3. Switch to Custom → other base URL + key → model → Test  
4. Non-OpenAI base → voice field hidden; enable Show voice field → appears  
5. Selection bubble Speak still fail-opens to browser on provider error  

- [ ] **Step 4: Commit any test fixes**

```bash
git add -A
git status
git commit -m "test(tts): align suites with hybrid TTS defaults"
```

(Skip empty commit if nothing left.)

- [ ] **Step 5: Close beads issue**

```bash
bd close AnyLLMTranslate-70c --reason="Hybrid TTS credentials UX implemented per spec 2026-07-29"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Pool provider pick | 2, 4 |
| Custom full override | 2, 4 |
| Free-text model + Load models | 4 (`listProviderModels`) |
| Conditional voice + omit empty voice | 2, 3, 4 |
| Defaults empty model/voice; merge preserves old | 1, 2 |
| Invalid explicit pool id → null | 2 |
| Background synthesize uses resolver | 2 (existing handler) |
| No Mistral Voxtral | out of scope |
| Tests for resolve + body | 2, 3 |
| Security: keys not in content path | unchanged background path |

## Placeholder / consistency review

- No TBD steps; function names match across tasks (`pickTtsCredentials`, `shouldOfferVoiceField`, `isOpenAiStyleTtsHost`).
- `TtsCredentialPick.voice` remains a string; empty means omit in Task 3.
- UI Task 4 passes full settings snapshot into `pickTtsCredentials` so resolution matches background.
