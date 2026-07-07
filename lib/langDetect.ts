/**
 * Client-side source-language detection (FR-3).
 *
 * Script-range heuristics give strong signals for non-Latin scripts (CJK,
 * Hangul, Kana, Cyrillic, Arabic, Hebrew, Devanagari, Thai). Latin-script
 * languages are scored via common-stopword n-gram matching for a small set
 * (en, vi, es, fr, de, pt) plus Vietnamese diacritic detection.
 *
 * Intentionally lightweight (< 1ms per piece) — no WASM/CLD3. Used by the
 * web-page source-language gate to skip LLM calls when a piece is already in
 * the target language.
 */

export interface DetectionResult {
  /** BCP-47 primary subtag ('zh', 'en', 'vi', …) or null if undetermined. */
  lang: string | null;
  /** 0–1 confidence. Script-range matches are ≥ 0.9; Latin n-gram is lower. */
  confidence: number;
}

interface ScriptRule {
  /** Test: does this char belong to the script? */
  test: (code: number) => boolean;
  /** Detected language. */
  lang: string;
}

// Unicode code-point ranges for strong-signal scripts.
const SCRIPT_RULES: ScriptRule[] = [
  // Hiragana + Katakana → Japanese (check before CJK Han, since ja text mixes).
  { lang: 'ja', test: (c) => (c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff) },
  // Hangul Syllables + Jamo → Korean.
  { lang: 'ko', test: (c) => (c >= 0xac00 && c <= 0xd7a3) || (c >= 0x1100 && c <= 0x11ff) || (c >= 0x3130 && c <= 0x318f) },
  // CJK Unified Ideographs + Extensions A → Chinese.
  { lang: 'zh', test: (c) => (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) },
  // Cyrillic → Russian (most common Cyrillic user of this extension).
  { lang: 'ru', test: (c) => c >= 0x0400 && c <= 0x04ff },
  // Arabic → Arabic.
  { lang: 'ar', test: (c) => c >= 0x0600 && c <= 0x06ff },
  // Hebrew → Hebrew.
  { lang: 'he', test: (c) => c >= 0x0590 && c <= 0x05ff },
  // Thai → Thai.
  { lang: 'th', test: (c) => c >= 0x0e00 && c <= 0x0e7f },
  // Devanagari → Hindi.
  { lang: 'hi', test: (c) => c >= 0x0900 && c <= 0x097f },
];

// Latin-script stopword sets (lowercased). Scored as n-grams: count of
// stopword tokens present in the input. The language with the highest count
// wins; confidence scales with the ratio of stopword tokens to total tokens.
const LATIN_STOPWORDS: Record<string, Set<string>> = {
  en: new Set(['the', 'and', 'is', 'are', 'was', 'were', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'with', 'you', 'i', 'it', 'this', 'that', 'be', 'have', 'has', 'not', 'but', 'or', 'as', 'at', 'by', 'from', 'they', 'we', 'he', 'she']),
  es: new Set(['el', 'la', 'los', 'las', 'de', 'y', 'es', 'en', 'un', 'una', 'que', 'con', 'por', 'para', 'no', 'se', 'lo', 'como', 'más', 'su', 'al', 'del', 'está', 'son', 'pero', 'muy']),
  fr: new Set(['le', 'la', 'les', 'de', 'et', 'est', 'en', 'un', 'une', 'que', 'avec', 'pour', 'par', 'pas', 'ne', 'ce', 'se', 'qui', 'dans', 'sur', 'au', 'des', 'son', 'mais', 'vous', 'nous']),
  de: new Set(['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'von', 'mit', 'zu', 'den', 'dem', 'nicht', 'auf', 'für', 'im', 'sich', 'auch', 'als', 'wie', 'wir', 'sie', 'ich', 'es', 'dir', 'mich', 'dich', 'war', 'hat', 'haben', 'heute', 'morgen', 'welt', 'geht', 'gefallen', 'noch', 'schon', 'wenn', 'dann', 'nur', 'wieder']),
  pt: new Set(['o', 'a', 'os', 'as', 'de', 'e', 'é', 'em', 'um', 'uma', 'que', 'com', 'por', 'para', 'não', 'se', 'como', 'mais', 'seu', 'ao', 'dos', 'das', 'está', 'mas', 'muito']),
};

// Vietnamese-specific letters that Spanish/Portuguese/French do NOT use:
// ă/Ă, ơ/Ơ, ư/Ư, đ/Đ, and the hook/horn + tone-marked vowels (ả ẵ ỗ ứ ự …).
// These are strong differentiators; shared diacritics (á é í ó ú â ê ô) are
// intentionally excluded since they appear in es/pt/fr too.
const VI_UNIQUE_LETTER_RE = /[ăĂơƠưƯđĐảẢẵẴỗỖứỨựỰẳẲẳẴẫẴặẶẳẲẩẨẫẪấẤậẬềỂểỄếẾệỆỉỈĩĨịỊỏỎỗỖốỐộỘờỜởỞỡỠớỚợỢủỦũŨụỤừỪửỬữỮứỨựỰỷỶỹỸýÝỵỴặẶẩẨẫẪấẤậẬ]/;

function countScriptChars(text: string): { lang: string; ratio: number; total: number } | null {
  let total = 0;
  const counts = new Map<string, number>();
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    // Count letters only (ignore digits/punct/whitespace) toward the denominator.
    if (!/\p{L}/u.test(ch)) continue;
    total++;
    for (const rule of SCRIPT_RULES) {
      if (rule.test(code)) {
        counts.set(rule.lang, (counts.get(rule.lang) ?? 0) + 1);
        break;
      }
    }
  }
  if (total === 0) return null;
  let bestLang: string | null = null;
  let bestCount = 0;
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestLang = lang;
    }
  }
  if (!bestLang || bestCount === 0) return null;
  return { lang: bestLang, ratio: bestCount / total, total };
}

function detectLatin(text: string): DetectionResult {
  // Normalize to lowercase word tokens.
  const tokens = text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
  if (tokens.length === 0) return { lang: null, confidence: 0 };

  // Vietnamese fast-path: if uniquely-Vietnamese letters (ă/ơ/ư/đ + hook/horn
  // tone marks) appear, classify as vi — these don't occur in es/pt/fr/de.
  const viHits = (text.match(new RegExp(VI_UNIQUE_LETTER_RE, 'g')) ?? []).length;
  if (viHits >= 1) {
    return { lang: 'vi', confidence: Math.min(0.9, 0.5 + viHits / Math.max(1, tokens.length)) };
  }

  // Portuguese tilde (ã/õ) fast-path — ã/õ are unique to Portuguese among the
  // candidate Latin languages here.
  const ptHits = (text.match(/[ãõÃÕ]/g) ?? []).length;
  if (ptHits >= 1) {
    return { lang: 'pt', confidence: Math.min(0.9, 0.5 + ptHits / Math.max(1, tokens.length)) };
  }

  // German umlaut + ß fast-path — ü/ö/ä/ß are unique to German among candidates.
  const deHits = (text.match(/[üöäÜÖÄß]/g) ?? []).length;
  if (deHits >= 1) {
    return { lang: 'de', confidence: Math.min(0.9, 0.5 + deHits / Math.max(1, tokens.length)) };
  }

  // Stopword n-gram scoring across the candidate Latin languages.
  let bestLang: string | null = null;
  let bestHits = 0;
  for (const [lang, stopset] of Object.entries(LATIN_STOPWORDS)) {
    let hits = 0;
    for (const tok of tokens) {
      if (stopset.has(tok)) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestLang = lang;
    }
  }
  if (!bestLang || bestHits === 0) return { lang: null, confidence: 0 };
  // Confidence scales with the stopword hit ratio; capped below script-signal
  // confidence since n-gram heuristics are weaker.
  const confidence = Math.min(0.85, 0.3 + bestHits / tokens.length);
  return { lang: bestLang, confidence };
}

/**
 * Detect the dominant language of `text`. Script-range signals dominate when
 * present (non-Latin); Latin-script text falls back to stopword n-gram scoring.
 */
export function detectLanguage(text: string): DetectionResult {
  if (!text || !text.trim()) return { lang: null, confidence: 0 };

  // Strong script-signal path.
  const script = countScriptChars(text);
  if (script && script.ratio >= 0.3) {
    return { lang: script.lang, confidence: Math.min(0.99, 0.6 + script.ratio * 0.4) };
  }

  // Latin n-gram path.
  return detectLatin(text);
}

/**
 * Compare two BCP-47-ish codes for primary-subtag equality (zh-Hans ≈ zh).
 * `auto` is never the same as anything (it forces detection elsewhere).
 * Null/undefined inputs never match.
 */
export function isSameLanguage(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === 'auto' || b === 'auto') return false;
  const aPrimary = a.split('-')[0]?.toLowerCase();
  const bPrimary = b.split('-')[0]?.toLowerCase();
  if (!aPrimary || !bPrimary) return false;
  return aPrimary === bPrimary;
}
