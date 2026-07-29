/**
 * Pick the best installed speechSynthesis voice for a language code.
 * App codes (ISO 639-1 / zh-TW) are normalized toward BCP-47 for matching.
 */

export type VoiceLike = {
  lang: string;
  name: string;
  localService: boolean;
  default: boolean;
};

/** Map app / short codes to a preferred BCP-47 tag for utterance.lang. */
const SPEECH_LANG_ALIASES: Record<string, string> = {
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-tw': 'zh-TW',
  'zh-hant': 'zh-TW',
  'zh-hk': 'zh-HK',
  no: 'nb-NO',
  nb: 'nb-NO',
  nn: 'nn-NO',
  he: 'he-IL',
  iw: 'he-IL',
  id: 'id-ID',
  ms: 'ms-MY',
  pt: 'pt-BR',
  'pt-pt': 'pt-PT',
  'pt-br': 'pt-BR',
  en: 'en-US',
  vi: 'vi-VN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  ru: 'ru-RU',
  ar: 'ar-SA',
  th: 'th-TH',
  it: 'it-IT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  tr: 'tr-TR',
  uk: 'uk-UA',
  hi: 'hi-IN',
  bn: 'bn-IN',
  ta: 'ta-IN',
  cs: 'cs-CZ',
  sv: 'sv-SE',
  da: 'da-DK',
  fi: 'fi-FI',
  el: 'el-GR',
  hu: 'hu-HU',
  ro: 'ro-RO',
  sk: 'sk-SK',
  bg: 'bg-BG',
  hr: 'hr-HR',
};

/**
 * Normalize an app language code for SpeechSynthesis.
 * Returns undefined for empty / auto (no reliable voice target).
 */
export function normalizeSpeechLang(code?: string | null): string | undefined {
  if (code == null) return undefined;
  const raw = code.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase().replace(/_/g, '-');
  if (lower === 'auto') return undefined;

  if (SPEECH_LANG_ALIASES[lower]) {
    return SPEECH_LANG_ALIASES[lower];
  }

  if (lower.includes('-')) {
    const [lang, region, ...rest] = lower.split('-');
    if (!lang || !region) return undefined;
    if (rest.length > 0) {
      return `${lang}-${region.toUpperCase()}${rest.map((p) => `-${p}`).join('')}`;
    }
    return `${lang}-${region.toUpperCase()}`;
  }

  return lower;
}

function normalizeVoiceLang(lang: string): string {
  return lang.trim().toLowerCase().replace(/_/g, '-');
}

/**
 * Score how well a voice matches the desired language. Higher is better.
 * Returns -1 when the voice is not a candidate.
 */
export function scoreVoiceForLang(voiceLang: string, desired: string): number {
  const vl = normalizeVoiceLang(voiceLang);
  const target = normalizeVoiceLang(desired);
  if (!vl || !target) return -1;

  const primary = target.split('-')[0] ?? target;
  const voicePrimary = vl.split('-')[0] ?? vl;

  if (vl === target) return 100;
  if (vl.startsWith(`${target}-`) || target.startsWith(`${vl}-`)) return 90;
  if (voicePrimary === primary && vl.startsWith(`${primary}-`)) return 50;
  if (vl === primary) return 40;
  if (voicePrimary === primary) return 20;
  return -1;
}

/**
 * Pick the best voice for `lang` from the browser voice list.
 * Prefer exact/region match, then same primary language; local voices win ties.
 */
export function pickBrowserVoice<T extends VoiceLike>(
  voices: readonly T[],
  lang?: string | null,
): T | null {
  const desired = normalizeSpeechLang(lang);
  if (!desired || voices.length === 0) return null;

  let best: T | null = null;
  let bestScore = -1;

  for (const voice of voices) {
    let score = scoreVoiceForLang(voice.lang, desired);
    if (score < 0) continue;
    if (voice.localService) score += 5;
    if (voice.default) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }

  return best;
}

/**
 * Wait briefly for speechSynthesis voices to load (Chrome often returns [] first).
 */
export async function ensureSpeechVoicesReady(timeoutMs = 500): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return [];

  const readVoices = (): SpeechSynthesisVoice[] => {
    try {
      return typeof speechSynthesis.getVoices === 'function'
        ? speechSynthesis.getVoices()
        : [];
    } catch {
      return [];
    }
  };

  const immediate = readVoices();
  if (immediate.length > 0) return immediate;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        speechSynthesis.removeEventListener('voiceschanged', onChanged);
      } catch {
        /* ignore incomplete mocks */
      }
      resolve(readVoices());
    };
    const onChanged = () => finish();
    try {
      speechSynthesis.addEventListener('voiceschanged', onChanged);
    } catch {
      resolve([]);
      return;
    }
    setTimeout(finish, timeoutMs);
  });
}

/**
 * Apply lang + best matching voice onto a SpeechSynthesisUtterance.
 * Safe no-op when lang is auto/empty or no matching voice exists.
 */
export function applyUtteranceVoice(
  utterance: SpeechSynthesisUtterance,
  lang: string | undefined,
  voices: readonly SpeechSynthesisVoice[],
): void {
  const normalized = normalizeSpeechLang(lang);
  if (normalized) {
    utterance.lang = normalized;
  }
  const voice = pickBrowserVoice(voices, lang);
  if (voice) {
    utterance.voice = voice;
    // Keep lang aligned with the chosen voice when possible
    if (voice.lang) {
      utterance.lang = voice.lang;
    }
  }
}
