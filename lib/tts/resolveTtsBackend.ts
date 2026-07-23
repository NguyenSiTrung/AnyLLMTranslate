/**
 * Pure TTS backend resolution for selection Speak.
 */

import type { ExtensionSettings, TtsSettings } from '@/types/config';
import { DEFAULT_TTS_SETTINGS } from '@/types/config';

export type ResolvedTtsBackend = 'browser' | 'provider' | 'disabled';

export function mergeTtsSettings(partial?: Partial<TtsSettings> | null): TtsSettings {
  return {
    ...DEFAULT_TTS_SETTINGS,
    ...(partial ?? {}),
  };
}

/**
 * Whether the settings pool has usable credentials for OpenAI-compatible TTS.
 * Prefers first enabled provider with a non-empty enabled key (or no key required).
 */
export function hasProviderTtsCredentials(settings: ExtensionSettings): boolean {
  const providers = settings.providers ?? [];
  for (const p of providers) {
    if (!p.enabled) continue;
    const baseUrl = (p.baseUrl ?? '').trim();
    if (!baseUrl) continue;
    const keys = (p.keys ?? []).filter((k) => k.enabled);
    if (keys.length === 0) continue;
    if (!p.requiresApiKey) return true;
    if (keys.some((k) => (k.apiKey ?? '').trim().length > 0)) return true;
  }
  // Legacy single provider
  const legacy = settings.provider;
  if (legacy?.baseUrl?.trim()) {
    if (!legacy.requiresApiKey) return true;
    if ((legacy.apiKey ?? '').trim().length > 0) return true;
  }
  return false;
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

export interface TtsCredentialPick {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  rate: number;
}

/** Pick base URL + API key from pool (or legacy provider) for TTS. */
export function pickTtsCredentials(settings: ExtensionSettings): TtsCredentialPick | null {
  const tts = mergeTtsSettings(settings.tts);
  const model = (tts.model || DEFAULT_TTS_SETTINGS.model).trim();
  const voice = (tts.voice || DEFAULT_TTS_SETTINGS.voice).trim();
  const rate = clampRate(tts.rate);

  const providers = settings.providers ?? [];
  for (const p of providers) {
    if (!p.enabled) continue;
    const baseUrl = (p.baseUrl ?? '').trim().replace(/\/+$/, '');
    if (!baseUrl) continue;
    const keys = (p.keys ?? []).filter((k) => k.enabled);
    for (const k of keys) {
      const apiKey = (k.apiKey ?? '').trim();
      if (p.requiresApiKey && !apiKey) continue;
      return { baseUrl, apiKey, model, voice, rate };
    }
  }

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

export function clampRate(rate: number | undefined): number {
  const n = typeof rate === 'number' && Number.isFinite(rate) ? rate : 1;
  return Math.min(2, Math.max(0.5, n));
}

/** OpenAI-compatible speech endpoint from a chat-completions base URL. */
export function speechEndpointFromBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/audio/speech')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/audio/speech`;
  return `${trimmed}/v1/audio/speech`;
}
