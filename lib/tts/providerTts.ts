/**
 * OpenAI-compatible + Mistral Voxtral TTS fetch (background-only — holds API keys).
 */

import {
  speechEndpointFromBaseUrl,
  type TtsCredentialPick,
} from './resolveTtsBackend';

/** OpenAI TTS input hard limit is 4096 characters. */
export const TTS_MAX_INPUT_CHARS = 4096;

/** Canonical Mistral Voxtral Mini TTS model id (docs / playground). */
export const MISTRAL_VOXTRAL_MINI_TTS_MODEL = 'voxtral-mini-tts-2603';

export interface ProviderTtsSuccess {
  success: true;
  audioBase64: string;
  mimeType: string;
}

export interface ProviderTtsFailure {
  success: false;
  error: string;
}

export type ProviderTtsResult = ProviderTtsSuccess | ProviderTtsFailure;

export type TtsProviderDialect = 'openai' | 'mistral';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function hostnameOf(baseUrl: string): string {
  try {
    return new URL(baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`)
      .hostname
      .toLowerCase();
  } catch {
    return '';
  }
}

/** True for api.mistral.ai (and regional mistral hosts). */
export function isMistralTtsHost(baseUrl: string): boolean {
  const host = hostnameOf(baseUrl);
  if (!host) return false;
  return host === 'api.mistral.ai' || host.endsWith('.mistral.ai');
}

/**
 * Detect speech API dialect from base URL and/or model id.
 * Voxtral model ids force Mistral dialect even on custom proxies.
 */
export function detectTtsDialect(
  baseUrl: string,
  model: string,
): TtsProviderDialect {
  const m = model.trim().toLowerCase();
  if (m.includes('voxtral') || m.startsWith('mistral-tts')) return 'mistral';
  if (isMistralTtsHost(baseUrl)) return 'mistral';
  return 'openai';
}

/**
 * Normalize common user typos / alias model ids for Mistral Voxtral.
 * Leaves unknown ids unchanged.
 */
export function normalizeMistralTtsModel(model: string): string {
  const raw = model.trim();
  const key = raw.toLowerCase().replace(/_/g, '-');
  if (!key) return raw;
  if (
    key === 'voxtral-mini-tts-latest' ||
    key === 'voxtral-mini-tts-lastest' ||
    key === 'voxtral-mini-tts' ||
    key === 'voxtral-tts-latest' ||
    key === 'voxtral-tts'
  ) {
    return MISTRAL_VOXTRAL_MINI_TTS_MODEL;
  }
  return raw;
}

function mimeForResponseFormat(format: string): string {
  switch (format) {
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'opus':
      return 'audio/ogg';
    case 'pcm':
      return 'audio/pcm';
    case 'mp3':
    default:
      return 'audio/mpeg';
  }
}

function extractErrorDetail(payload: unknown, fallbackText: string): string {
  if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>;
    const err = rec.error;
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (err && typeof err === 'object') {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    }
    const message = rec.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    const detail = rec.detail;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
  }
  return fallbackText.slice(0, 200);
}

function extractMistralAudioBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;
  for (const key of ['audio_data', 'audioData', 'audio'] as const) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Call provider speech endpoint and return base64 audio.
 * - OpenAI-style: POST body uses `voice` + raw audio bytes
 * - Mistral Voxtral: POST body uses `voice_id` + JSON `{ audio_data }`
 */
export async function fetchProviderSpeech(
  text: string,
  creds: TtsCredentialPick,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderTtsResult> {
  const input = text.trim().slice(0, TTS_MAX_INPUT_CHARS);
  if (!input) {
    return { success: false, error: 'Nothing to speak' };
  }

  let model = (creds.model ?? '').trim();
  if (!model) {
    return {
      success: false,
      error: 'TTS model is not set (Settings → Advanced → Speech)',
    };
  }

  const dialect = detectTtsDialect(creds.baseUrl, model);
  if (dialect === 'mistral') {
    model = normalizeMistralTtsModel(model);
  }

  const voice = (creds.voice ?? '').trim();
  if (dialect === 'mistral' && !voice) {
    return {
      success: false,
      error:
        'Mistral Voxtral requires a voice_id. Enable “Show voice field” in Settings → Advanced → Speech and paste a voice id from Mistral Console (Audio → Voices), or create a voice there first.',
    };
  }

  const url = speechEndpointFromBaseUrl(creds.baseUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (creds.apiKey) {
    headers.Authorization = `Bearer ${creds.apiKey}`;
  }

  const body: Record<string, unknown> =
    dialect === 'mistral'
      ? {
          model,
          input,
          voice_id: voice,
          response_format: 'mp3',
          stream: false,
        }
      : {
          model,
          input,
          speed: creds.rate,
          response_format: 'mp3',
          ...(voice ? { voice } : {}),
        };

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      let rawText = '';
      try {
        rawText = await res.text();
        try {
          detail = extractErrorDetail(JSON.parse(rawText) as unknown, rawText);
        } catch {
          detail = rawText.slice(0, 200);
        }
      } catch {
        detail = '';
      }

      let error = detail
        ? `TTS provider error (${res.status}): ${detail}`
        : `TTS provider error (${res.status})`;

      if (res.status === 404 && dialect === 'mistral') {
        error +=
          ` · Check model id (try ${MISTRAL_VOXTRAL_MINI_TTS_MODEL}), base URL (https://api.mistral.ai/v1), and that Voxtral TTS is enabled on your Mistral account.`;
      } else if (res.status === 404) {
        error +=
          ' · Endpoint not found. Confirm the host supports OpenAI-compatible POST /v1/audio/speech.';
      }

      return { success: false, error };
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    // Mistral (and some proxies) return JSON with base64 audio_data.
    if (contentType.includes('application/json') || dialect === 'mistral') {
      // Peek: if JSON, parse; if binary slipped through, fall through.
      const buf = await res.arrayBuffer();
      const asText = new TextDecoder().decode(buf);
      const trimmed = asText.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        let json: unknown;
        try {
          json = JSON.parse(trimmed);
        } catch {
          return {
            success: false,
            error: 'TTS provider returned invalid JSON audio payload',
          };
        }
        const audioBase64 = extractMistralAudioBase64(json);
        if (!audioBase64) {
          return {
            success: false,
            error:
              'TTS provider JSON response missing audio_data (Mistral Voxtral expects base64 audio_data)',
          };
        }
        return {
          success: true,
          audioBase64,
          mimeType: mimeForResponseFormat('mp3'),
        };
      }
      // Not JSON — treat as raw audio bytes
      if (!buf.byteLength) {
        return { success: false, error: 'TTS provider returned empty audio' };
      }
      return {
        success: true,
        audioBase64: arrayBufferToBase64(buf),
        mimeType: contentType.split(';')[0].trim() || 'audio/mpeg',
      };
    }

    const buf = await res.arrayBuffer();
    if (!buf.byteLength) {
      return { success: false, error: 'TTS provider returned empty audio' };
    }

    const mimeType = res.headers.get('content-type') || 'audio/mpeg';
    return {
      success: true,
      audioBase64: arrayBufferToBase64(buf),
      mimeType: mimeType.split(';')[0].trim() || 'audio/mpeg',
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'TTS network error',
    };
  }
}
