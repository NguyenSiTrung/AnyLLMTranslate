/**
 * Translation cache fingerprint (FR-6).
 *
 * Stable, local-only digest of config dimensions that change translation
 * output. Old cache keys without a fingerprint miss safely (no silent
 * cross-config hits). Subtitle keys stay on their own `subtitle:` namespace.
 */

/** Dimensions that affect web-page translation output. */
export interface CacheFingerprintInput {
  /** Provider / endpoint identity (base URL or preset id). */
  providerEndpoint?: string;
  /** Model id. */
  model?: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Effective system/user prompt version or hash. */
  promptVersion?: string;
  /** Glossary + term-memory content hash (precomputed). */
  glossaryHash?: string;
  /** Category / context-aware mode key. */
  categoryMode?: string;
  /** Temperature (rounded) when non-default. */
  temperature?: number;
  /** Rich-translation format version (e.g. "rich-v1"). */
  richFormatVersion?: string;
}

/** Canonical string used as the fingerprint payload (stable field order). */
export function buildFingerprintPayload(input: CacheFingerprintInput): string {
  const temp =
    typeof input.temperature === 'number' && Number.isFinite(input.temperature)
      ? String(Math.round(input.temperature * 1000) / 1000)
      : '';
  return [
    input.providerEndpoint ?? '',
    input.model ?? '',
    input.sourceLanguage,
    input.targetLanguage,
    input.promptVersion ?? '',
    input.glossaryHash ?? '',
    input.categoryMode ?? '',
    temp,
    input.richFormatVersion ?? '',
  ].join('|');
}

/** Synchronous FNV-1a 32-bit hex — enough for small config strings. */
export function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compact fingerprint token for cache keys.
 * Empty when only languages are set and no optional dims — callers may still
 * pass languages via the main key path for backward compatibility.
 */
export function computeCacheFingerprint(input: CacheFingerprintInput): string {
  const payload = buildFingerprintPayload(input);
  // Languages alone are already in the legacy key; only add a fingerprint
  // segment when at least one optional dimension is present.
  const hasOptional =
    Boolean(input.providerEndpoint) ||
    Boolean(input.model) ||
    Boolean(input.promptVersion) ||
    Boolean(input.glossaryHash) ||
    Boolean(input.categoryMode) ||
    (typeof input.temperature === 'number' && Number.isFinite(input.temperature)) ||
    Boolean(input.richFormatVersion);
  if (!hasOptional) return '';
  return fnv1aHex(payload);
}

/**
 * Hash glossary/term-memory entries for the fingerprint.
 * Order-normalized so insertion order does not thrash the cache.
 */
export function hashGlossaryContent(
  entries: Array<{ source: string; target: string }> | string[] | string | undefined,
): string {
  if (entries === undefined || entries === null) return '';
  if (typeof entries === 'string') {
    return entries.trim() ? fnv1aHex(entries.trim()) : '';
  }
  if (entries.length === 0) return '';
  if (typeof entries[0] === 'string') {
    const sorted = [...(entries as string[])].map((s) => s.trim()).filter(Boolean).sort();
    return sorted.length ? fnv1aHex(sorted.join('\n')) : '';
  }
  const pairs = (entries as Array<{ source: string; target: string }>)
    .map((e) => `${e.source.trim()}=>${e.target.trim()}`)
    .filter((s) => s !== '=>')
    .sort();
  return pairs.length ? fnv1aHex(pairs.join('\n')) : '';
}
