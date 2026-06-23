/**
 * Subtitle context-aware cache key — PURE module.
 *
 * The subtitle path needs a cache key that folds in everything that changes the
 * translation OUTPUT: the resolved profile/knobs and the glossary state. The
 * generic web-page key (`SHA-256(src:tgt:text)` in services/cacheManager.ts)
 * is intentionally NOT modified — web/selection/PDF keep byte-identical keys.
 * Subtitle keys are namespaced with a `subtitle:` prefix so they never collide
 * with web-path entries.
 *
 * No I/O beyond crypto.subtle (already used by cacheManager). No DOM.
 */
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

export interface GlossarySnapshot {
  /** User global glossary entries (source→target) relevant to the chunk. */
  globalEntries: Array<{ source: string; target: string }>;
  /** Rolling + film proper-noun glossary names. Order is normalized before hashing. */
  properNouns: string[];
}

const encoder = new TextEncoder();

/** Hex SHA-256 of an arbitrary string. */
async function sha256Hex(input: string): Promise<string> {
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stable hex hash of resolved ProfileKnobs. Keyed on the four knob fields in a
 * fixed order so different knob values always produce different hashes.
 */
export function hashKnobs(knobs: ProfileKnobs): string {
  // Synchronous FNV-1a is enough for a tiny fixed string — no need to await
  // crypto.subtle for a sub-100-char input. Deterministic and collision-safe
  // for the small knob vocabulary.
  const s = `${knobs.register}|${knobs.faithfulness}|${knobs.brevity}|${knobs.profanity}`;
  return fnv1aHex(s);
}

/**
 * Stable hex hash of a glossary snapshot. Both globalEntries and properNouns
 * are sorted before hashing, so entry order does not affect the key.
 */
export function hashGlossary(snapshot: GlossarySnapshot): string {
  const globalSorted = [...snapshot.globalEntries]
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))
    .map((e) => `${e.source}=>${e.target}`)
    .join(';');
  const nounsSorted = [...snapshot.properNouns].sort().join(';');
  return fnv1aHex(`${globalSorted}|${nounsSorted}`);
}

/**
 * Full subtitle cache key: SHA-256('subtitle:' + src + ':' + tgt + ':' + text
 * + ':' + knobsHash + ':' + glossaryHash). The 'subtitle:' namespace prefix
 * isolates these entries from web-path cache slots.
 */
export async function generateSubtitleCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  knobs: ProfileKnobs,
  glossarySnapshot: GlossarySnapshot,
): Promise<string> {
  const knobsHash = hashKnobs(knobs);
  const glossaryHash = hashGlossary(glossarySnapshot);
  const input = `subtitle:${sourceLanguage}:${targetLanguage}:${text}:${knobsHash}:${glossaryHash}`;
  return sha256Hex(input);
}

/** 32-bit FNV-1a → 8-hex-char string. Deterministic, fast, sufficient for short inputs. */
function fnv1aHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned and zero-pad to 8 hex chars.
  return (h >>> 0).toString(16).padStart(8, '0');
}
