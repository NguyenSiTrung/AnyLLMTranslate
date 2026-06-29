/**
 * BCP-47 subtitle language matching.
 * Max MPD uses tags like "zh-Hans-SG" / "en-US" while settings/DOM use "zh-Hans" / "en".
 */

/** Normalize a language tag for comparison (lowercase, strip region on request). */
export function normalizeSubtitleLanguage(lang: string): string {
  return lang.trim().toLowerCase().replace(/_/g, '-');
}

/**
 * Returns true when two language tags refer to the same subtitle track.
 * Matches exact tags, primary subtags (en-US ↔ en), and script variants (zh-Hans-SG ↔ zh-Hans).
 */
export function subtitleLanguagesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;

  const normA = normalizeSubtitleLanguage(a);
  const normB = normalizeSubtitleLanguage(b);
  if (normA === normB) return true;

  // Primary language subtag (en-us → en)
  const primaryA = normA.split('-')[0];
  const primaryB = normB.split('-')[0];
  if (primaryA === primaryB) return true;

  // Script-inclusive prefix (zh-hans-sg ↔ zh-hans)
  const partsA = normA.split('-');
  const partsB = normB.split('-');
  if (partsA.length >= 2 && partsB.length >= 2) {
    const scriptA = `${partsA[0]}-${partsA[1]}`;
    const scriptB = `${partsB[0]}-${partsB[1]}`;
    if (scriptA === scriptB) return true;
    if (normA.startsWith(`${scriptB}-`) || normB.startsWith(`${scriptA}-`)) return true;
  }

  return false;
}