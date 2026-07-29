/**
 * List TTS voices from OpenAI-compatible / Mistral GET …/audio/voices.
 * Used by Options → Advanced → Speech (Load voices).
 */

export interface TtsVoiceChoice {
  /** Value written to settings.tts.voice (OpenAI name or Mistral voice_id). */
  id: string;
  /** Optional display label (name · id). */
  label: string;
}

export interface ListTtsVoicesResult {
  success: boolean;
  voices: TtsVoiceChoice[];
  error?: string;
  latencyMs: number;
}

/** Build GET voices URL from a chat/TTS base URL (…/v1). */
export function voicesEndpointFromBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/audio/voices')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/audio/voices`;
  if (trimmed.endsWith('/audio/speech')) {
    return trimmed.replace(/\/audio\/speech$/, '/audio/voices');
  }
  return `${trimmed}/v1/audio/voices`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function pickString(rec: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * Normalize common voice-list JSON shapes into id/label pairs.
 * Supports Mistral `{ items: [{ id, name }] }` and generic arrays.
 */
export function parseTtsVoicesResponse(body: unknown): TtsVoiceChoice[] {
  const out: TtsVoiceChoice[] = [];
  const seen = new Set<string>();

  const push = (id: string, label?: string) => {
    const cleanId = id.trim();
    if (!cleanId || seen.has(cleanId)) return;
    seen.add(cleanId);
    const cleanLabel = (label ?? '').trim();
    out.push({
      id: cleanId,
      label: cleanLabel && cleanLabel !== cleanId ? `${cleanLabel} · ${cleanId}` : cleanId,
    });
  };

  const consumeList = (list: unknown[]) => {
    for (const item of list) {
      if (typeof item === 'string') {
        push(item);
        continue;
      }
      const rec = asRecord(item);
      if (!rec) continue;
      const id = pickString(rec, ['id', 'voice_id', 'voiceId', 'voice', 'name', 'slug']);
      if (!id) continue;
      const name = pickString(rec, ['name', 'display_name', 'displayName', 'slug', 'label']);
      push(id, name && name !== id ? name : undefined);
    }
  };

  if (Array.isArray(body)) {
    consumeList(body);
    return out;
  }

  const root = asRecord(body);
  if (!root) return out;

  for (const key of ['items', 'data', 'voices', 'results'] as const) {
    const list = root[key];
    if (Array.isArray(list)) {
      consumeList(list);
      if (out.length > 0) return out;
    }
  }

  return out;
}

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

/**
 * GET {baseUrl}/audio/voices (paginated via offset when total_pages > 1).
 */
export async function listTtsVoices(
  config: { baseUrl: string; apiKey?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ListTtsVoicesResult> {
  const start = performance.now();
  const base = (config.baseUrl ?? '').trim();
  if (!base) {
    return {
      success: false,
      voices: [],
      error: 'TTS base URL is empty',
      latencyMs: 0,
    };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const apiKey = (config.apiKey ?? '').trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const endpoint = voicesEndpointFromBaseUrl(base);
  const all: TtsVoiceChoice[] = [];
  const seen = new Set<string>();

  try {
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(endpoint);
      url.searchParams.set('limit', String(PAGE_LIMIT));
      url.searchParams.set('offset', String(offset));
      // Mistral: all | preset | custom
      url.searchParams.set('type', 'all');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let res: Response;
      try {
        res = await fetchImpl(url.toString(), {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        let detail = '';
        try {
          const text = await res.text();
          try {
            const j = JSON.parse(text) as { detail?: string; error?: { message?: string } | string };
            if (typeof j.detail === 'string') detail = j.detail;
            else if (typeof j.error === 'string') detail = j.error;
            else if (j.error && typeof j.error === 'object' && j.error.message) {
              detail = j.error.message;
            } else detail = text.slice(0, 200);
          } catch {
            detail = text.slice(0, 200);
          }
        } catch {
          detail = '';
        }
        return {
          success: false,
          voices: [],
          error: detail
            ? `Voice list failed (${res.status}): ${detail}`
            : `Voice list failed (${res.status})`,
          latencyMs: Math.round(performance.now() - start),
        };
      }

      const json: unknown = await res.json();
      const pageVoices = parseTtsVoicesResponse(json);
      for (const v of pageVoices) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        all.push(v);
      }

      const root = asRecord(json);
      const totalPages =
        root && typeof root.total_pages === 'number' ? root.total_pages : undefined;
      const pageSize =
        root && typeof root.page_size === 'number'
          ? root.page_size
          : PAGE_LIMIT;
      const currentPage = root && typeof root.page === 'number' ? root.page : page;

      if (totalPages != null && currentPage + 1 >= totalPages) break;
      if (pageVoices.length === 0) break;
      if (pageVoices.length < pageSize && totalPages == null) break;
      offset += pageSize;
    }

    return {
      success: true,
      voices: all,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (e) {
    return {
      success: false,
      voices: [],
      error: e instanceof Error ? e.message : 'Voice list network error',
      latencyMs: Math.round(performance.now() - start),
    };
  }
}
