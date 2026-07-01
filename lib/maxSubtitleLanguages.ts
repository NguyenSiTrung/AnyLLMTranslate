/**
 * Max (HBO Max) subtitle language helpers shared by handler and MPD processor.
 */

import { ISO_639_2_TO_1 } from '@/lib/subtitleLanguageMatch';

/** Max aria-label → ISO 639-1 / BCP-47 code. */
export const MAX_LABEL_TO_LANGUAGE: Record<string, string> = {
  English: 'en',
  'Chinese (Simplified)': 'zh-Hans',
  'Chinese (Traditional)': 'zh-Hant',
  Indonesian: 'id',
  Malay: 'ms',
  Thai: 'th',
  Spanish: 'es',
  Vietnamese: 'vi',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Japanese: 'ja',
  Korean: 'ko',
  Portuguese: 'pt',
  'Portuguese (Brazil)': 'pt-BR',
  Russian: 'ru',
  Arabic: 'ar',
  Hindi: 'hi',
  Polish: 'pl',
  Turkish: 'tr',
  Dutch: 'nl',
  Danish: 'da',
  Finnish: 'fi',
  Swedish: 'sv',
  Norwegian: 'no',
  'Norwegian Bokmål': 'nb',
  Czech: 'cs',
  Hungarian: 'hu',
  Greek: 'el',
  Hebrew: 'he',
  Romanian: 'ro',
  Catalan: 'ca',
  Ukrainian: 'uk',
  Bulgarian: 'bg',
  Croatian: 'hr',
  Slovak: 'sk',
  Slovenian: 'sl',
  Estonian: 'et',
  Latvian: 'lv',
  Lithuanian: 'lt',
};

/** Read the active Max subtitle language from DOM track buttons ('' if Off/unknown). */
export function readMaxActiveSubtitleLanguage(): string {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    '[data-testid="player-ux-text-track-button"]',
  );
  for (const btn of buttons) {
    if (btn.getAttribute('aria-checked') === 'true') {
      const label = btn.getAttribute('aria-label') || '';
      if (!label || label.toLowerCase() === 'off') return '';

      const attrLang = btn.getAttribute('lang') || btn.getAttribute('data-language');
      return normalizeMaxSubtitleLanguage(label, attrLang);
    }
  }
  return '';
}

/** Normalize a Max subtitle button label/metadata to a comparable language tag. */
export function normalizeMaxSubtitleLanguage(label: string, attrLang?: string | null): string {
  if (attrLang) return normalizeLanguageCode(attrLang);
  if (MAX_LABEL_TO_LANGUAGE[label]) return MAX_LABEL_TO_LANGUAGE[label];
  const localized = LOCALIZED_LABEL_TO_LANGUAGE[label];
  if (localized) return localized;
  return normalizeLanguageCode(label.toLowerCase());
}

/** Normalize a language code: convert ISO 639-2 → 639-1 if known. */
function normalizeLanguageCode(code: string): string {
  const lower = code.toLowerCase().replace(/_/g, '-');
  const parts = lower.split('-');
  if (ISO_639_2_TO_1[parts[0]]) {
    parts[0] = ISO_639_2_TO_1[parts[0]];
    return parts.join('-');
  }
  if (ISO_639_2_TO_1[lower]) return ISO_639_2_TO_1[lower];
  return lower;
}

/** Common localized (non-English) labels for top subtitle languages. */
const LOCALIZED_LABEL_TO_LANGUAGE: Record<string, string> = {
  // Spanish UI
  Inglés: 'en',
  'Chino (Simplificado)': 'zh-Hans',
  'Chino (Tradicional)': 'zh-Hant',
  Español: 'es',
  'Español (Latinoamérica)': 'es-419',
  // French UI
  Anglais: 'en',
  'Chinois (Simplifié)': 'zh-Hans',
  'Chinois (Traditionnel)': 'zh-Hant',
  Français: 'fr',
  // German UI
  Englisch: 'en',
  'Chinesisch (Vereinfacht)': 'zh-Hans',
  'Chinesisch (Traditionell)': 'zh-Hant',
  Deutsch: 'de',
  // Portuguese UI
  Inglês: 'en',
  'Chinês (Simplificado)': 'zh-Hans',
  'Chinês (Tradicional)': 'zh-Hant',
  Português: 'pt',
  'Português (Brasil)': 'pt-BR',
  // Italian UI
  Inglese: 'en',
  'Cinese (Semplificato)': 'zh-Hans',
  'Cinese (Tradizionale)': 'zh-Hant',
  Italiano: 'it',
  // Japanese UI
  英語: 'en',
  簡体字: 'zh-Hans',
  繁体字: 'zh-Hant',
  日本語: 'ja',
  // Korean UI
  영어: 'en',
  '중국어 (간체)': 'zh-Hans',
  '중국어 (번체)': 'zh-Hant',
  한국어: 'ko',
};