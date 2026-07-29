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
