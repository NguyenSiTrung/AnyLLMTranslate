import { startingKeyAliases, normalizeTriggerKey } from './inlineTriggerKeys';
import { isValidLanguageCode, LANGUAGES } from './languages';

/**
 * Language-prefix parsing for inline input translation (refer `Ice`/`eqe`).
 * Leading tokens like `/en`, `//en` or `、、英文` override the target language
 * for one request.
 */

/** Starting-key value that turns prefix parsing off. */
export const LANGUAGE_PREFIX_NONE = 'none';

/** At most this many starting chars before the language token (`//en`). */
const MAX_STARTING_CHARS = 2;

/** Alias → BCP-47 / ISO 639-1 language code */
export const LANGUAGE_PREFIX_ALIASES: Record<string, string> = {
  // English
  en: 'en',
  eng: 'en',
  english: 'en',
  英文: 'en',
  英语: 'en',
  英語: 'en',
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
  日文: 'ja',
  日本語: 'ja',
  // Korean
  ko: 'ko',
  kr: 'ko',
  korean: 'ko',
  韩语: 'ko',
  韩文: 'ko',
  韓語: 'ko',
  한국어: 'ko',
  // Vietnamese
  vi: 'vi',
  vn: 'vi',
  vietnamese: 'vi',
  越南语: 'vi',
  越南文: 'vi',
  // French
  fr: 'fr',
  french: 'fr',
  法语: 'fr',
  法文: 'fr',
  // Spanish
  es: 'es',
  spanish: 'es',
  西班牙语: 'es',
  西班牙文: 'es',
  // German
  de: 'de',
  german: 'de',
  德语: 'de',
  德文: 'de',
  // Portuguese
  pt: 'pt',
  portuguese: 'pt',
  葡萄牙语: 'pt',
  // Italian
  it: 'it',
  italian: 'it',
  意大利语: 'it',
  // Russian
  ru: 'ru',
  russian: 'ru',
  俄语: 'ru',
  俄文: 'ru',
  // Thai
  th: 'th',
  thai: 'th',
  泰语: 'th',
  // Indonesian
  id: 'id',
  indonesian: 'id',
  印尼语: 'id',
  // Arabic
  ar: 'ar',
  arabic: 'ar',
  阿拉伯语: 'ar',
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
  /** Starting key, default `/`; `'none'` disables parsing */
  prefixChar?: string;
  /** Trailing trigger key; a starting key equal to it is ignored */
  trailingKey?: string;
  /** Extra alias overrides (merged over defaults) */
  aliases?: Record<string, string>;
}

export interface ParseLanguagePrefixResult {
  /** Resolved target language when a prefix matched */
  targetLang?: string;
  /** Text with prefix (and following whitespace) stripped */
  body: string;
  /** Raw prefix token including the starting chars (e.g. `//en`) */
  rawPrefix?: string;
}

let nameAliases: Record<string, string> | null = null;

/** Single-word English / native names from the supported language list. */
function languageNameAliases(): Record<string, string> {
  if (nameAliases) return nameAliases;
  const table: Record<string, string> = {};
  for (const { code, name, nativeName } of LANGUAGES) {
    if (code === 'auto') continue;
    const resolved = code === 'zh' ? 'zh-CN' : code;
    for (const label of [name, nativeName]) {
      const key = label.toLowerCase();
      if (!/\s/.test(key)) table[key] ??= resolved;
    }
  }
  nameAliases = table;
  return table;
}

function aliasTable(extra?: Record<string, string>): Record<string, string> {
  return { ...languageNameAliases(), ...LANGUAGE_PREFIX_ALIASES, ...extra };
}

/** Language token (code or name) → target language code. */
export function resolveLanguageToken(
  token: string,
  extra?: Record<string, string>,
): string | undefined {
  const aliases = aliasTable(extra);
  return (
    aliases[token] ??
    aliases[token.toLowerCase()] ??
    // bare ISO codes not in the alias table (2–3 letters), validated against
    // the supported language list so `/lol that is funny` keeps its text
    resolveBareLanguageCode(token)
  );
}

/** Every alias token that resolves to `code` (code → names direction). */
export function languagePrefixTokens(code: string): string[] {
  return Object.entries(aliasTable())
    .filter(([, value]) => value === code)
    .map(([token]) => token);
}

/**
 * Parse a leading language prefix from input text.
 *
 * Examples:
 * - `/en hello` / `//en hello` → { targetLang: 'en', body: 'hello' }
 * - `、、英文 hello` → { targetLang: 'en', body: 'hello' } (full-width alias)
 * - `//en` → { targetLang: 'en', body: '' } — prefix only, nothing to translate
 * - `hello` → { body: 'hello' }
 */
export function parseLanguagePrefix(
  text: string,
  options: ParseLanguagePrefixOptions = {},
): ParseLanguagePrefixResult {
  const prefixChar = normalizeTriggerKey(options.prefixChar ?? '/');
  if (
    options.enabled === false ||
    !prefixChar ||
    prefixChar === LANGUAGE_PREFIX_NONE ||
    (options.trailingKey != null && normalizeTriggerKey(options.trailingKey) === prefixChar)
  ) {
    return { body: text };
  }

  const starters = startingKeyAliases(prefixChar);
  const chars = Array.from(text);
  let starting = 0;
  while (starting < chars.length && starters.includes(chars[starting])) starting += 1;
  if (starting === 0 || starting > MAX_STARTING_CHARS) {
    return { body: text };
  }

  const head = chars.slice(0, starting).join('');
  // Token after the starting chars until whitespace or end
  const match = text.slice(head.length).match(/^(\S+)/);
  if (!match) {
    return { body: text };
  }

  const token = match[1];
  const resolved = resolveLanguageToken(token, options.aliases);
  if (!resolved) {
    return { body: text };
  }

  const rawPrefix = head + token;
  return {
    targetLang: resolved,
    body: text.slice(rawPrefix.length).replace(/^\s+/, ''),
    rawPrefix,
  };
}

function normalizeBareCode(token: string): string {
  const parts = token.split('-');
  if (parts.length === 1) return parts[0].toLowerCase();
  return `${parts[0].toLowerCase()}-${parts[1]}`;
}

/**
 * Resolve a bare code only when it names a language the extension supports.
 *
 * The old shape matched any 2–3 letter token, so `/lol that is funny` was read
 * as a language prefix and silently ate the text.
 */
function resolveBareLanguageCode(token: string): string | undefined {
  if (!/^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/i.test(token)) return undefined;
  const code = normalizeBareCode(token);
  // 'auto' is a source-detection marker, never a valid target.
  if (code === 'auto') return undefined;
  return isValidLanguageCode(code) ? code : undefined;
}
