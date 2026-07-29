# Per-language TTS stacks

**Date:** 2026-07-29  
**Status:** Approved for implementation planning  
**Issue:** AnyLLMTranslate-9yd  
**Related:** `2026-07-29-tts-hybrid-credentials-ux-design.md`, selection bubble Speak (`content/selectionBubble/speak.ts`)

## Problem

Advanced → Speech exposes a single global TTS stack: credentials (pool or custom), model, and voice / `voice_id`. Provider TTS always uses that one voice.

Users want different full stacks per language so that:

- Speak original (source language) can use one model + voice_id (and optionally provider)
- Speak translation (target language) can use another
- Additional languages can be configured the same way

Browser TTS already picks an installed system voice by BCP-47 via `pickBrowserVoice`. Provider path does not.

## Goals

1. Keep current global model / voice / credentials as **defaults**.
2. Add a **Per-language voices** list under Advanced → Speech.
3. Each language row may override the full stack: credentials, model, voice (partial fields inherit globals).
4. When speaking text with language `L`, resolve stack with **exact → base language → global**.
5. Keys stay in the background; content script only sends text + lang.

## Non-goals (v1)

- Per-language rate / speed
- Named reusable TTS profiles shared across many languages
- Auto-detect language of arbitrary text beyond the `lang` the Speak caller already passes
- Subtitle or other surfaces unless they already share selection Speak resolution
- Changing OpenAI vs Mistral dialect detection rules (still baseUrl + model)

## Current behavior (baseline)

| Path | Language handling |
|------|-------------------|
| Browser | `normalizeSpeechLang` + `pickBrowserVoice` / `applyUtteranceVoice` |
| Provider | Single `tts.model` + `tts.voice` from `pickTtsCredentials` |
| Provider + concrete `lang` | If a browser voice matches `lang`, prefer browser over provider so original vs translation can differ |

## Design

### Approach

**Language → partial override list (Approach A).**

Store an ordered list of per-language partial overrides. First matching row wins. Empty fields inherit global `tts.*`.

Rejected for v1:

- **B — Named profiles + language → profileId:** more UI surface than needed
- **C — Only source/target dual slots:** fails when selection language is neither, or user needs 3+ languages

### Settings shape

Extend `TtsSettings` in `types/config.ts`:

```ts
export interface TtsLanguageOverride {
  /** ISO 639-1 or BCP-47, e.g. "vi", "zh-CN". Normalized on match. */
  language: string;
  /** Omit or leave unset to inherit global credential source. */
  credentialSource?: TtsCredentialSource; // 'pool' | 'custom'
  poolProviderId?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  /** Non-empty string overrides global model; empty/omit inherits. */
  model?: string;
  /** Non-empty string overrides global voice / voice_id; empty/omit inherits. */
  voice?: string;
}

export interface TtsSettings {
  // ...existing fields unchanged...
  /**
   * Optional per-language full-stack overrides for Speak.
   * Match: exact normalized code, then base language, else none.
   * Missing/empty fields inherit the global tts.* defaults.
   */
  languageOverrides: TtsLanguageOverride[];
}
```

Defaults / migration:

- `DEFAULT_TTS_SETTINGS.languageOverrides = []`
- `mergeTtsSettings`: if `languageOverrides` missing or not an array → `[]`
- Existing `model`, `voice`, credential fields remain the global default stack
- No breaking change for users who never open the new list

### Language match

Reuse / extend helpers from `lib/tts/pickBrowserVoice.ts` (`normalizeSpeechLang`):

1. Normalize input `lang` (trim, case-fold). If empty, `auto`, or unusable → **no override**.
2. Find first row whose normalized `language` equals the full tag (e.g. `vi-vn`).
3. Else find first row whose normalized `language` equals the **base** subtag (e.g. `vi` from `vi-VN`).
4. Else no override.

Duplicate languages in the list: UI blocks save/add of a second row with the same normalized code. Resolver still uses first match as a safety net.

### Resolve stack

New pure helper (suggested location: `lib/tts/resolveTtsBackend.ts` or adjacent `resolveTtsStack.ts`):

```ts
resolveTtsStack(settings: ExtensionSettings, lang?: string): {
  matchedOverride: boolean;
  pick: TtsCredentialPick | null; // baseUrl, apiKey, model, voice, rate
}
```

Merge rules for a matched row:

| Field | Rule |
|-------|------|
| `credentialSource` | If override sets `pool` or `custom` **and** that path yields valid credentials, use it; else global `pickTtsCredentials(settings)` |
| `model` | `override.model.trim()` if non-empty, else global |
| `voice` | `override.voice.trim()` if non-empty, else global |
| `rate` | Always global `tts.rate` (v1) |

Pool path for an override: same as global (`poolProviderId` explicit or first enabled pool member) but scoped to override fields when `credentialSource === 'pool'`.

Custom path: require non-empty `customBaseUrl` after trim; apiKey may be empty if host allows.

If override requests custom/pool but credentials cannot be built, **fall back to global credentials** (not an immediate hard fail), still applying override model/voice if set. If global also missing → `pick: null` (caller uses browser).

### Speak path (`SpeakController.speakSmart`)

Updated control flow:

1. Disabled → throw (unchanged).
2. `stack = resolveTtsStack(settings, lang)`.
3. **If `matchedOverride` and `stack.pick`:**
   - Prefer **provider** with that pick (user configured this language intentionally).
   - Do **not** short-circuit to browser solely because a system voice matches.
   - On provider failure → fail-open to browser with `lang` + global rate (same error surfacing pattern as today).
4. **If no override match:** keep current behavior:
   - `resolveTtsBackend` + global credentials
   - When backend is provider and `lang` has a matching browser voice → prefer browser (`preferredOverProvider: 'matched-browser-voice'`)
   - Else provider with global stack; fail-open browser
5. Backend forced to `browser` in settings still always uses browser (overrides do not force provider if user chose browser-only globally). Clarification:
   - If `preferredBackend === 'browser'` → always browser, ignore provider stacks (global and per-language).
   - If `preferredBackend === 'provider' | 'auto'` → apply override / global provider rules above.

Rationale for (3): a per-language row is an explicit request for that stack; browser-match preference exists to compensate for a **single** global provider voice, which no longer applies once an override exists.

### Background message

`SYNTHESIZE_SPEECH` already carries `lang`. Background must:

1. Load settings
2. Call `resolveTtsStack(settings, lang)` (or equivalent)
3. If no pick → return error (content fails open to browser)
4. Call `fetchProviderSpeech` with resolved model/voice/creds
5. Never trust client-supplied api keys

Optional: pass a resolved pick id only server-side; do not echo secrets in the response.

Content `speakProvider` continues to send `{ action, text, lang }` only.

### UI (Advanced → Speech)

Placement: **below** existing global model, voice, and credential controls in `AdvancedSection` Speech card.

**Per-language voices**

- Section title + one-line description: e.g. “When Speak original/translation uses this language, use this stack instead of the defaults above. Empty fields inherit globals.”
- Empty state: short hint + **Add language**
- Row fields:
  - **Language** — select from app language list + allow custom BCP-47 text
  - **Credentials** — Inherit | Pool | Custom  
    - Pool: provider picker (same pool list as global)  
    - Custom: base URL + API key (same patterns as global custom TTS)
  - **Model** — text input; placeholder shows global model when inheriting; Load models when effective creds resolve (nice-to-have if low-cost reuse of existing loader)
  - **Voice / voice_id** — text input; placeholder shows global voice; Load voices when host supports (same as global)
  - **Remove**
- Validation:
  - Language required
  - Normalized duplicate language codes rejected with inline error
- Test voice: v1 may keep global **Test voice** only; per-row test is optional follow-up
- Persistence: same settings patch path as other TTS fields (`languageOverrides` array replace on edit)

Show voice field affordances per row using existing `shouldOfferVoiceField` against the **effective** base URL for that row (override custom/pool or global).

### Error and edge cases

| Case | Behavior |
|------|----------|
| No `lang` / `auto` | No override; global path |
| Override empty model/voice | Inherit global |
| Override custom URL empty | Fall back to global credentials; still apply model/voice override if set |
| Mistral without voice_id after merge | Same provider error as today |
| Provider failure with override | Fail-open browser with `lang` |
| `preferredBackend === 'browser'` | Always browser; overrides unused for provider |
| Migration from older settings | `languageOverrides: []` |
| Unknown language code in list | Still stored; only matches if caller passes that code |

### Testing

Unit (pure):

- Match exact, then base, then none
- Field-level inherit merge (model/voice/creds)
- `resolveTtsStack` custom vs pool vs inherit credentials
- `preferredBackend === 'browser'` ignores overrides for provider
- Duplicate-first-match safety

Speak / integration-style unit:

- With matching override + provider pick → provider path even if browser voice exists
- Without override → existing browser-match preference retained
- Provider fail with override → browser fallback

Background:

- `SYNTHESIZE_SPEECH` uses lang-resolved voice/model (mock fetch body assertions for OpenAI `voice` and Mistral `voice_id`)

UI (if existing Advanced test patterns allow):

- Add/remove row
- Duplicate language guard

### Files likely touched

- `types/config.ts` — types + defaults
- `lib/tts/resolveTtsBackend.ts` (and/or new resolve helper) + tests
- `lib/tts/providerTts.ts` — only if pick plumbing needs small tweaks
- `content/selectionBubble/speak.ts` — override-aware `speakSmart`
- `services/background.ts` — lang-aware credential/model/voice pick for `SYNTHESIZE_SPEECH`
- `entrypoints/options/sections/AdvancedSection.tsx` — Per-language voices UI
- Related unit tests under `lib/__tests__/`, content/background tests as applicable

### Rollout

1. Types + merge/migration + pure resolve helpers + tests  
2. Background + speak path wiring + tests  
3. Advanced UI list  
4. Manual check: global only; one override for target lang; original vs translation use different voices

## Success criteria

- User can add e.g. `vi` → Mistral voice_id A and `en` → voice_id B (or different models/providers).
- Speak translation in `vi` uses the `vi` stack; Speak original in `en` uses the `en` stack when configured.
- Unconfigured languages keep today’s global + browser-match behavior.
- No API keys in content script or message payloads beyond existing patterns.
- Existing single-voice setups keep working with empty `languageOverrides`.

## Open follow-ups (not blocking v1)

- Per-row Test voice
- Per-language rate
- Named profiles if many languages share one stack
- Surface the same resolver anywhere else Speak is added later
