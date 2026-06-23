/**
 * Per-film proper-noun glossary — content-hash canonicalization.
 *
 * The same film must hash the same regardless of cue ordering, leading/trailing
 * whitespace, or whether voice prefixes were parsed. This is the key for the
 * persisted film glossary (services/filmGlossaryStore.ts) so a film's extracted
 * names are reused across sessions.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-per-film-proper-noun-extraction-design.md.
 */

import type { SubtitleCue } from '@/types/subtitle';

/** Strip a leading "[Speaker] " voice prefix if present (display concern, not
 *  content identity). Mirrors the prefixing added in background.ts translateChunk. */
function stripVoicePrefix(text: string): string {
  // Match "[anything]" followed by a space at the start of the line.
  return text.replace(/^\[[^\]]*\]\s*/, '');
}

/** Canonicalize the cue corpus into a stable string for hashing.
 *  Lowercases, trims, strips voice prefixes, dedupes, and sorts. */
export function canonicalizeCueCorpus(cues: SubtitleCue[]): string {
  const normalized = new Set<string>();
  for (const cue of cues) {
    // Prefer the raw cue.text (voice prefix is applied at translate time, not
    // stored in cue.text — but strip defensively in case a caller pre-prefixed).
    const text = stripVoicePrefix(cue.text).trim().toLowerCase();
    if (text) normalized.add(text);
  }
  return [...normalized].sort().join('\n');
}

/** SHA-256 (hex) of the canonicalized corpus via WebCrypto (crypto.subtle),
 *  available in service workers. Empty corpus hashes the empty string. */
export async function contentHash(cues: SubtitleCue[]): Promise<string> {
  const canonical = canonicalizeCueCorpus(cues);
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
