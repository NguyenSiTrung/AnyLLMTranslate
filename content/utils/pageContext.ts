/**
 * Page Context Extraction — extracts metadata from the current page
 * for context-aware translation.
 */

import type { PageContext, ExtensionSettings } from '@/types/config';
import {
  getAutoDetectedCategory,
  isAutoCategoryLocked,
  isCategoryDetectionInFlight,
  setAutoDetectedCategory,
  setCategoryDetectionInFlight,
  invalidateCategoryIfUrlChanged,
  type AutoCategorySource,
} from '@/content/categoryState';
import { normalizePredefinedCategory } from '@/lib/categories';

/** Truncate string to max length */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** SessionStorage key prefix for short-lived host→category cache. */
const CATEGORY_SESSION_PREFIX = 'allt:page-category:v1:';

/** Hardcoded domain-to-category map for top domains.
 * Values MUST use Title Case to match PREDEFINED_CATEGORIES in lib/categories.ts. */
export const DOMAIN_CATEGORY_MAP: Record<string, string> = {
  'github.com': 'Software Development',
  'stackoverflow.com': 'Programming Q&A',
  'arxiv.org': 'Academic Research',
  'docs.python.org': 'Software Development',
  'developer.mozilla.org': 'Web Development Documentation',
  'wikipedia.org': 'Encyclopedia',
  'news.ycombinator.com': 'Technology News',
  'medium.com': 'Technology Blog',
  'dev.to': 'Developer Blog',
  'npmjs.com': 'Package Registry',
  'pypi.org': 'Package Registry',
  'crates.io': 'Package Registry',
  'udemy.com': 'Online Education',
  'coursera.org': 'Online Education',
  'youtube.com': 'Video Platform',
  'netflix.com': 'Streaming Entertainment',
  'reddit.com': 'Community Discussion',
  'twitter.com': 'Social Media',
  'x.com': 'Social Media',
  'linkedin.com': 'Professional Networking',
  'amazon.com': 'E-Commerce',
  'ebay.com': 'E-Commerce',
  'booking.com': 'Travel & Hospitality',
  'airbnb.com': 'Travel & Hospitality',
  'bbc.com': 'News',
  'cnn.com': 'News',
  'nytimes.com': 'News',
  'theguardian.com': 'News',
  'reuters.com': 'News',
  'bloomberg.com': 'Financial News',
  'techcrunch.com': 'Technology News',
  'wired.com': 'Technology News',
  'nature.com': 'Academic Journal',
  'sciencedirect.com': 'Academic Journal',
  'springer.com': 'Academic Journal',
  'ieee.org': 'Academic Research',
  'acm.org': 'Academic Research',

  // Streaming movie/TV platforms
  'disneyplus.com': 'Streaming Entertainment',
  'hulu.com': 'Streaming Entertainment',
  'primevideo.com': 'Streaming Entertainment',
  'tv.apple.com': 'Streaming Entertainment',
  'peacocktv.com': 'Streaming Entertainment',
  'paramountplus.com': 'Streaming Entertainment',
  'max.com': 'Streaming Entertainment',
  'hbomax.com': 'Streaming Entertainment',
  'youku.com': 'Streaming Entertainment',
  'iqiyi.com': 'Streaming Entertainment',
  'v.qq.com': 'Streaming Entertainment',
  'bilibili.com': 'Streaming Entertainment',

  // Online learning platforms
  'khanacademy.org': 'Online Education',
  'edx.org': 'Online Education',
  'pluralsight.com': 'Online Education',
  'skillshare.com': 'Online Education',
  'udacity.com': 'Online Education',
  'duolingo.com': 'Online Education',
  'lingoda.com': 'Online Education',
};

/** Look up a domain-map category (exact host or subdomain). */
export function lookupDomainCategory(domain: string): string | undefined {
  const key = Object.keys(DOMAIN_CATEGORY_MAP).find(
    (k) => domain === k || domain.endsWith('.' + k),
  );
  return key ? DOMAIN_CATEGORY_MAP[key] : undefined;
}

/** Collect schema.org @type values from JSON-LD scripts. */
function extractSchemaTypes(doc: Document): string[] {
  const types: string[] = [];
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '');
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const raw = item?.['@type'];
        if (typeof raw === 'string' && raw.trim()) types.push(raw.trim());
        else if (Array.isArray(raw)) {
          for (const t of raw) {
            if (typeof t === 'string' && t.trim()) types.push(t.trim());
          }
        }
      }
    } catch {
      // Invalid JSON-LD — skip
    }
  }
  return types.slice(0, 8);
}

/** Session-cache helpers (host → category). Fail open when storage is unavailable. */
export function readCategorySessionCache(hostname: string): string | undefined {
  if (!hostname || typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(CATEGORY_SESSION_PREFIX + hostname.toLowerCase());
    if (!raw) return undefined;
    return normalizePredefinedCategory(raw) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeCategorySessionCache(hostname: string, category: string): void {
  if (!hostname || typeof sessionStorage === 'undefined') return;
  const normalized = normalizePredefinedCategory(category);
  if (!normalized) return;
  try {
    sessionStorage.setItem(CATEGORY_SESSION_PREFIX + hostname.toLowerCase(), normalized);
  } catch {
    /* quota / private mode */
  }
}

/** Extract page context from a Document */
export function extractPageContext(doc: Document, enableCategoryDetection = false): PageContext {
  const title = truncate(doc.title, 100);

  const metaDescription = doc.querySelector('meta[name="description"]');
  const description = truncate(metaDescription?.getAttribute('content') ?? '', 200);

  const domain = typeof window !== 'undefined' ? window.location.hostname : '';
  const pathname =
    typeof window !== 'undefined' ? truncate(window.location.pathname || '/', 200) : undefined;
  const h1Raw = doc.querySelector('h1')?.textContent?.trim() ?? '';
  const h1 = h1Raw ? truncate(h1Raw.replace(/\s+/g, ' '), 120) : undefined;
  const ogType =
    doc.querySelector('meta[property="og:type"]')?.getAttribute('content')?.trim() || undefined;
  const schemaTypes = extractSchemaTypes(doc);

  let category: string | undefined;
  if (enableCategoryDetection) {
    category = detectCategory(doc, domain);
  }

  return {
    title,
    description,
    domain,
    ...(pathname ? { pathname } : {}),
    ...(h1 ? { h1 } : {}),
    ...(ogType ? { ogType } : {}),
    ...(schemaTypes.length > 0 ? { schemaTypes } : {}),
    ...(category ? { category } : {}),
  };
}

/**
 * Detect page category using heuristic rules.
 * Domain-map hits are high-confidence; other signals are weak heuristics.
 */
function detectCategory(doc: Document, domain: string): string | undefined {
  // 1. Check domain map
  const domainHit = lookupDomainCategory(domain);
  if (domainHit) return domainHit;

  // 2. Check meta keywords
  const metaKeywords = doc.querySelector('meta[name="keywords"]');
  if (metaKeywords) {
    const keywords = (metaKeywords.getAttribute('content') ?? '').toLowerCase();
    if (keywords.includes('programming') || keywords.includes('software') || keywords.includes('developer') || keywords.includes('api') || keywords.includes('sdk')) {
      return 'Software Development';
    }
    if (keywords.includes('research') || keywords.includes('academic') || keywords.includes('scholarly')) {
      return 'Academic Research';
    }
    if (keywords.includes('news') || keywords.includes('journalism') || keywords.includes('breaking')) {
      return 'News';
    }
    if (keywords.includes('education') || keywords.includes('learning') || keywords.includes('course') || keywords.includes('tutorial')) {
      return 'Online Education';
    }
    if (keywords.includes('shopping') || keywords.includes('ecommerce') || keywords.includes('buy') || keywords.includes('store')) {
      return 'E-Commerce';
    }
    if (keywords.includes('health') || keywords.includes('medical') || keywords.includes('medicine')) {
      return 'Health & Medicine';
    }
    if (keywords.includes('game') || keywords.includes('gaming')) {
      return 'Gaming';
    }
    if (keywords.includes('travel') || keywords.includes('hotel') || keywords.includes('booking')) {
      return 'Travel & Hospitality';
    }
    if (keywords.includes('forum') || keywords.includes('community') || keywords.includes('discussion')) {
      return 'Community Discussion';
    }
    if (keywords.includes('blog') || keywords.includes('tech blog')) {
      return 'Technology Blog';
    }
    if (keywords.includes('video') || keywords.includes('streaming') || keywords.includes('watch')) {
      return 'Video Platform';
    }
  }

  // 3. Check og:type and og:site_name meta tags
  const ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content')?.toLowerCase() ?? '';
  const ogSiteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.toLowerCase() ?? '';

  if (ogType === 'article' || ogType === 'blog') {
    if (ogSiteName.includes('blog') || ogSiteName.includes('dev') || ogSiteName.includes('tech') || ogSiteName.includes('engineering')) {
      return 'Technology Blog';
    }
    if (ogSiteName.includes('news') || ogSiteName.includes('times') || ogSiteName.includes('post') || ogSiteName.includes('herald')) {
      return 'News';
    }
    // Generic article — news is safer than assuming tech blog
    return 'News';
  }
  if (ogType === 'product' || ogType === 'product.group') {
    return 'E-Commerce';
  }
  if (ogType === 'video' || ogType === 'video.other' || ogType === 'video.movie' || ogType === 'video.episode') {
    return 'Video Platform';
  }
  if (ogType === 'music' || ogType === 'music.song' || ogType === 'music.album') {
    return 'Streaming Entertainment';
  }
  if (ogType === 'profile') {
    return 'Social Media';
  }

  // 4. Check schema.org structured data (JSON-LD)
  const schemaCategory = detectFromSchemaOrg(doc);
  if (schemaCategory) return schemaCategory;

  // 5. Check URL path patterns
  const pathname = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';
  if (/\/(docs?|documentation|reference|api)\//i.test(pathname)) {
    return 'Web Development Documentation';
  }
  if (/\/(blog|posts?|articles?)\//i.test(pathname)) {
    return 'Technology Blog';
  }
  if (/\/(wiki|encyclopedia)\//i.test(pathname)) {
    return 'Encyclopedia';
  }
  if (/\/(forum|discuss|community|thread)\//i.test(pathname)) {
    return 'Community Discussion';
  }
  if (/\/(learn|course|tutorial|lesson)\//i.test(pathname)) {
    return 'Online Education';
  }
  if (/\/(shop|store|product|cart|checkout)\//i.test(pathname)) {
    return 'E-Commerce';
  }
  if (/\/(news|press|releases?)\//i.test(pathname)) {
    return 'News';
  }

  // 6. Check meta description for category clues
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.toLowerCase() ?? '';
  if (metaDesc) {
    if (/\b(api|sdk|library|framework|developer|open.?source|github|repository)\b/.test(metaDesc)) {
      return 'Software Development';
    }
    if (/\b(documentation|docs|reference|getting.?started)\b/.test(metaDesc)) {
      return 'Web Development Documentation';
    }
    if (/\b(research|study|paper|citation|peer.?review|abstract)\b/.test(metaDesc)) {
      return 'Academic Research';
    }
    if (/\b(breaking.?news|headlines?|journalism|reporter|correspondent)\b/.test(metaDesc)) {
      return 'News';
    }
    if (/\b(learn|course|tutorial|education|training|certification)\b/.test(metaDesc)) {
      return 'Online Education';
    }
  }

  // 7. Analyze first h1 text
  const h1 = doc.querySelector('h1');
  if (h1) {
    const h1Text = h1.textContent ?? '';
    if (/tutorial|guide|how to|documentation|getting started/i.test(h1Text)) {
      return 'Online Education';
    }
    if (/news|breaking|headline/i.test(h1Text)) {
      return 'News';
    }
    if (/research|study|paper|journal/i.test(h1Text)) {
      return 'Academic Research';
    }
    if (/api|sdk|developer|reference|docs/i.test(h1Text)) {
      return 'Web Development Documentation';
    }
  }

  // 8. Check for article-like page structure (has <article> or <time> elements)
  const hasArticle = doc.querySelector('article') !== null;
  const hasTime = doc.querySelector('time[datetime]') !== null;
  if (hasArticle && hasTime) {
    return 'Technology Blog';
  }

  return undefined;
}

/** Detect category from schema.org JSON-LD structured data */
function detectFromSchemaOrg(doc: Document): string | undefined {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent ?? '');
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = String(item?.['@type'] ?? '').toLowerCase();
        if (type === 'newsarticle' || type === 'reportagenewsarticle') return 'News';
        if (type === 'blogposting' || type === 'technicalarticle' || type === 'techarticle') {
          return 'Technology Blog';
        }
        if (type === 'scholarlyarticle') return 'Academic Research';
        if (type === 'product' || type === 'offer') return 'E-Commerce';
        if (type === 'course') return 'Online Education';
        if (type === 'videoobject') return 'Video Platform';
        if (type === 'softwareapplication' || type === 'softwaresourcecode') {
          return 'Software Development';
        }
        if (type === 'discussionforumposting' || type === 'question') {
          return 'Community Discussion';
        }
        if (type === 'medicalwebpage' || type === 'medicalcondition') {
          return 'Health & Medicine';
        }
        if (type === 'recipe') return 'Technology Blog';
      }
    } catch {
      // Invalid JSON-LD — skip
    }
  }
  return undefined;
}

/**
 * Resolve effective category using priority chain:
 * 1. Temporary popup override (tab-scoped)
 * 2. SiteRule.category (persistent per-domain)
 * 3. Auto-detected (heuristics)
 */
export function resolveCategory(
  autoDetected?: string,
  siteRuleCategory?: string,
  tabOverride?: string,
): string | undefined {
  return tabOverride ?? siteRuleCategory ?? autoDetected;
}

/** Normalize an LLM/cache category response; drops Other/unknown. */
function acceptDetectedCategory(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return normalizePredefinedCategory(raw) ?? undefined;
}

/**
 * Run one LLM category request and normalize the result.
 * Returns the accepted category or undefined.
 */
async function requestLlmCategory(pageContext: PageContext): Promise<string | undefined> {
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'DETECT_PAGE_CATEGORY_LLM',
      pageContext,
    });
    return res?.success ? acceptDetectedCategory(res.category) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Perform LLM category detection based on settings mode.
 * - blocking: awaits detection, sets pageContext.category, calls onDetected
 * - async: starts detection without blocking the caller; still invokes onDetected
 *   when complete. Returns a settle promise via `options.onSettled` / the
 *   returned handle so in-flight guards can clear only after the LLM finishes.
 *
 * When `skipIfExisting` is false, weak existing auto-detect values do not block
 * the LLM call (used for heuristic refinement). Locked sources still skip via
 * the caller.
 *
 * @returns a promise that resolves when the LLM call has settled (both modes).
 *   In async mode the outer function still returns that promise so callers that
 *   care about in-flight can await it, while translatePieces can ignore it.
 */
export async function detectLLMCategoryIfNeeded(
  pageContext: PageContext,
  settings: ExtensionSettings,
  manualOverride: string | undefined,
  existingAutoDetected: string | undefined,
  onDetected: (category: string) => void,
  options?: { skipIfExisting?: boolean },
): Promise<void> {
  if (!settings.enableLLMPageCategoryDetection) return;
  if (manualOverride) return;
  const skipIfExisting = options?.skipIfExisting !== false;
  if (skipIfExisting && existingAutoDetected) return;

  const run = async (): Promise<void> => {
    const category = await requestLlmCategory(pageContext);
    if (category) {
      pageContext.category = category;
      onDetected(category);
    }
  };

  if (settings.llmCategoryDetectionMode === 'blocking') {
    await run();
    return;
  }

  // async mode: do not block the caller on the LLM round-trip.
  await run();
}

/**
 * Infer source tag for a freshly extracted heuristic category.
 */
export function classifyHeuristicSource(
  domain: string,
  category: string | undefined,
): AutoCategorySource | undefined {
  if (!category) return undefined;
  if (lookupDomainCategory(domain) === category) return 'domain';
  return 'heuristic';
}

/**
 * Trigger LLM category detection if allowed.
 * Guards: setting on, no manual override, not locked (domain/llm/cache),
 * not already in flight. Weak heuristics do not lock.
 *
 * In-flight flag stays true until the LLM promise settles (async + blocking).
 * In async mode this function returns immediately after dispatching so
 * translation is not delayed; the in-flight guard still covers the full call.
 * Session host cache is checked before spending an LLM call.
 */
export async function triggerAutoCategoryDetection(
  settings: ExtensionSettings,
  manualOverride: string | undefined,
  onDetected: (category: string) => void,
): Promise<void> {
  invalidateCategoryIfUrlChanged();
  if (!settings.enableLLMPageCategoryDetection) return;
  if (manualOverride) return;
  if (isAutoCategoryLocked()) return;
  if (isCategoryDetectionInFlight()) return;

  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '';
  const cached = readCategorySessionCache(hostname);
  if (cached) {
    setAutoDetectedCategory(cached, 'cache');
    onDetected(cached);
    return;
  }

  const pageContext = extractPageContext(document, settings.enableContextAwareTranslation);
  // Prefer domain-map lock without LLM when available.
  const domainCat = lookupDomainCategory(pageContext.domain);
  if (domainCat) {
    setAutoDetectedCategory(domainCat, 'domain');
    onDetected(domainCat);
    writeCategorySessionCache(pageContext.domain, domainCat);
    return;
  }

  setCategoryDetectionInFlight(true);

  const work = detectLLMCategoryIfNeeded(
    pageContext,
    settings,
    manualOverride,
    // Weak heuristics must not skip LLM refinement.
    isAutoCategoryLocked() ? getAutoDetectedCategory() : undefined,
    (cat) => {
      setAutoDetectedCategory(cat, 'llm');
      writeCategorySessionCache(pageContext.domain, cat);
      onDetected(cat);
    },
    { skipIfExisting: false },
  ).finally(() => {
    setCategoryDetectionInFlight(false);
  });

  if (settings.llmCategoryDetectionMode === 'blocking') {
    await work;
    return;
  }

  // async: fire-and-forget for the caller; in-flight clears when work settles.
  void work;
}

/** Expose source helper for callers that persist heuristic results. */
export function persistHeuristicCategory(
  category: string | undefined,
  domain: string,
): void {
  if (!category) return;
  // Do not downgrade a stronger locked source.
  if (isAutoCategoryLocked()) return;
  const source = classifyHeuristicSource(domain, category) ?? 'heuristic';
  setAutoDetectedCategory(category, source);
  if (source === 'domain') {
    writeCategorySessionCache(domain, category);
  }
}
