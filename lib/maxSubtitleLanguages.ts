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

/**
 * True when a track option/button is the selected one.
 *
 * MAX-9: Max has shipped more than one selected-state idiom (and React UI kits
 * commonly use `data-state="checked"`), so reading only `aria-checked` silently
 * reported "no active track" — which then toasts "Enable subtitles" over live
 * captions and sends a non-English track to the model as English.
 */
export function isTrackOptionChecked(el: Element): boolean {
  return (
    el.getAttribute('aria-checked') === 'true' ||
    el.getAttribute('aria-selected') === 'true' ||
    el.getAttribute('aria-pressed') === 'true' ||
    el.getAttribute('data-state') === 'checked'
  );
}

/** Checked state declared on the control itself or on one of its descendants. */
function isTrackButtonChecked(btn: Element): boolean {
  if (isTrackOptionChecked(btn)) return true;
  const nested = btn.querySelectorAll(
    '[aria-checked], [aria-selected], [aria-pressed], [data-state]',
  );
  return Array.from(nested).some(isTrackOptionChecked);
}

/** Read the active Max subtitle language from DOM track buttons ('' if Off/unknown). */
export function readMaxActiveSubtitleLanguage(): string {
  const buttons = document.querySelectorAll<HTMLElement>(
    '[data-testid="player-ux-text-track-button"]',
  );
  for (const btn of buttons) {
    if (!isTrackButtonChecked(btn)) continue;

    const label = btn.getAttribute('aria-label') || '';
    if (!label || label.toLowerCase() === 'off') return '';

    const attrLang = btn.getAttribute('lang') || btn.getAttribute('data-language');
    return normalizeMaxSubtitleLanguage(label, attrLang);
  }
  return '';
}

/**
 * Strip trailing parenthetical qualifiers: 'English (CC)' → 'English'.
 * Returns '' when nothing is left.
 */
function stripLabelQualifiers(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** Label-map lookup: exact → case-insensitive → qualifier-stripped. */
function matchLabelMap(label: string): string | null {
  if (!label) return null;
  const exact = MAX_LABEL_TO_LANGUAGE[label];
  if (exact) return exact;

  const lower = label.toLowerCase();
  const ci =
    LABEL_TO_LANGUAGE_LOWER.get(lower) ?? LOCALIZED_LABEL_TO_LANGUAGE_LOWER.get(lower);
  if (ci) return ci;

  const stripped = stripLabelQualifiers(label);
  if (stripped && stripped !== label) {
    const strippedExact =
      MAX_LABEL_TO_LANGUAGE[stripped] ?? LOCALIZED_LABEL_TO_LANGUAGE[stripped];
    if (strippedExact) return strippedExact;
    const strippedCi =
      LABEL_TO_LANGUAGE_LOWER.get(stripped.toLowerCase()) ??
      LOCALIZED_LABEL_TO_LANGUAGE_LOWER.get(stripped.toLowerCase());
    if (strippedCi) return strippedCi;
  }
  return null;
}

/**
 * Plausible BCP-47-ish language tag. Rejects Max's locale *keys* such as
 * `lang="ui-locale"`, which match the shape but are not languages (MAX-40).
 */
function isPlausibleLanguageTag(code: string): boolean {
  if (!code || code.includes('locale')) return false;
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(code);
}

/**
 * Normalize a Max subtitle button label/metadata to a comparable language tag.
 *
 * MAX-40: the label is authoritative. Previously a `lang`/`data-language`
 * attribute won outright, so a UI-locale value beat the real `aria-label` and
 * produced a wrong code (which the preferred-language gate then used to drop
 * valid cues). attrLang is now a fallback, and only when it looks like a tag.
 */
export function normalizeMaxSubtitleLanguage(label: string, attrLang?: string | null): string {
  const trimmed = (label ?? '').trim();
  const fromLabel = matchLabelMap(trimmed);
  if (fromLabel) return fromLabel;

  const labelCode = normalizeLanguageCode(trimmed.toLowerCase());
  if (isPlausibleLanguageTag(labelCode)) return labelCode;

  const attrCode = normalizeLanguageCode((attrLang ?? '').trim());
  if (isPlausibleLanguageTag(attrCode)) return attrCode;

  return labelCode || attrCode;
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

/** Lowercase label indexes for case-insensitive matching ('english' → 'en'). */
const LABEL_TO_LANGUAGE_LOWER = new Map(
  Object.entries(MAX_LABEL_TO_LANGUAGE).map(([label, code]) => [label.toLowerCase(), code]),
);
const LOCALIZED_LABEL_TO_LANGUAGE_LOWER = new Map(
  Object.entries(LOCALIZED_LABEL_TO_LANGUAGE).map(([label, code]) => [label.toLowerCase(), code]),
);
