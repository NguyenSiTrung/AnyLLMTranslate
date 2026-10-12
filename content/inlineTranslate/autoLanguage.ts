/**
 * Auto target language for inline input translation (refer `Zqe`).
 *
 * Reply in the conversation's language: per-site selectors point at the
 * messages around the field; their text is run through `detectLanguage`.
 * Optional page fallback uses `<html lang>` (or the page text).
 *
 * Selector syntax (refer):
 *  - `parentElementTo <ancestor> <selector>` — closest `<ancestor>` of the
 *    field, then its first `<selector>` match.
 *  - plain selector — every match in the document.
 */

import { detectLanguage } from '@/lib/langDetect';
import { isValidLanguageCode } from '@/lib/languages';

export type InlineLanguageSource = 'auto_selector' | 'auto_page' | 'default';

export interface AutoLanguageOptions {
  autoLanguageEnable: boolean;
  autoLanguagePageEnable: boolean;
  autoLanguageSelectors: readonly string[];
  targetLanguage: string;
}

export interface AutoLanguageResult {
  lang: string;
  source: InlineLanguageSource;
}

const PARENT_ELEMENT_TO = 'parentElementTo';
/** Text read per selector / page sample; enough for detection. */
const MAX_SAMPLE_CHARS = 2000;
/** Latin stopword scoring sits low; below this the guess is noise. */
const MIN_CONFIDENCE = 0.5;

/** Nodes we inject (translations, bubbles, inline UI) never count as page text. */
const OWN_NODE_SELECTOR = [
  '[data-anyllm-owned]',
  '[data-anyllm-role]',
  '.anyllm-translate-translation',
  '.anyllm-translate-loading',
  '.anyllm-inline-bilingual',
  '.anyllm-inline-translation-only-clone',
  '.anyllm-inline-copy-panel',
].join(',');

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

function safeClosest(el: Element, selector: string): Element | null {
  try {
    return el.closest(selector);
  } catch {
    return null;
  }
}

function safeQueryAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

/** Split at the first whitespace outside `[...]`, `(...)` and quotes. */
function splitFirstSelector(input: string): [string, string] {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '[' || ch === '(') {
      depth += 1;
    } else if (ch === ']' || ch === ')') {
      depth -= 1;
    } else if (depth === 0 && /\s/.test(ch)) {
      return [input.slice(0, i), input.slice(i).trim()];
    }
  }
  return [input, ''];
}

function isExcluded(el: Element, field: Element): boolean {
  return el === field || field.contains(el) || safeClosest(el, OWN_NODE_SELECTOR) != null;
}

/** Visible-ish text of `root`, minus our own nodes and the field itself. */
function readText(root: Element, field: Element, budget: number): string {
  if (isExcluded(root, field)) return '';
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      const el = node as Element;
      if (SKIPPED_TAGS.has(el.tagName) || el === field || el.matches(OWN_NODE_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });
  const parts: string[] = [];
  let length = 0;
  for (let node = walker.nextNode(); node && length < budget; node = walker.nextNode()) {
    const value = node.nodeValue?.trim();
    if (!value) continue;
    parts.push(value);
    length += value.length + 1;
  }
  return parts.join(' ').slice(0, budget);
}

function selectorText(field: Element, rawSelector: string): string {
  const selector = rawSelector.trim();
  if (!selector) return '';

  if (selector.startsWith(`${PARENT_ELEMENT_TO} `)) {
    const [ancestorSel, innerSel] = splitFirstSelector(
      selector.slice(PARENT_ELEMENT_TO.length).trim(),
    );
    if (!innerSel) return '';
    const ancestor = safeClosest(field, ancestorSel);
    if (!ancestor) return '';
    const first = safeQueryAll(ancestor, innerSel).find((el) => !isExcluded(el, field));
    return first ? readText(first, field, MAX_SAMPLE_CHARS) : '';
  }

  const parts: string[] = [];
  let length = 0;
  for (const el of safeQueryAll(field.ownerDocument, selector)) {
    if (length >= MAX_SAMPLE_CHARS) break;
    const text = readText(el, field, MAX_SAMPLE_CHARS - length);
    if (!text) continue;
    parts.push(text);
    length += text.length + 1;
  }
  return parts.join(' ');
}

function detect(text: string): string | null {
  if (!text.trim()) return null;
  const { lang, confidence } = detectLanguage(text);
  if (!lang || confidence < MIN_CONFIDENCE) return null;
  return isValidLanguageCode(lang) ? lang : null;
}

/** `<html lang>` → supported target code (`de-DE` → `de`, `zh-Hant` → `zh-TW`). */
function normalizePageLang(raw: string): string | null {
  const tag = raw.trim();
  if (!tag) return null;
  const [primary, ...rest] = tag.toLowerCase().split(/[-_]/);
  if (primary === 'zh') {
    return rest.some((p) => p === 'tw' || p === 'hk' || p === 'mo' || p === 'hant') ? 'zh-TW' : 'zh';
  }
  return isValidLanguageCode(primary) ? primary : null;
}

function pageLanguage(field: Element): string | null {
  const doc = field.ownerDocument;
  const declared = normalizePageLang(doc.documentElement.getAttribute('lang') ?? '');
  if (declared) return declared;
  return doc.body ? detect(readText(doc.body, field, MAX_SAMPLE_CHARS)) : null;
}

/**
 * Target language for a field when no explicit prefix was given:
 * `auto_selector` → `auto_page` (opt-in) → configured default.
 */
export function resolveAutoTargetLanguage(
  field: Element,
  options: AutoLanguageOptions,
): AutoLanguageResult {
  if (options.autoLanguageEnable) {
    for (const selector of options.autoLanguageSelectors) {
      const lang = detect(selectorText(field, selector));
      if (lang) return { lang, source: 'auto_selector' };
    }
  }

  if (options.autoLanguagePageEnable) {
    const lang = pageLanguage(field);
    if (lang) return { lang, source: 'auto_page' };
  }

  return { lang: options.targetLanguage, source: 'default' };
}
