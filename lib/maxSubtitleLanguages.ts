/**
 * Max (HBO Max) subtitle language helpers shared by handler and MPD processor.
 */

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
      return MAX_LABEL_TO_LANGUAGE[label] ?? label.toLowerCase();
    }
  }
  return '';
}