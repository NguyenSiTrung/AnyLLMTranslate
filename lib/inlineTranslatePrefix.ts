/**
 * Language-prefix parsing for inline input translation.
 * Leading tokens like `/en` or `/中文` override the target language for one request.
 */

/** Alias → BCP-47 / ISO 639-1 language code */
export const LANGUAGE_PREFIX_ALIASES: Record<string, string> = {
  // English
  en: 'en',
  eng: 'en',
  english: 'en',
  // Chinese
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  cn: 'zh-CN',
  中文: 'zh-CN',
  简体: 'zh-CN',
  简体中文: 'zh-CN',
  'zh-tw': 'zh-TW',
  'zh-hant': 'zh-TW',
  tw: 'zh-TW',
  繁体: 'zh-TW',
  繁體: 'zh-TW',
  繁体中文: 'zh-TW',
  繁體中文: 'zh-TW',
  // Japanese
  ja: 'ja',
  jp: 'ja',
  japanese: 'ja',
  日语: 'ja',
  日本語: 'ja',
  // Korean
  ko: 'ko',
  kr: 'ko',
  korean: 'ko',
  韩语: 'ko',
  韓語: 'ko',
  한국어: 'ko',
  // Vietnamese
  vi: 'vi',
  vn: 'vi',
  vietnamese: 'vi',
  越南语: 'vi',
  // French
  fr: 'fr',
  french: 'fr',
  法语: 'fr',
  // Spanish
  es: 'es',
  spanish: 'es',
  西班牙语: 'es',
  // German
  de: 'de',
  german: 'de',
  德语: 'de',
  // Portuguese
  pt: 'pt',
  portuguese: 'pt',
  // Italian
  it: 'it',
  italian: 'it',
  // Russian
  ru: 'ru',
  russian: 'ru',
  俄语: 'ru',
  // Thai
  th: 'th',
  thai: 'th',
  // Indonesian
  id: 'id',
  indonesian: 'id',
  // Arabic
  ar: 'ar',
  arabic: 'ar',
  // Hindi
  hi: 'hi',
  hindi: 'hi',
  // Dutch
  nl: 'nl',
  dutch: 'nl',
  // Polish
  pl: 'pl',
  // Turkish
  tr: 'tr',
};

export interface ParseLanguagePrefixOptions {
  /** When false, return text unchanged with no targetLang */
  enabled?: boolean;
  /** Prefix character, default `/` */
  prefixChar?: string;
  /** Extra alias overrides (merged over defaults) */
  aliases?: Record<string, string>;
}

export interface ParseLanguagePrefixResult {
  /** Resolved target language when a prefix matched */
  targetLang?: string;
  /** Text with prefix (and optional following space) stripped */
  body: string;
  /** Raw prefix token including the prefix char (e.g. `/en`) */
  rawPrefix?: string;
}

/**
 * Parse a leading language prefix from input text.
 *
 * Examples:
 * - `/en hello` → { targetLang: 'en', body: 'hello', rawPrefix: '/en' }
 * - `/中文 你好` → { targetLang: 'zh-CN', body: '你好', rawPrefix: '/中文' }
 * - `hello` → { body: 'hello' }
 */
export function parseLanguagePrefix(
  text: string,
  options: ParseLanguagePrefixOptions = {},
): ParseLanguagePrefixResult {
  const enabled = options.enabled !== false;
  const prefixChar = options.prefixChar ?? '/';
  if (!enabled || !text.startsWith(prefixChar) || text.length <= prefixChar.length) {
    return { body: text };
  }

  // Token after prefix until whitespace or end
  const rest = text.slice(prefixChar.length);
  const match = rest.match(/^(\S+)/);
  if (!match) {
    return { body: text };
  }

  const token = match[1];
  const aliases = { ...LANGUAGE_PREFIX_ALIASES, ...options.aliases };
  // Prefer exact match; also try lowercased for Latin tokens
  const resolved =
    aliases[token] ??
    aliases[token.toLowerCase()] ??
    // bare ISO codes not in table (2–3 letters)
    (/^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/i.test(token) ? normalizeBareCode(token) : undefined);

  if (!resolved) {
    return { body: text };
  }

  const rawPrefix = prefixChar + token;
  // Strip prefix + optional single run of whitespace after it
  let body = text.slice(rawPrefix.length);
  body = body.replace(/^\s+/, '');

  return {
    targetLang: resolved,
    body,
    rawPrefix,
  };
}

function normalizeBareCode(token: string): string {
  const parts = token.split('-');
  if (parts.length === 1) return parts[0].toLowerCase();
  return `${parts[0].toLowerCase()}-${parts[1]}`;
}
