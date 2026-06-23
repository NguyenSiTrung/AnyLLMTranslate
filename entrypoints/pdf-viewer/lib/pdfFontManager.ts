import { get, set, del } from 'idb-keyval';

export interface FontProgress {
  bytesLoaded: number;
  bytesTotal: number;
}

const CACHE_KEY = 'pdf-font:noto-sans:v1';

/**
 * Hardcoded TTF URL for Noto Sans from Google Fonts' gstatic CDN.
 *
 * Google Fonts CSS API (https://fonts.googleapis.com/css2?family=Noto+Sans)
 * returns a stylesheet with the current TTF URL, but fetching CSS at runtime
 * adds latency and a parsing step. This URL is pinned to a specific version
 * (v39) for reproducibility. If it goes stale, update it by visiting the
 * CSS API URL in a browser and copying the `src: url(...)` TTF link.
 */
const NOTO_SANS_TTF_URL =
  'https://fonts.gstatic.com/s/notosans/v39/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A-9a6Vc.ttf';

/**
 * Get font bytes — checks IndexedDB cache first, falls back to CDN fetch.
 */
export async function getFont(
  onProgress?: (progress: FontProgress) => void,
): Promise<Uint8Array> {
  const cached = await get(CACHE_KEY);
  if (cached instanceof Uint8Array) {
    return cached;
  }
  if (cached instanceof ArrayBuffer) {
    return new Uint8Array(cached);
  }

  const response = await fetch(NOTO_SANS_TTF_URL);
  if (!response.ok) {
    throw new Error(`Font download failed: ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Font download: no readable stream');
  }

  const chunks: Uint8Array[] = [];
  let bytesLoaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytesLoaded += value.byteLength;
    onProgress?.({ bytesLoaded, bytesTotal: contentLength });
  }

  const result = new Uint8Array(bytesLoaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  await set(CACHE_KEY, result);
  return result;
}

/**
 * Clear the cached font from IndexedDB.
 */
export async function clearFontCache(): Promise<void> {
  await del(CACHE_KEY);
}
