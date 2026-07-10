/**
 * Pure helpers for the Inline settings reactive mock preview.
 * No network — sample strings only.
 */

export const INLINE_PREVIEW_SOURCE = 'hello world';

/** Short sample translations for common targets (options UI only). */
const SAMPLE_TRANSLATIONS: Record<string, string> = {
  en: 'hello world',
  vi: 'xin chào thế giới',
  ja: 'こんにちは世界',
  zh: '你好世界',
  ko: '안녕하세요 세계',
  es: 'hola mundo',
  fr: 'bonjour le monde',
  de: 'hallo welt',
  pt: 'olá mundo',
  ru: 'привет мир',
};

export function resolvePreviewTranslation(targetLanguage: string): string {
  const code = (targetLanguage || 'en').toLowerCase();
  return SAMPLE_TRANSLATIONS[code] ?? `(translated · ${code})`;
}

export interface PreviewProjectionInput {
  targetLanguage: string;
  dualMode: boolean;
  enableLanguagePrefix: boolean;
  languagePrefix: string;
}

export interface PreviewProjection {
  /** Text the user “typed” in the mock field (may include language prefix). */
  before: string;
  /** Projected write-back result. */
  after: string;
  /** Short meta line for the preview footer. */
  meta: string;
}

export function buildPreviewProjection(input: PreviewProjectionInput): PreviewProjection {
  const prefixChar = input.languagePrefix?.slice(0, 1) || '/';
  const source = INLINE_PREVIEW_SOURCE;

  if (input.enableLanguagePrefix) {
    const translation = resolvePreviewTranslation('en');
    const before = `${prefixChar}en ${source}`;
    const after = input.dualMode ? `${source} / ${translation}` : translation;
    return {
      before,
      after,
      meta: `Prefix ${prefixChar}en → English (demo)`,
    };
  }

  const code = input.targetLanguage || 'en';
  const translation = resolvePreviewTranslation(code);
  const after = input.dualMode ? `${source} / ${translation}` : translation;
  return {
    before: source,
    after,
    meta: `Target · ${code}`,
  };
}
