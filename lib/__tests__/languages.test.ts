import { describe, expect, it } from 'vitest';
import {
  getLanguageName,
  getLanguageNativeName,
  getTargetLanguages,
  getSourceLanguages,
  isValidLanguageCode,
  LANGUAGES,
} from '../languages';
import {
  detectLanguage,
  isSameLanguage,
  SAME_LANG_SKIP_CONFIDENCE,
} from '../langDetect';
import {
  PREDEFINED_CATEGORIES,
  CATEGORY_GROUPS,
  resolveCategorySource,
  filterCategoryGroups,
  matchesAutoOption,
  matchesCustomOption,
  matchesCategoryQuery,
  normalizePredefinedCategory,
} from '../categories';
import {
  getCategoryPromptSnippet,
  formatCategorySnippetBlock,
  normalizeCategoryKey,
} from '@/lib/categoryPromptSnippets';
import { DEFAULT_SETTINGS } from '@/types/config';

describe('languages', () => {
  it('catalog, lookups, source/target split, and code validation', () => {
    expect(LANGUAGES[0]!.code).toBe('auto');
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);

    expect(getLanguageName('vi')).toBe('Vietnamese');
    expect(getLanguageName('zz')).toBe('zz');
    expect(getLanguageNativeName('vi')).toBe('Tiếng Việt');
    expect(getLanguageNativeName('xyz')).toBe('xyz');

    expect(getSourceLanguages().length).toBe(LANGUAGES.length);
    expect(getSourceLanguages().find((l) => l.code === 'auto')).toBeDefined();
    expect(getTargetLanguages().find((l) => l.code === 'auto')).toBeUndefined();
    expect(getTargetLanguages().length).toBe(LANGUAGES.length - 1);

    expect(isValidLanguageCode('vi')).toBe(true);
    expect(isValidLanguageCode('english')).toBe(false);
  });

  it('covers the Max track languages that were missing, with one auto entry (MAX-36/MPD-11)', () => {
    const codes = LANGUAGES.map((l) => l.code);
    // Max exposes these tracks; without a picker entry the user could not
    // prefer them (the preference UI only offers catalog languages).
    for (const code of ['nb', 'sl', 'et', 'lv', 'lt', 'ca']) {
      expect(codes).toContain(code);
      expect(isValidLanguageCode(code)).toBe(true);
    }

    expect(getLanguageName('nb')).toBe('Norwegian Bokmål');
    expect(getLanguageNativeName('nb')).toBe('Norsk bokmål');
    expect(getLanguageName('sl')).toBe('Slovenian');
    expect(getLanguageNativeName('sl')).toBe('Slovenščina');
    expect(getLanguageName('et')).toBe('Estonian');
    expect(getLanguageNativeName('et')).toBe('Eesti');
    expect(getLanguageName('lv')).toBe('Latvian');
    expect(getLanguageNativeName('lv')).toBe('Latviešu');
    expect(getLanguageName('lt')).toBe('Lithuanian');
    expect(getLanguageNativeName('lt')).toBe('Lietuvių');
    expect(getLanguageName('ca')).toBe('Catalan');
    expect(getLanguageNativeName('ca')).toBe('Català');

    expect(codes.filter((code) => code === 'auto')).toHaveLength(1);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('langDetect', () => {
  it('detects scripts/n-grams, handles empty/ambiguous, compares tags, and FR-13 edge cases', () => {
    expect(detectLanguage('你好世界，今天天气真好').lang).toBe('zh');
    expect(detectLanguage('これは日本語のテストです').lang).toBe('ja');
    expect(detectLanguage('The quick brown fox jumps over the lazy dog').lang).toBe('en');
    expect(detectLanguage('Xin chào thế giới, hôm nay bạn khỏe không').lang).toBe('vi');

    // Expanded Latin set (it / id / nl / ro)
    expect(detectLanguage('Questo è un test della lingua italiana con le parole comuni').lang).toBe('it');
    expect(detectLanguage('Ini adalah teks bahasa Indonesia yang dan untuk dengan tidak').lang).toBe('id');
    expect(detectLanguage('Dit is een tekst in het Nederlands met de van en op te dat').lang).toBe('nl');
    expect(detectLanguage('Aceasta este o propoziție în limba română cu și pe pentru mai școală').lang).toBe('ro');

    expect(detectLanguage('')).toEqual({ lang: null, confidence: 0 });
    expect(detectLanguage('   \n\t  ')).toEqual({ lang: null, confidence: 0 });
    expect(detectLanguage('12345 67890 54321').lang).toBeNull();
    expect(detectLanguage('你好世界 hello 今天').lang).toBe('zh');

    expect(isSameLanguage('en', 'en')).toBe(true);
    expect(isSameLanguage('zh-Hans', 'zh-Hant')).toBe(true);
    expect(isSameLanguage('en-US', 'en-GB')).toBe(true);
    expect(isSameLanguage('en', 'vi')).toBe(false);
    expect(isSameLanguage('auto', 'en')).toBe(false);
    expect(isSameLanguage(null, 'en')).toBe(false);

    // FR-13: Ukrainian is not skipped as Russian; JP kanji-heavy not skipped as zh
    const uk = detectLanguage('Це український текст про свободу і незалежність країни');
    expect(uk.lang).toBe('uk');
    expect(uk.confidence).toBeGreaterThanOrEqual(0.7);
    // Must not equal ru for skip-as-complete when target is ru
    expect(isSameLanguage(uk.lang, 'ru')).toBe(false);

    // Japanese with kana + kanji
    const ja = detectLanguage('日本語の文章です。漢字が多くても仮名があれば日本語です。');
    expect(ja.lang).toBe('ja');

    // Han-only (no kana): confidence stays below skip bar so zh target won't
    // silently skip Japanese classical / ambiguous Han as "already zh".
    const hanOnly = detectLanguage('今日天気真好世界和平');
    expect(hanOnly.lang).toBe('zh');
    expect(hanOnly.confidence).toBeLessThan(SAME_LANG_SKIP_CONFIDENCE);

    // Soft Russian Cyrillic without Ukrainian markers stays below skip bar
    const softRu = detectLanguage('Это простой текст на кириллице без украинских букв');
    if (softRu.lang === 'ru') {
      expect(softRu.confidence).toBeLessThan(SAME_LANG_SKIP_CONFIDENCE);
    }
  });
});

describe('Categories, prompt snippets & glossary settings', () => {
  it('covers predefined categories, resolves sources, searches groups, and resolves prompt snippets', () => {
    const flat = CATEGORY_GROUPS.flatMap((g) => [...g.items]);
    expect(new Set(flat).size).toBe(flat.length);
    expect(new Set(flat)).toEqual(new Set(PREDEFINED_CATEGORIES));

    expect(resolveCategorySource({ override: 'News', siteRule: 'Gaming' })).toBe('tab');
    expect(resolveCategorySource({ siteRule: 'News' })).toBe('rule');
    expect(resolveCategorySource(null)).toBe('auto');

    expect(matchesCategoryQuery('Software Development', 'soft')).toBe(true);
    expect(matchesAutoOption('auto')).toBe(true);
    expect(matchesCustomOption('cus')).toBe(true);

    const filtered = filterCategoryGroups(CATEGORY_GROUPS, 'news');
    expect(filtered.some((g) => g.items.includes('News'))).toBe(true);

    // LLM category labels normalize onto the predefined allowlist
    expect(normalizePredefinedCategory('software development')).toBe('Software Development');
    expect(normalizePredefinedCategory('  News  ')).toBe('News');
    expect(normalizePredefinedCategory('Financial News')).toBe('Financial News');
    expect(normalizePredefinedCategory('Other')).toBeNull();
    expect(normalizePredefinedCategory('technology')).toBeNull();
    expect(normalizePredefinedCategory('')).toBeNull();
    expect(normalizePredefinedCategory(undefined)).toBeNull();

    // resolves category prompt snippets for every predefined category
    for (const cat of PREDEFINED_CATEGORIES) {
      expect(getCategoryPromptSnippet(cat), cat).toBeTruthy();
    }
    expect(getCategoryPromptSnippet('Documentation')).toMatch(/technical/i);
    expect(getCategoryPromptSnippet('news')).toMatch(/journalistic/i);
    expect(getCategoryPromptSnippet('Health & Medicine')).toMatch(/medical/i);
    expect(getCategoryPromptSnippet('Software Development')).toMatch(/technical|API|code/i);
    expect(getCategoryPromptSnippet('Financial News')).toMatch(/ticker|finance|currency/i);
    expect(getCategoryPromptSnippet('totally-unknown-xyz')).toBeNull();

    const block = formatCategorySnippetBlock('Software Development');
    expect(block).toContain('<page_category>Software Development</page_category>');
    expect(block).toContain('<category_rules>');

    expect(normalizeCategoryKey('  News  ')).toBe('news');
    expect(DEFAULT_SETTINGS.namedGlossaryLists).toEqual([]);
    expect(DEFAULT_SETTINGS.subtitleListBySite).toEqual({});
  });
});
