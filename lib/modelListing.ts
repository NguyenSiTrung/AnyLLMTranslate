/**
 * Pure helpers for OpenAI-compatible GET /models listing:
 * parse response shapes, filter ids, and build paginated URLs.
 */

/** Safety cap so a buggy has_more never loops forever. */
export const MAX_MODEL_LIST_PAGES = 20;

export interface ParsedModelsList {
  ids: string[];
  hasMore: boolean;
  lastId?: string;
}

function extractIds(items: unknown[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item && typeof item === 'object' && 'id' in item) {
      const id = (item as { id: unknown }).id;
      if (typeof id === 'string' && id.length > 0) {
        ids.push(id);
      }
    }
  }
  return ids;
}

/**
 * Normalize common OpenAI-compatible /models JSON shapes into ids + pagination hints.
 */
export function parseModelsListResponse(body: unknown): ParsedModelsList {
  if (Array.isArray(body)) {
    const ids = extractIds(body);
    return { ids, hasMore: false, lastId: ids[ids.length - 1] };
  }

  if (!body || typeof body !== 'object') {
    return { ids: [], hasMore: false };
  }

  const record = body as Record<string, unknown>;
  const data = Array.isArray(record.data) ? record.data : [];
  const ids = extractIds(data);
  const hasMore = record.has_more === true;
  const lastIdFromField =
    typeof record.last_id === 'string' && record.last_id.length > 0
      ? record.last_id
      : undefined;
  const lastId = lastIdFromField ?? ids[ids.length - 1];

  return { ids, hasMore, lastId };
}

/** Case-insensitive substring filter over model ids. Empty query returns all. */
export function filterModelIds(ids: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return ids;
  return ids.filter((id) => id.toLowerCase().includes(q));
}

/** Build GET …/models URL, optionally with OpenAI-style `after` cursor. */
export function buildModelsListUrl(baseUrl: string, after?: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  const url = `${root}/models`;
  if (!after) return url;
  return `${url}?after=${encodeURIComponent(after)}`;
}
