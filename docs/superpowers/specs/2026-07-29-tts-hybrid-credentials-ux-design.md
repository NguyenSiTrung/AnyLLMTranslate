# TTS Hybrid Credentials UX

> **Date:** 2026-07-29  
> **Scope:** Options → Advanced → Speech (selection Speak); TTS credential resolution; provider TTS request body  
> **Status:** Design approved in session; written spec pending user review  
> **Beads:** AnyLLMTranslate-70c  
> **Approach:** Hybrid — pool provider pick **or** custom TTS endpoint (full override); free-text model + optional Load models; conditional voice field

---

## 1. Context

### Current behavior

Selection Speak (Phase B) supports:

| Path | Mechanism |
|------|-----------|
| Browser | `speechSynthesis` in the content script |
| Provider | Background `SYNTHESIZE_SPEECH` → OpenAI-compatible `POST …/audio/speech` |

Provider credentials are taken from the **first enabled** pool entry (or legacy single provider) with base URL + key. Model and voice come from `settings.tts` and are chosen in the UI from **hardcoded** lists:

- Models: `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`
- Voices: OpenAI-style (`alloy`, `nova`, …)

### Pain points

1. **Hardcoded model/voice** — not tied to the user’s providers; wrong for non-OpenAI OpenAI-compatible hosts.
2. **No TTS provider choice** — cannot pick which pool entry supplies TTS credentials.
3. **No custom TTS endpoint** — chat and speech must share the same first-enabled base URL.
4. **Voice always sent** — request always includes `voice` / OpenAI-shaped fields; hosts that ignore or reject `voice` get a worse UX (and misleading UI).
5. **Mistral / Voxtral** — Mistral is in the chat catalog, but Voxtral TTS is **not** drop-in OpenAI `model`+`voice` speech. Pretending Mistral is selectable as OpenAI TTS is incorrect for v1.

### Product decisions (locked this session)

| Topic | Decision |
|-------|----------|
| Credential model | **Hybrid (3)** — use a selected pool provider **or** a custom TTS endpoint |
| Override rule | **Custom fully overrides (1)** — when custom is active and valid, pool is ignored for TTS |
| Model/voice entry | **Free-text + optional Load models (2)** — no hardcoded-only dropdowns |
| Voice visibility | Hide unless host is known OpenAI-style TTS **or** user opts in (“Show voice field”) |
| Mistral Voxtral | **Out of scope for v1** (different API: voice profiles / reference audio) |

---

## 2. Goals

1. Let the user choose **which** enabled pool provider supplies TTS base URL + API key.
2. Let the user configure a **dedicated custom TTS endpoint** (base URL + API key) that fully overrides the pool for speech only.
3. Replace hardcoded model/voice-only UI with **free-text model** and optional **Load models** from `GET {ttsBase}/models`.
4. **Omit `voice` from the provider request** when the voice field is hidden/empty so non-OpenAI hosts are not forced into OpenAI voice IDs.
5. Keep existing Backend (`auto` / `browser` / `provider`), rate, enable toggle, Test voice, and fail-open-to-browser Speak behavior.
6. Preserve security: API keys stay in background / options storage paths already used for providers; never inject keys into the page.

---

## 3. Non-goals

| Non-goal | Rationale |
|----------|-----------|
| Mistral Voxtral / voice cloning / reference audio | Different API surface; track as follow-up |
| Separate multi-slot TTS provider pool | Hybrid custom endpoint covers dedicated speech hosts |
| Streaming TTS | Current Speak plays full audio blob |
| Auto-detect every vendor’s voice API | Only OpenAI-style voice UI + opt-in free-text |
| Changing chat translation provider rotation | TTS resolution is independent of chat slot picking |
| Fetching voices from a vendor voices API | v1 voice is free-text when shown |

---

## 4. UX (Options → Advanced → Speech)

### 4.1 Unchanged controls

- **Enable Speak on selection bubble**
- **Backend:** Auto (provider if configured) / Browser only / Provider first (fallback to browser)
- **Rate** (0.5–2.0)
- **Test voice**

### 4.2 Credential source

Radio or segmented control:

| Value | Label | UI |
|-------|--------|-----|
| `pool` | Use provider from pool | Dropdown of **enabled** pool providers: `displayName` + truncated `baseUrl`. Empty state: “No enabled providers — add one in Providers or use Custom endpoint.” |
| `custom` | Custom TTS endpoint | Fields: **Base URL**, **API key** (password-style, same patterns as Providers). Helper: “Fully overrides pool for Speak only. Expect OpenAI-compatible `POST /v1/audio/speech`.” |

Validation (custom active):

- Base URL required (trimmed, non-empty).
- API key required unless we later add a “no key” toggle; **v1: key recommended/required when calling authenticated hosts** — mirror pool `requiresApiKey` only for pool path; for custom, require non-empty key **or** allow empty with a clear warning that unauthenticated endpoints only work if the host accepts no `Authorization` (allow empty key; Test will surface failures).

**Resolution rule:** If `credentialSource === 'custom'` **and** custom base URL is non-empty → use custom base URL + custom API key only (full override). Do not fall back to pool mid-request. If custom base URL is empty while source is custom → treat provider TTS as **unavailable** (same as missing pool creds).

### 4.3 Model

- Single **text input** (required for meaningful provider TTS; empty model → provider call fails with clear error / Test shows error).
- Placeholder e.g. `tts-1` or `your-tts-model-id` (hint only, not a forced default list).
- Button **Load models**:
  - Uses resolved TTS credentials (pool pick or custom).
  - Calls existing models-list path against TTS base URL (`GET …/models`, same pagination behavior as Providers where practical).
  - On success: show a pick list / combobox of returned model IDs; selecting fills the text field. User may still type any id.
  - On failure: toast/inline error; field stays free-text.
  - Optional light client filter: prefer ids containing `tts`, `speech`, `audio`, `voice` when such ids exist; **always** still show full list in an expandable “All models” if filtered.

### 4.4 Voice

- **Hidden by default.**
- **Show** when either:
  1. Resolved TTS base URL host is **known OpenAI-style speech** (v1: hostname is `api.openai.com` or ends with `.openai.azure.com` / contains `openai.com` speech-compatible pattern — keep matcher centralized and tested), **or**
  2. User enables **Show voice field** (checkbox).
- When shown: **free-text** input (placeholder e.g. `alloy`). No exclusive hardcoded dropdown.
- Optional: if OpenAI-style host, a small datalist of common OpenAI voices is OK as **suggestions only**, not the only values.
- When hidden or empty string: **do not send `voice`** in the TTS JSON body.

### 4.5 Copy / empty states

- Pool selected but provider disabled/removed: show warning; provider TTS unavailable until fixed.
- Custom selected with empty base URL: show inline “Enter a base URL or switch to pool.”
- Browser-only backend: dim credential/model/voice groups (same pattern as current `DisabledDimmer` when Speak disabled).

### 4.6 Test voice

- Browser backend or Speak disabled → browser test (unchanged).
- Else → `SYNTHESIZE_SPEECH` with current settings resolution; play returned audio; surface provider errors clearly.

---

## 5. Data model

### 5.1 `TtsSettings` (extended)

```ts
export type TtsCredentialSource = 'pool' | 'custom';

export interface TtsSettings {
  enabled: boolean;
  preferredBackend: TtsPreferredBackend;
  /** Free-text TTS model id. Empty = unset. */
  model: string;
  /**
   * Optional voice id. Empty/undefined = omit from provider request.
   * UI may hide this field; stored value can remain for when field is shown again.
   */
  voice: string;
  rate: number;
  /** pool (default) | custom full override */
  credentialSource: TtsCredentialSource;
  /** PoolProvider.id when credentialSource === 'pool'. Empty = first usable enabled provider (migration). */
  poolProviderId: string;
  /** Used only when credentialSource === 'custom'. */
  customBaseUrl: string;
  customApiKey: string;
  /** User forced the voice field visible. */
  showVoiceField: boolean;
}
```

### 5.2 Defaults

```ts
DEFAULT_TTS_SETTINGS = {
  enabled: true,
  preferredBackend: 'auto',
  model: '',           // was 'tts-1' — stop implying OpenAI-only
  voice: '',           // was 'alloy'
  rate: 1,
  credentialSource: 'pool',
  poolProviderId: '',
  customBaseUrl: '',
  customApiKey: '',
  showVoiceField: false,
}
```

**Migration:** `mergeTtsSettings` fills missing keys from defaults. Existing installs that already have `model: 'tts-1'` / `voice: 'alloy'` keep those stored values (no destructive wipe). New installs start empty model/voice.

### 5.3 Remove as sole UI source of truth

- `TTS_MODEL_OPTIONS` and `TTS_VOICE_OPTIONS` are **no longer** the only selectable values.
- They may remain as **optional suggestion** arrays for OpenAI-style hosts only, or be deleted if unused after UI change. Prefer keeping a small `OPENAI_TTS_VOICE_SUGGESTIONS` constant if datalist is implemented; delete hard dependency from the Select-only UI.

### 5.4 Export / import

- Include new fields in settings export/import paths automatically via full `settings` object (verify no strip list drops unknown `tts` keys).
- Custom API key is sensitive: follow the same export redaction rules as provider keys if the product already redacts keys on export; if export currently includes provider keys, keep consistent behavior and document it (do not invent a new redaction policy in this work unless one already exists for pool keys).

---

## 6. Resolution & request path

### 6.1 Pure helpers (`lib/tts/resolveTtsBackend.ts` and friends)

| Function | Responsibility |
|----------|----------------|
| `mergeTtsSettings` | Defaults + partial |
| `resolveTtsCredentials(settings)` | Returns `{ baseUrl, apiKey, model, voice, rate } \| null` using hybrid rules |
| `hasProviderTtsCredentials(settings)` | `resolveTtsCredentials !== null` **and** model non-empty (or: creds without model still “has endpoint” but Speak/Test require model — **decide:** has-credentials = base+key usable; model validated at fetch time with clear error) |
| `shouldOfferVoiceField(tts, baseUrl)` | OpenAI-style host **or** `showVoiceField` |
| `speechEndpointFromBaseUrl` | Unchanged |

**Credential resolution (authoritative):**

1. If `credentialSource === 'custom'`:
   - If `customBaseUrl.trim()` empty → `null`.
   - Else → `{ baseUrl: custom, apiKey: customApiKey, model, voice, rate }` (apiKey may be empty).
2. If `credentialSource === 'pool'` (default):
   - If `poolProviderId` matches an **enabled** pool provider with non-empty base URL and a usable enabled key (same key rules as today) → that provider.
   - Else if `poolProviderId` empty → **first** enabled usable pool provider (backward compatible).
   - Else (id set but missing/disabled) → `null` (do not silently pick another id; UI should warn). Optionally: if id missing after provider delete, UI clears id on next save — implementation may normalize unknown id to empty and then first-usable for resilience; **prefer null + warning** when id was explicitly set and invalid.
3. Legacy `settings.provider` remains last-resort only when pool array empty (keep existing legacy branch).

**Locked preference for invalid explicit pool id:** return `null` and surface “Selected TTS provider is missing or disabled” in Test/UI. Speak fail-open to browser when backend is `auto`/`provider`.

### 6.2 Provider fetch (`lib/tts/providerTts.ts`)

Request body:

```ts
{
  model: creds.model,
  input,
  speed: creds.rate,
  response_format: 'mp3',
  ...(creds.voice.trim() ? { voice: creds.voice.trim() } : {}),
}
```

- Reject empty model before fetch with a clear error string.
- Keep max input length and error parsing behavior.

### 6.3 Background

- `SYNTHESIZE_SPEECH` continues to load settings, resolve credentials in background only, call `fetchProviderSpeech`.
- No API keys in content-script messages beyond what already exists (audio base64 response only).

### 6.4 Content Speak

- `speakSmart` keeps: resolve backend → provider → fail-open browser.
- `hasProviderTtsCredentials` uses new hybrid resolver.

### 6.5 Load models

- Prefer reusing `fetchModelsList` / providerTester models helpers with `{ baseUrl, apiKey }` from `resolveTtsCredentials` (without requiring chat `model`).
- Wire from Options only (no content script).
- If a dedicated message is needed (`LIST_TTS_MODELS`), keep it background-side with the same credential resolution; avoid duplicating fetch logic in the UI.

---

## 7. OpenAI-style host detection

Centralize a small pure helper, e.g. `isOpenAiStyleTtsHost(baseUrl: string): boolean`.

**v1 match (conservative):**

- Hostname equals `api.openai.com`, or
- Hostname ends with `.openai.azure.com`, or
- Hostname is `openai.com` / ends with `.openai.com`

Do **not** treat Mistral, Groq, OpenRouter, etc. as OpenAI-style voice hosts by default (even if some proxy OpenAI TTS). Users on proxies that need `voice` use **Show voice field**.

---

## 8. Security & privacy

- Custom TTS API key stored in `chrome.storage` alongside other settings (same trust boundary as pool keys).
- Keys used only in background (and options page for Test/Load models via runtime messages if models fetch is background-only — prefer background for consistency with connection tests).
- Never pass raw keys into `content/` Speak path.
- Do not log full API keys.

---

## 9. Testing

| Area | Cases |
|------|--------|
| `resolveTtsCredentials` | pool first-usable; explicit pool id; invalid id → null; custom override ignores pool; custom empty URL → null; legacy provider fallback |
| `shouldOfferVoiceField` / host detect | openai.com true; mistral.ai false; showVoiceField true forces |
| `fetchProviderSpeech` | omits `voice` when empty; includes when set; empty model error |
| merge/defaults | old settings without new fields still work; preserved tts-1 if already stored |
| UI (component tests if pattern exists) | switching source shows/hides custom fields; voice hidden by default for non-OpenAI |

---

## 10. Migration & compatibility

| Existing user | Behavior after change |
|---------------|------------------------|
| Had provider TTS via first pool entry | `credentialSource: pool`, empty `poolProviderId` → still first usable entry |
| Had `model`/`voice` stored | Unchanged values |
| Browser-only users | Unaffected |
| UI previously forced tts-1 | New defaults empty for **new** profiles only |

---

## 11. Follow-ups (explicitly later)

1. Mistral Voxtral adapter (voices API + speech generation shape).
2. Per-catalog TTS capability flags in `OPENAI_COMPATIBLE_CATALOG`.
3. Voice list fetch for OpenAI `/v1/audio/voices` if/when stable and needed.
4. Dedicated “TTS” badge on pool providers that successfully pass a speech Test.

---

## 12. Implementation touchpoints (expected)

| Area | Files (indicative) |
|------|---------------------|
| Types/defaults | `types/config.ts` |
| Resolve / host detect | `lib/tts/resolveTtsBackend.ts` (+ small helper module if cleaner) |
| Provider body | `lib/tts/providerTts.ts` |
| Background synthesize (+ optional list models) | `services/background.ts` |
| Options UI | `entrypoints/options/sections/AdvancedSection.tsx` (`TtsSettingsGroup`) |
| Tests | `lib/__tests__/ttsResolve.test.ts`, `providerTts.test.ts`, Advanced section tests if present |
| Messages | `types/messages.ts` if new list-models action |

---

## 13. Success criteria

1. User can pick a specific enabled pool provider for Speak credentials.
2. User can set a custom TTS base URL + key that fully overrides the pool for Speak.
3. Model is free-text; Load models can populate from the active TTS endpoint.
4. Voice is not shown for non-OpenAI-style hosts unless the user opts in; omitted from the request when empty/hidden.
5. No hardcoded-only model/voice Select as the sole configuration path.
6. Existing Speak fail-open and browser path remain intact.
7. Unit tests cover hybrid resolution and conditional `voice` in the request body.
