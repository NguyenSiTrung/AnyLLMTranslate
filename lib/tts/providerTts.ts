/**
 * OpenAI-compatible TTS fetch (background-only — holds API keys).
 */

import {
  speechEndpointFromBaseUrl,
  type TtsCredentialPick,
} from './resolveTtsBackend';

/** OpenAI TTS input hard limit is 4096 characters. */
export const TTS_MAX_INPUT_CHARS = 4096;

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Call OpenAI-compatible POST /audio/speech and return base64 audio.
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

  const model = (creds.model ?? '').trim();
  if (!model) {
    return {
      success: false,
      error: 'TTS model is not set (Settings → Advanced → Speech)',
    };
  }

  const voice = (creds.voice ?? '').trim();

  const url = speechEndpointFromBaseUrl(creds.baseUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (creds.apiKey) {
    headers.Authorization = `Bearer ${creds.apiKey}`;
  }

  const body: Record<string, unknown> = {
    model,
    input,
    speed: creds.rate,
    response_format: 'mp3',
  };
  if (voice) {
    body.voice = voice;
  }

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const errJson = (await res.json()) as { error?: { message?: string } };
        detail = errJson?.error?.message ?? '';
      } catch {
        try {
          detail = (await res.text()).slice(0, 200);
        } catch {
          detail = '';
        }
      }
      return {
        success: false,
        error: detail
          ? `TTS provider error (${res.status}): ${detail}`
          : `TTS provider error (${res.status})`,
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
