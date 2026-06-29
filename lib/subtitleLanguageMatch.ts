/**
 * BCP-47 subtitle language matching.
 * Max MPD uses tags like "zh-Hans-SG" / "en-US" while settings/DOM use "zh-Hans" / "en".
 */

/** ISO 639-2 (3-letter) to ISO 639-1 (2-letter) language code mapping. */
const ISO_639_2_TO_1: Record<string, string> = {
  eng: 'en',
  zho: 'zh',
  chi: 'zh',
  fra: 'fr',
  fre: 'fr',
  deu: 'de',
  ger: 'de',
  spa: 'es',
  por: 'pt',
  rus: 'ru',
  ara: 'ar',
  hin: 'hi',
  tha: 'th',
  ita: 'it',
  nld: 'nl',
  dut: 'nl',
  pol: 'pl',
  tur: 'tr',
  ukr: 'uk',
  ind: 'id',
  msa: 'ms',
  may: 'ms',
  ces: 'cs',
  cze: 'cs',
  swe: 'sv',
  dan: 'da',
  fin: 'fi',
  ell: 'el',
  gre: 'el',
  heb: 'he',
  hun: 'hu',
  nor: 'no',
  ron: 'ro',
  rum: 'ro',
  slk: 'sk',
  slo: 'sk',
  bul: 'bg',
  hrv: 'hr',
  ben: 'bn',
  tam: 'ta',
  vie: 'vi',
};

/** Normalize a language tag for comparison (lowercase, strip region on request). */
export function normalizeSubtitleLanguage(lang: string): string {
  let normalized = lang.trim().toLowerCase().replace(/_/g, '-');
  if (ISO_639_2_TO_1[normalized]) {
    normalized = ISO_639_2_TO_1[normalized];
  } else {
    const parts = normalized.split('-');
    if (parts[0] && ISO_639_2_TO_1[parts[0]]) {
      parts[0] = ISO_639_2_TO_1[parts[0]];
      normalized = parts.join('-');
    }
  }
  return normalized;
}

/**
 * Returns true when two language tags refer to the same subtitle track.
 * Matches exact tags, primary subtags (en-US ↔ en), and script variants (zh-Hans-SG ↔ zh-Hans).
 * Does NOT match when both tags carry different script subtags (zh-Hans ↔ zh-Hant).
 */
export function subtitleLanguagesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;

  const normA = normalizeSubtitleLanguage(a);
  const normB = normalizeSubtitleLanguage(b);
  if (normA === normB) return true;

  const partsA = normA.split('-');
  const partsB = normB.split('-');

  // Script subtag is the 2nd part when it is exactly 4 chars (ISO 15924: Hans, Hant).
  const hasScriptA = partsA.length >= 2 && partsA[1].length === 4;
  const hasScriptB = partsB.length >= 2 && partsB[1].length === 4;

  // When both tags carry script subtags that differ, they are NOT the same
  // (zh-Hans ↔ zh-Hant must not match even though primary subtag is zh).
  if (hasScriptA && hasScriptB && partsA[1] !== partsB[1]) return false;

  // Primary language subtag (en-us → en)
  if (partsA[0] === partsB[0]) return true;

  // Script-inclusive prefix (zh-hans-sg ↔ zh-hans)
  if (partsA.length >= 2 && partsB.length >= 2) {
    const scriptA = `${partsA[0]}-${partsA[1]}`;
    const scriptB = `${partsB[0]}-${partsB[1]}`;
    if (scriptA === scriptB) return true;
    if (normA.startsWith(`${scriptB}-`) || normB.startsWith(`${scriptA}-`)) return true;
  }

  return false;
}