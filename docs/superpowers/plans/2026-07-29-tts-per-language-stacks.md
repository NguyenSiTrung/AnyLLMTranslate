# Per-language TTS Stacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure full TTS stacks (credentials, model, voice) per language under Advanced → Speech so Speak original/translation uses the matching stack with exact→base→global fallback.

**Architecture:** Extend `TtsSettings` with `languageOverrides[]`. Pure `resolveTtsStack(settings, lang)` merges a matched row onto global credentials/model/voice. Background `SYNTHESIZE_SPEECH` and `SpeakController.speakSmart` both use that resolver. When an override matches and provider is allowed, prefer provider (skip browser-voice short-circuit); otherwise keep today's global + browser-match behavior.

**Tech Stack:** TypeScript, Vitest, React Options UI (`AdvancedSection`), existing TTS helpers in `lib/tts/`, chrome.runtime messages, beads issue AnyLLMTranslate-9yd.

**Spec:** `docs/superpowers/specs/2026-07-29-tts-per-language-stacks-design.md`  
**Beads:** AnyLLMTranslate-9yd

## Global Constraints

- Partial override fields inherit global `tts.*` when empty/omitted.
- Match order: normalized exact tag → base language → no override.
- `preferredBackend === 'browser'` always uses browser; per-language provider stacks are ignored.
- When a language override matches and provider backend is allowed and pick is non-null: prefer provider; do **not** short-circuit to browser solely because a system voice matches.
- When no override matches: keep existing browser-match preference over single global provider voice.
- API keys never enter content-script message payloads beyond existing patterns (background resolves credentials).
- Custom/pool override that cannot build credentials falls back to **global** credentials, still applying override model/voice if set.
- Rate stays global only in v1 (no per-language rate).
- Do not use TodoWrite; use beads (`bd`) for task tracking.
- Prefer TDD: failing test → implement → pass → commit per task.

## File map

| File | Role |
|------|------|
| `types/config.ts` | `TtsLanguageOverride`, `languageOverrides` on `TtsSettings` + defaults |
| `lib/tts/resolveTtsBackend.ts` | `mergeTtsSettings` sanitize list; `findTtsLanguageOverride`; `resolveTtsStack`; credential pick helpers |
| `lib/__tests__/ttsResolve.test.ts` | Unit tests for match + merge + stack resolve |
| `services/background.ts` | `handleSynthesizeSpeech` uses `resolveTtsStack(settings, message.lang)` |
| `content/selectionBubble/speak.ts` | Override-aware `speakSmart` |
| `content/__tests__/selectionBubble/speak.test.ts` | Speak path tests with/without override |
| `entrypoints/options/sections/AdvancedSection.tsx` | Per-language voices list UI under Speech |

---

### Task 1: Types + defaults for `languageOverrides`

**Files:**
- Modify: `types/config.ts` (`TtsSettings` ~306–349, `DEFAULT_TTS_SETTINGS`)
- Test: covered by Task 2 merge assertions

**Interfaces:**
- Produces:
  - `TtsLanguageOverride`
  - `TtsSettings.languageOverrides: TtsLanguageOverride[]`
  - `DEFAULT_TTS_SETTINGS.languageOverrides: []`

- [ ] **Step 1: Add types and default**

In `types/config.ts`, after `TtsCredentialSource` and before `TtsSettings`, add:

```ts
/**
 * Optional per-language full-stack override for selection Speak.
 * Empty/omitted fields inherit the global tts.* defaults.
 */
export interface TtsLanguageOverride {
  /** ISO 639-1 or BCP-47, e.g. "vi", "zh-CN". Matched after normalize. */
  language: string;
  /** When set, overrides global credential source for this language. */
  credentialSource?: TtsCredentialSource;
  poolProviderId?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  /** Non-empty overrides global model; empty/omit inherits. */
  model?: string;
  /** Non-empty overrides global voice / voice_id; empty/omit inherits. */
  voice?: string;
}
```

Add to `TtsSettings`:

```ts
  /**
   * Per-language stacks for Speak. Match: exact normalized code, then base
   * language, else none. Missing/empty fields inherit global tts.*.
   */
  languageOverrides: TtsLanguageOverride[];
```

Add to `DEFAULT_TTS_SETTINGS`:

```ts
  languageOverrides: [],
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -50`  
Expected: no new errors from missing `languageOverrides` if all construction goes through `DEFAULT_TTS_SETTINGS` / `mergeTtsSettings`. Fix any literal `TtsSettings` objects in tests that require the new field only if tsc fails (prefer fixing via merge helper in Task 2).

- [ ] **Step 3: Commit**

```bash
git add types/config.ts
git commit -m "feat(tts): add languageOverrides to TtsSettings"
```

---

### Task 2: Pure resolve helpers (TDD)

**Files:**
- Modify: `lib/tts/resolveTtsBackend.ts`
- Modify: `lib/__tests__/ttsResolve.test.ts`

**Interfaces:**
- Consumes: `TtsLanguageOverride`, `TtsSettings`, `ExtensionSettings`, existing `pickTtsCredentials`, `mergeTtsSettings`, `TtsCredentialPick`
- Produces:
  - `normalizeTtsOverrideLang(code?: string | null): string | undefined`
  - `findTtsLanguageOverride(overrides: readonly TtsLanguageOverride[], lang?: string | null): TtsLanguageOverride | null`
  - `resolveTtsStack(settings: ExtensionSettings, lang?: string | null): { matchedOverride: boolean; pick: TtsCredentialPick | null }`
  - `mergeTtsSettings` always returns `languageOverrides` as an array (default `[]`)

- [ ] **Step 1: Write failing tests**

Append to `lib/__tests__/ttsResolve.test.ts`:

```ts
import {
  // existing imports...
  findTtsLanguageOverride,
  normalizeTtsOverrideLang,
  resolveTtsStack,
} from '@/lib/tts/resolveTtsBackend';
import type { TtsLanguageOverride } from '@/types/config';

describe('normalizeTtsOverrideLang / findTtsLanguageOverride', () => {
  it('normalizes case and underscore; rejects empty/auto', () => {
    expect(normalizeTtsOverrideLang('VI')).toBe('vi');
    expect(normalizeTtsOverrideLang('vi_VN')).toBe('vi-vn');
    expect(normalizeTtsOverrideLang('auto')).toBeUndefined();
    expect(normalizeTtsOverrideLang('')).toBeUndefined();
    expect(normalizeTtsOverrideLang(null)).toBeUndefined();
  });

  it('matches exact then base language; first wins', () => {
    const rows: TtsLanguageOverride[] = [
      { language: 'vi', voice: 'vi-base' },
      { language: 'vi-VN', voice: 'vi-exact' },
      { language: 'en', voice: 'en-1' },
      { language: 'en', voice: 'en-2' },
    ];
    expect(findTtsLanguageOverride(rows, 'vi-VN')?.voice).toBe('vi-exact');
    expect(findTtsLanguageOverride(rows, 'vi')?.voice).toBe('vi-base');
    expect(findTtsLanguageOverride(rows, 'en-GB')?.voice).toBe('en-1');
    expect(findTtsLanguageOverride(rows, 'fr')).toBeNull();
    expect(findTtsLanguageOverride(rows, 'auto')).toBeNull();
  });
});

describe('mergeTtsSettings languageOverrides', () => {
  it('defaults missing overrides to [] and preserves array', () => {
    expect(mergeTtsSettings({ voice: 'nova' }).languageOverrides).toEqual([]);
    expect(
      mergeTtsSettings({
        languageOverrides: [{ language: 'vi', voice: 'v1' }],
      }).languageOverrides,
    ).toEqual([{ language: 'vi', voice: 'v1' }]);
    expect(mergeTtsSettings({ languageOverrides: null as never }).languageOverrides).toEqual(
      [],
    );
  });
});

describe('resolveTtsStack', () => {
  it('returns global pick with matchedOverride false when no row', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'tts-1',
        voice: 'alloy',
        credentialSource: 'pool',
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    const stack = resolveTtsStack(s, 'fr');
    expect(stack.matchedOverride).toBe(false);
    expect(stack.pick?.voice).toBe('alloy');
    expect(stack.pick?.model).toBe('tts-1');
  });

  it('inherits global creds and overrides model/voice when row has no creds', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'tts-1',
        voice: 'alloy',
        languageOverrides: [{ language: 'vi', model: 'voxtral-mini-tts-2603', voice: 'vi-id' }],
      },
      providers: [poolProvider({ id: 'p1', baseUrl: 'https://api.mistral.ai/v1' })],
    });
    const stack = resolveTtsStack(s, 'vi-VN');
    expect(stack.matchedOverride).toBe(true);
    expect(stack.pick?.baseUrl).toBe('https://api.mistral.ai/v1');
    expect(stack.pick?.model).toBe('voxtral-mini-tts-2603');
    expect(stack.pick?.voice).toBe('vi-id');
    expect(stack.pick?.apiKey).toBe('sk-test');
  });

  it('uses override custom credentials when valid', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'global-model',
        voice: 'global-voice',
        credentialSource: 'pool',
        languageOverrides: [
          {
            language: 'en',
            credentialSource: 'custom',
            customBaseUrl: 'https://custom-tts.example/v1',
            customApiKey: 'sk-lang',
            voice: 'en-voice',
          },
        ],
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    const stack = resolveTtsStack(s, 'en');
    expect(stack.matchedOverride).toBe(true);
    expect(stack.pick?.baseUrl).toBe('https://custom-tts.example/v1');
    expect(stack.pick?.apiKey).toBe('sk-lang');
    expect(stack.pick?.voice).toBe('en-voice');
    expect(stack.pick?.model).toBe('global-model');
  });

  it('falls back to global credentials when override custom URL empty', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'tts-1',
        voice: 'alloy',
        languageOverrides: [
          {
            language: 'ja',
            credentialSource: 'custom',
            customBaseUrl: '  ',
            voice: 'ja-voice',
          },
        ],
      },
      providers: [poolProvider({ id: 'p1' })],
    });
    const stack = resolveTtsStack(s, 'ja');
    expect(stack.matchedOverride).toBe(true);
    expect(stack.pick?.baseUrl).toBe('https://api.openai.com/v1');
    expect(stack.pick?.voice).toBe('ja-voice');
  });

  it('uses override poolProviderId when credentialSource pool', () => {
    const s = baseSettings({
      tts: {
        ...DEFAULT_TTS_SETTINGS,
        model: 'tts-1',
        voice: 'alloy',
        poolProviderId: 'p1',
        languageOverrides: [
          {
            language: 'ko',
            credentialSource: 'pool',
            poolProviderId: 'p2',
            voice: 'ko-v',
          },
        ],
      },
      providers: [
        poolProvider({ id: 'p1', baseUrl: 'https://api.openai.com/v1' }),
        poolProvider({
          id: 'p2',
          baseUrl: 'https://tts-ko.example/v1',
          keys: [
            {
              id: 'k2',
              apiKey: 'sk-ko',
              maxRpm: 0,
              concurrencyLimit: 1,
              interval: 0,
              enabled: true,
            },
          ],
        }),
      ],
    });
    const stack = resolveTtsStack(s, 'ko');
    expect(stack.matchedOverride).toBe(true);
    expect(stack.pick?.baseUrl).toBe('https://tts-ko.example/v1');
    expect(stack.pick?.apiKey).toBe('sk-ko');
    expect(stack.pick?.voice).toBe('ko-v');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run lib/__tests__/ttsResolve.test.ts -v 2>&1 | tail -40`  
Expected: FAIL — `findTtsLanguageOverride` / `resolveTtsStack` / `normalizeTtsOverrideLang` not exported.

- [ ] **Step 3: Implement helpers in `lib/tts/resolveTtsBackend.ts`**

Update `mergeTtsSettings`:

```ts
export function mergeTtsSettings(partial?: Partial<TtsSettings> | null): TtsSettings {
  const merged: TtsSettings = {
    ...DEFAULT_TTS_SETTINGS,
    ...(partial ?? {}),
  };
  if (!Array.isArray(merged.languageOverrides)) {
    merged.languageOverrides = [];
  }
  return merged;
}
```

Add (import `TtsLanguageOverride` from config):

```ts
/** Normalize a language code for override matching (lowercase, underscore→dash). */
export function normalizeTtsOverrideLang(
  code?: string | null,
): string | undefined {
  if (code == null) return undefined;
  const raw = code.trim().toLowerCase().replace(/_/g, '-');
  if (!raw || raw === 'auto') return undefined;
  return raw;
}

function baseLanguageTag(normalized: string): string {
  const i = normalized.indexOf('-');
  return i === -1 ? normalized : normalized.slice(0, i);
}

/**
 * First matching override: exact normalized language, else base language.
 */
export function findTtsLanguageOverride(
  overrides: readonly TtsLanguageOverride[],
  lang?: string | null,
): TtsLanguageOverride | null {
  const target = normalizeTtsOverrideLang(lang);
  if (!target || !overrides?.length) return null;

  for (const row of overrides) {
    const rowLang = normalizeTtsOverrideLang(row.language);
    if (rowLang && rowLang === target) return row;
  }

  const base = baseLanguageTag(target);
  for (const row of overrides) {
    const rowLang = normalizeTtsOverrideLang(row.language);
    if (rowLang && rowLang === base) return row;
  }

  return null;
}

function pickFromOverrideCredentials(
  settings: ExtensionSettings,
  override: TtsLanguageOverride,
): TtsCredentialPick | null {
  const tts = mergeTtsSettings(settings.tts);
  const model =
    (override.model ?? '').trim() || (tts.model || '').trim();
  const voice =
    (override.voice ?? '').trim() || (tts.voice || '').trim();
  const rate = clampRate(tts.rate);

  const source = override.credentialSource;
  if (source === 'custom') {
    const baseUrl = (override.customBaseUrl ?? '').trim().replace(/\/+$/, '');
    if (!baseUrl) return null;
    return {
      baseUrl,
      apiKey: (override.customApiKey ?? '').trim(),
      model,
      voice,
      rate,
    };
  }

  if (source === 'pool') {
    const providers = settings.providers ?? [];
    const explicitId = (override.poolProviderId ?? '').trim();
    if (explicitId) {
      const match = providers.find((p) => p.id === explicitId);
      if (!match || !match.enabled) return null;
      return pickFromProvider(match, {
        ...tts,
        model,
        voice,
      });
    }
    for (const p of providers) {
      if (!p.enabled) continue;
      const picked = pickFromProvider(p, { ...tts, model, voice });
      if (picked) return picked;
    }
    return null;
  }

  return null;
}

/**
 * Resolve effective TTS credentials/model/voice for a speak language.
 * matchedOverride true when a language row matched (even if pick falls back to global creds).
 */
export function resolveTtsStack(
  settings: ExtensionSettings,
  lang?: string | null,
): { matchedOverride: boolean; pick: TtsCredentialPick | null } {
  const tts = mergeTtsSettings(settings.tts);
  const override = findTtsLanguageOverride(tts.languageOverrides, lang);

  if (!override) {
    return { matchedOverride: false, pick: pickTtsCredentials(settings) };
  }

  const model =
    (override.model ?? '').trim() || (tts.model || '').trim();
  const voice =
    (override.voice ?? '').trim() || (tts.voice || '').trim();
  const rate = clampRate(tts.rate);

  let pick: TtsCredentialPick | null = null;
  if (override.credentialSource === 'custom' || override.credentialSource === 'pool') {
    pick = pickFromOverrideCredentials(settings, override);
  }

  if (!pick) {
    // Inherit global credentials; still apply override model/voice.
    const global = pickTtsCredentials(settings);
    if (!global) {
      return { matchedOverride: true, pick: null };
    }
    pick = { ...global, model, voice, rate };
  } else {
    pick = { ...pick, model, voice, rate };
  }

  return { matchedOverride: true, pick };
}
```

Note: `pickFromProvider` already exists in this file; ensure it remains accessible (not file-private rename). If it is not exported, keep it private and call as today.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/__tests__/ttsResolve.test.ts -v 2>&1 | tail -50`  
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tts/resolveTtsBackend.ts lib/__tests__/ttsResolve.test.ts
git commit -m "feat(tts): resolve per-language TTS stacks"
```

---

### Task 3: Background `SYNTHESIZE_SPEECH` uses lang stack

**Files:**
- Modify: `services/background.ts` (`handleSynthesizeSpeech` ~lines that call `pickTtsCredentials`)
- Test: optional small unit if background handler tests exist; otherwise rely on Task 2 + manual path. Prefer adding a focused test only if cheap.

**Interfaces:**
- Consumes: `resolveTtsStack(settings, message.lang)`
- Produces: same `SynthesizeSpeechResult`; uses resolved pick for `fetchProviderSpeech`

- [ ] **Step 1: Update import and handler**

Replace:

```ts
import { pickTtsCredentials } from '@/lib/tts/resolveTtsBackend';
```

with:

```ts
import { resolveTtsStack } from '@/lib/tts/resolveTtsBackend';
```

Update `handleSynthesizeSpeech`:

```ts
async function handleSynthesizeSpeech(
  message: SynthesizeSpeechMessage,
): Promise<SynthesizeSpeechResult> {
  try {
    const settings = await loadSettings();
    const ttsEnabled = settings.tts?.enabled !== false;
    if (!ttsEnabled) {
      return { success: false, error: 'Speech is disabled in Settings' };
    }
    const { pick: creds } = resolveTtsStack(settings, message.lang);
    if (!creds) {
      return { success: false, error: 'No provider credentials configured for TTS' };
    }
    const result = await fetchProviderSpeech(message.text ?? '', creds);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      audioBase64: result.audioBase64,
      mimeType: result.mimeType,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'TTS failed',
    };
  }
}
```

- [ ] **Step 2: Typecheck / quick test**

Run: `pnpm exec tsc --noEmit 2>&1 | head -30`  
Expected: clean for this change.

- [ ] **Step 3: Commit**

```bash
git add services/background.ts
git commit -m "feat(tts): synthesize speech with language stack"
```

---

### Task 4: `SpeakController.speakSmart` override path (TDD)

**Files:**
- Modify: `content/selectionBubble/speak.ts`
- Modify: `content/__tests__/selectionBubble/speak.test.ts`

**Interfaces:**
- Consumes: `resolveTtsStack`, `resolveTtsBackend`, `mergeTtsSettings`, `hasProviderTtsCredentials` (optional after stack)
- Behavior:
  1. disabled → throw
  2. `preferredBackend === 'browser'` → browser always
  3. if `resolveTtsStack` `matchedOverride && pick` and backend is provider/auto → provider (no browser-match short-circuit); fail-open browser
  4. else existing logic (browser-match preference when no override)

- [ ] **Step 1: Write failing tests**

Add to `content/__tests__/selectionBubble/speak.test.ts`:

```ts
  it('speakSmart with language override uses provider even when browser voice matches', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      success: true,
      audioBase64: btoa('fake'),
      mimeType: 'audio/mpeg',
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    // Minimal Audio mock so provider playback resolves
    vi.stubGlobal(
      'Audio',
      class {
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        src = '';
        play() {
          queueMicrotask(() => this.onended?.());
          return Promise.resolve();
        }
        pause() {}
      },
    );
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:test',
      revokeObjectURL: () => {},
    });

    vi.mocked(loadSettings).mockResolvedValue({
      tts: {
        enabled: true,
        preferredBackend: 'provider',
        model: 'voxtral-mini-tts-2603',
        voice: 'global-voice',
        rate: 1,
        credentialSource: 'pool',
        poolProviderId: '',
        customBaseUrl: '',
        customApiKey: '',
        showVoiceField: true,
        languageOverrides: [{ language: 'vi', voice: 'vi-voice-id' }],
      },
      providers: [
        {
          id: 'p1',
          displayName: 'Mistral',
          baseUrl: 'https://api.mistral.ai/v1',
          model: 'mistral-small',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            {
              id: 'k1',
              apiKey: 'msk',
              maxRpm: 0,
              concurrencyLimit: 1,
              interval: 0,
              enabled: true,
            },
          ],
        },
      ],
      provider: {
        preset: 'custom',
        baseUrl: 'https://api.mistral.ai/v1',
        apiKey: 'msk',
        model: '',
        temperature: 0.3,
        maxTokens: 4096,
        displayName: 'Mistral',
        connectionStatus: 'unknown',
        requiresApiKey: true,
      },
    } as never);

    const c = new SpeakController();
    const result = await c.speakSmart('Xin chào', 'vi');
    expect(result).toEqual({ backend: 'provider' });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SYNTHESIZE_SPEECH',
        text: 'Xin chào',
        lang: 'vi',
      }),
    );
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('speakSmart without override still prefers matching browser voice', async () => {
    // Keep existing test "prefers browser voice matching lang over provider TTS"
    // Ensure languageOverrides: [] or omitted still prefers browser.
  });

  it('speakSmart ignores language override when preferredBackend is browser', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    vi.mocked(loadSettings).mockResolvedValue({
      tts: {
        enabled: true,
        preferredBackend: 'browser',
        model: 'tts-1',
        voice: 'alloy',
        rate: 1,
        credentialSource: 'pool',
        poolProviderId: '',
        customBaseUrl: '',
        customApiKey: '',
        showVoiceField: false,
        languageOverrides: [{ language: 'en', voice: 'should-not-use' }],
      },
      providers: [
        {
          id: 'p1',
          displayName: 'OAI',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            {
              id: 'k1',
              apiKey: 'sk',
              maxRpm: 0,
              concurrencyLimit: 1,
              interval: 0,
              enabled: true,
            },
          ],
        },
      ],
      provider: {
        preset: 'custom',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk',
        model: '',
        temperature: 0.3,
        maxTokens: 4096,
        displayName: 'OAI',
        connectionStatus: 'unknown',
        requiresApiKey: true,
      },
    } as never);

    const c = new SpeakController();
    const result = await c.speakSmart('hello', 'en');
    expect(result).toEqual({ backend: 'browser' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(speakMock).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 2: Run tests to verify new cases fail**

Run: `pnpm exec vitest run content/__tests__/selectionBubble/speak.test.ts -v 2>&1 | tail -40`  
Expected: override→provider case FAIL (still prefers browser).

- [ ] **Step 3: Implement `speakSmart`**

Update imports:

```ts
import {
  hasProviderTtsCredentials,
  mergeTtsSettings,
  resolveTtsBackend,
  resolveTtsStack,
  clampRate,
} from '@/lib/tts/resolveTtsBackend';
```

Replace the body of `speakSmart` after loading settings with:

```ts
    const settings = await loadSettings();
    const tts = mergeTtsSettings(settings.tts);
    const providerAvailable = hasProviderTtsCredentials(settings);
    const backend = resolveTtsBackend(tts, providerAvailable);

    if (backend === 'disabled') {
      throw new Error('Speech is disabled in Settings → Advanced');
    }

    if (backend === 'browser') {
      await this.speakBrowser(trimmed, lang, clampRate(tts.rate));
      return { backend: 'browser' };
    }

    // backend is provider (auto/provider with credentials available path)
    const stack = resolveTtsStack(settings, lang);

    if (stack.matchedOverride && stack.pick) {
      try {
        await this.speakProvider(trimmed, lang);
        return { backend: 'provider' };
      } catch (e) {
        const providerError =
          e instanceof Error ? e.message : 'Provider TTS failed';
        try {
          await this.speakBrowser(trimmed, lang, clampRate(tts.rate));
          return {
            backend: 'browser',
            fallbackFromProvider: true,
            providerError,
          };
        } catch {
          throw new Error(providerError);
        }
      }
    }

    // No language override: prefer matching browser voice over single global provider voice.
    const speechLang = normalizeSpeechLang(lang);
    if (speechLang) {
      const voices = await ensureSpeechVoicesReady();
      const matched = pickBrowserVoice(voices, speechLang);
      if (matched) {
        await this.speakBrowser(trimmed, speechLang, clampRate(tts.rate));
        return {
          backend: 'browser',
          preferredOverProvider: true,
          reason: 'matched-browser-voice',
        };
      }
    }

    try {
      await this.speakProvider(trimmed, lang);
      return { backend: 'provider' };
    } catch (e) {
      const providerError =
        e instanceof Error ? e.message : 'Provider TTS failed';
      try {
        await this.speakBrowser(trimmed, lang, clampRate(tts.rate));
        return {
          backend: 'browser',
          fallbackFromProvider: true,
          providerError,
        };
      } catch {
        throw new Error(providerError);
      }
    }
```

Keep `speakProvider` sending `{ action: 'SYNTHESIZE_SPEECH', text, lang }` unchanged.

**Note on `hasProviderTtsCredentials`:** when only override custom credentials exist and global pool is empty, `hasProviderTtsCredentials` may be false and `resolveTtsBackend(..., false)` returns browser for `auto`/`provider`. Fix by treating override pick as provider-available:

```ts
    const stackEarly = resolveTtsStack(settings, lang);
    const providerAvailable =
      hasProviderTtsCredentials(settings) ||
      (stackEarly.matchedOverride && stackEarly.pick !== null);
    const backend = resolveTtsBackend(tts, providerAvailable);
```

Use `stackEarly` later instead of calling `resolveTtsStack` twice (reuse the same result).

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run content/__tests__/selectionBubble/speak.test.ts -v 2>&1 | tail -50`  
Expected: all PASS (including existing browser-prefer test).

- [ ] **Step 5: Commit**

```bash
git add content/selectionBubble/speak.ts content/__tests__/selectionBubble/speak.test.ts
git commit -m "feat(tts): prefer language override stack in Speak"
```

---

### Task 5: Advanced → Speech UI — Per-language voices list

**Files:**
- Modify: `entrypoints/options/sections/AdvancedSection.tsx` (`TtsSettingsGroup`)

**Interfaces:**
- Consumes: `TtsLanguageOverride`, `mergeTtsSettings`, `LANGUAGES` / `getTargetLanguages` from `@/lib/languages`
- Persists via existing `patch({ languageOverrides: next })`

- [ ] **Step 1: Import languages helper**

```ts
import { getTargetLanguages } from '@/lib/languages';
import type { TtsLanguageOverride } from '@/types/config';
```

- [ ] **Step 2: Add list UI below global voice controls, above Rate**

Inside `TtsSettingsGroup`, after the global voice field block and before Rate:

```tsx
{/* Per-language voices */}
<div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
  <div>
    <p className="text-sm font-medium text-zinc-200">Per-language voices</p>
    <p className="mt-0.5 text-xs text-zinc-500">
      When Speak original/translation uses this language, use this stack instead
      of the defaults above. Empty fields inherit globals.
    </p>
  </div>

  {merged.languageOverrides.length === 0 && (
    <p className="text-xs text-zinc-500">No language overrides yet.</p>
  )}

  <div className="space-y-3">
    {merged.languageOverrides.map((row, index) => (
      <TtsLanguageOverrideRow
        key={`tts-lang-${index}`}
        row={row}
        index={index}
        globalModel={merged.model}
        globalVoice={merged.voice}
        enabledProviders={enabledProviders}
        duplicateError={/* compute: normalize conflict */}
        onChange={(next) => {
          const list = [...merged.languageOverrides];
          list[index] = next;
          patch({ languageOverrides: list });
        }}
        onRemove={() => {
          patch({
            languageOverrides: merged.languageOverrides.filter((_, i) => i !== index),
          });
        }}
      />
    ))}
  </div>

  <Button
    type="button"
    variant="secondary"
    size="sm"
    onClick={() => {
      const used = new Set(
        merged.languageOverrides
          .map((r) => r.language.trim().toLowerCase().replace(/_/g, '-'))
          .filter(Boolean),
      );
      const defaultLang =
        getTargetLanguages().find((l) => !used.has(l.code.toLowerCase()))?.code ??
        'en';
      if (used.has(defaultLang.toLowerCase())) {
        showError('Every listed language already has an override');
        return;
      }
      patch({
        languageOverrides: [
          ...merged.languageOverrides,
          { language: defaultLang },
        ],
      });
    }}
  >
    Add language
  </Button>
</div>
```

Implement `TtsLanguageOverrideRow` in the same file (function component above `TtsSettingsGroup`):

Row fields:

1. **Language** — `<Select>` options from `getTargetLanguages()` plus allow custom: use Select for known codes; if needed, also an Input for free BCP-47. Minimum: Select of target languages is enough for v1; optional small text input "Custom code" only if Select value is insufficient. Prefer Select with all `getTargetLanguages()` codes.

2. **Credentials** — Select: Inherit | Pool | Custom  
   - Represent Inherit as omitting `credentialSource` (UI value `''` / `'inherit'`).  
   - On change to inherit: delete `credentialSource`, `poolProviderId`, `customBaseUrl`, `customApiKey` from row.  
   - Pool: show provider Select like global.  
   - Custom: base URL + API key Inputs.

3. **Model** — Input; placeholder `merged global or "Inherit global model"`.

4. **Voice** — Input; placeholder inherit global voice.

5. **Remove** — button.

Duplicate guard: when language Select changes, if another row already has same normalized language, show inline error and do not patch (or patch previous value). Helper:

```ts
function normalizedOverrideLang(code: string): string {
  return code.trim().toLowerCase().replace(/_/g, '-');
}

function isDuplicateLanguage(
  rows: TtsLanguageOverride[],
  index: number,
  language: string,
): boolean {
  const n = normalizedOverrideLang(language);
  if (!n) return false;
  return rows.some(
    (r, i) => i !== index && normalizedOverrideLang(r.language) === n,
  );
}
```

Keep UI compact: stack fields vertically in a bordered card per row.

- [ ] **Step 3: Manual sanity (dev)**

Run: `pnpm exec tsc --noEmit 2>&1 | head -40`  
Optional: `pnpm exec vitest run lib/__tests__/ttsResolve.test.ts content/__tests__/selectionBubble/speak.test.ts -v`

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/sections/AdvancedSection.tsx
git commit -m "feat(tts): per-language voices UI in Advanced Speech"
```

---

### Task 6: Final verification + close issue

**Files:** none new

- [ ] **Step 1: Run focused + broader TTS tests**

```bash
pnpm exec vitest run lib/__tests__/ttsResolve.test.ts lib/__tests__/providerTts.test.ts lib/__tests__/listTtsVoices.test.ts lib/__tests__/tts/pickBrowserVoice.test.ts content/__tests__/selectionBubble/speak.test.ts -v 2>&1 | tail -80
```

Expected: all PASS.

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Close beads issue and push**

```bash
bd close AnyLLMTranslate-9yd --reason="Per-language TTS stacks implemented per spec"
git pull --rebase
bd dolt push
git add -A && git status
# commit any beads export if needed
git push
git status -b --porcelain
```

Expected: branch up to date with origin.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `TtsLanguageOverride` + `languageOverrides: []` default | 1 |
| exact → base → global match | 2 |
| Field inherit (model/voice/creds) | 2 |
| Override custom/pool with global creds fallback | 2 |
| Background uses lang stack | 3 |
| Override match → prefer provider (no browser short-circuit) | 4 |
| No override → keep browser-match preference | 4 |
| `preferredBackend === 'browser'` ignores overrides | 4 |
| Advanced UI list under Speech | 5 |
| Duplicate language guard | 5 |
| Keys stay in background | 3–4 (unchanged message shape) |
| No per-language rate | all (rate global only) |

## Out of scope (do not implement)

- Per-row Test voice
- Per-language rate
- Named reusable profiles
- Auto language detection beyond caller `lang`
- Subtitle TTS surfaces
