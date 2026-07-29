/**
 * Pure TTS backend resolution for selection Speak.
 */

import type {
  ExtensionSettings,
  PoolProvider,
  TtsLanguageOverride,
  TtsSettings,
} from '@/types/config';
import { DEFAULT_TTS_SETTINGS } from '@/types/config';

export type ResolvedTtsBackend = 'browser' | 'provider' | 'disabled';

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

export interface TtsCredentialPick {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  rate: number;
}

export function clampRate(rate: number | undefined): number {
  const n = typeof rate === 'number' && Number.isFinite(rate) ? rate : 1;
  return Math.min(2, Math.max(0.5, n));
}

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

function hostnameOfBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`)
      .hostname
      .toLowerCase();
  } catch {
    return '';
  }
}

/** OpenAI-compatible speech hosts that commonly expect a `voice` field. */
export function isOpenAiStyleTtsHost(baseUrl: string): boolean {
  const host = hostnameOfBaseUrl(baseUrl);
  if (!host) return false;
  if (host === 'api.openai.com') return true;
  if (host === 'openai.com' || host.endsWith('.openai.com')) return true;
  if (host.endsWith('.openai.azure.com')) return true;
  return false;
}

/** Mistral hosts need a `voice_id` (shown in UI as the Voice field). */
export function isMistralStyleTtsHost(baseUrl: string): boolean {
  const host = hostnameOfBaseUrl(baseUrl);
  if (!host) return false;
  return host === 'api.mistral.ai' || host.endsWith('.mistral.ai');
}

/**
 * Show the Voice field when the user opts in, or the host needs a voice id
 * (OpenAI `voice` or Mistral `voice_id`).
 */
export function shouldOfferVoiceField(tts: TtsSettings, baseUrl: string): boolean {
  if (tts.showVoiceField) return true;
  if (isOpenAiStyleTtsHost(baseUrl)) return true;
  if (isMistralStyleTtsHost(baseUrl)) return true;
  // Voxtral model ids force voice UI even on custom/proxy base URLs.
  const model = (tts.model || '').toLowerCase();
  if (model.includes('voxtral')) return true;
  return false;
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
  model: string,
  voice: string,
  rate: number,
): TtsCredentialPick | null {
  const tts = mergeTtsSettings(settings.tts);
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
    const ttsForPick: TtsSettings = { ...tts, model, voice, rate };
    if (explicitId) {
      const match = providers.find((p) => p.id === explicitId);
      if (!match || !match.enabled) return null;
      return pickFromProvider(match, ttsForPick);
    }
    for (const p of providers) {
      if (!p.enabled) continue;
      const picked = pickFromProvider(p, ttsForPick);
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

  const model = (override.model ?? '').trim() || (tts.model || '').trim();
  const voice = (override.voice ?? '').trim() || (tts.voice || '').trim();
  const rate = clampRate(tts.rate);

  let pick: TtsCredentialPick | null = null;
  if (override.credentialSource === 'custom' || override.credentialSource === 'pool') {
    pick = pickFromOverrideCredentials(settings, override, model, voice, rate);
  }

  if (!pick) {
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
