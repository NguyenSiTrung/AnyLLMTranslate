/**
 * Page Context Extraction — extracts metadata from the current page
 * for context-aware translation.
 */

import type { PageContext, ExtensionSettings } from '@/types/config';
import {
  getAutoDetectedCategory,
  isCategoryDetectionInFlight,
  setCategoryDetectionInFlight,
} from '@/content/categoryState';

/** Truncate string to max length */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

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
  'ieee.org': 'Software Development',
  'acm.org': 'Academic Research',

  // Streaming movie/TV platforms
  'disneyplus.com': 'Streaming Entertainment',
  'hulu.com': 'Streaming Entertainment',
  'primevideo.com': 'Streaming Entertainment',
  'tv.apple.com': 'Streaming Entertainment',
  'peacocktv.com': 'Streaming Entertainment',
  'paramountplus.com': 'Streaming Entertainment',
  'max.com': 'Streaming Entertainment',
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

/** Extract page context from a Document */
export function extractPageContext(doc: Document, enableCategoryDetection = false): PageContext {
  const title = truncate(doc.title, 100);

  const metaDescription = doc.querySelector('meta[name="description"]');
  const description = truncate(metaDescription?.getAttribute('content') ?? '', 200);

  const domain = typeof window !== 'undefined' ? window.location.hostname : '';

  let category: string | undefined;
  if (enableCategoryDetection) {
    category = detectCategory(doc, domain);
  }

  return {
    title,
    description,
    domain,
    ...(category ? { category } : {}),
  };
}

/** Detect page category using heuristic rules */
function detectCategory(doc: Document, domain: string): string | undefined {
  // 1. Check domain map
  const domainKey = Object.keys(DOMAIN_CATEGORY_MAP).find((key) => domain === key || domain.endsWith('.' + key));
  if (domainKey) {
    return DOMAIN_CATEGORY_MAP[domainKey];
  }

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
    // Distinguish tech blogs from general news via domain/site name clues
    if (ogSiteName.includes('blog') || ogSiteName.includes('dev') || ogSiteName.includes('tech') || ogSiteName.includes('engineering')) {
      return 'Technology Blog';
    }
    if (ogSiteName.includes('news') || ogSiteName.includes('times') || ogSiteName.includes('post') || ogSiteName.includes('herald')) {
      return 'News';
    }
    // Generic article — treat as blog
    return 'Technology Blog';
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
      const type = (data['@type'] ?? '').toLowerCase();
      if (type === 'newsarticle' || type === 'reportagenewsarticle') return 'News';
      if (type === 'blogposting' || type === 'technicalarticle') return 'Technology Blog';
      if (type === 'scholarlyarticle') return 'Academic Research';
      if (type === 'product' || type === 'offer') return 'E-Commerce';
      if (type === 'course') return 'Online Education';
      if (type === 'videoobject') return 'Video Platform';
      if (type === 'softwareapplication' || type === 'softwaresourcecode') return 'Software Development';
      if (type === 'discussionforumposting' || type === 'question') return 'Community Discussion';
      if (type === 'medicalwebpage' || type === 'medicalcondition') return 'Health & Medicine';
      if (type === 'recipe') return 'Technology Blog'; // food blogs are blog-like
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

/**
 * Perform LLM category detection based on settings mode.
 * - blocking: awaits detection, sets pageContext.category, calls onDetected
 * - async: dispatches detection in background, calls onDetected on completion
 *
 * No longer mutates the override store — the caller decides what to do with
 * the result via the onDetected callback.
 */
export async function detectLLMCategoryIfNeeded(
  pageContext: PageContext,
  settings: ExtensionSettings,
  manualOverride: string | undefined,
  existingAutoDetected: string | undefined,
  onDetected: (category: string) => void,
): Promise<void> {
  if (!settings.enableLLMPageCategoryDetection) return;
  if (manualOverride) return;
  if (existingAutoDetected) return;

  if (settings.llmCategoryDetectionMode === 'blocking') {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'DETECT_PAGE_CATEGORY_LLM', pageContext });
      if (res?.success && res.category && res.category !== 'Other') {
        pageContext.category = res.category;
        onDetected(res.category);
      }
    } catch {
      return;
    }
  } else {
    // async mode
    chrome.runtime.sendMessage({ action: 'DETECT_PAGE_CATEGORY_LLM', pageContext }).then((res) => {
      if (res?.success && res.category && res.category !== 'Other') {
        onDetected(res.category);
      }
    }).catch(() => {});
  }
}

/**
 * Trigger an async LLM category detection if all of these hold:
 *  - LLM page-category detection is enabled
 *  - no manual override is set
 *  - no auto-detected value is already cached
 *  - no detection is already in flight
 *
 * The in-flight guard is set before dispatching and cleared on completion
 * (success, 'Other' result, or failure) so callers can fire-and-forget without
 * risking duplicate concurrent LLM calls for the same page.
 *
 * `onDetected` is invoked with the detected category (never 'Other').
 */
export async function triggerAutoCategoryDetection(
  settings: ExtensionSettings,
  manualOverride: string | undefined,
  onDetected: (category: string) => void,
): Promise<void> {
  if (!settings.enableLLMPageCategoryDetection) return;
  if (manualOverride) return;
  if (getAutoDetectedCategory()) return;
  if (isCategoryDetectionInFlight()) return;

  setCategoryDetectionInFlight(true);
  try {
    const pageContext = extractPageContext(document, settings.enableLLMPageCategoryDetection);
    await detectLLMCategoryIfNeeded(pageContext, settings, manualOverride, undefined, onDetected);
  } finally {
    // async mode resolves detectLLMCategoryIfNeeded before the inner .then runs;
    // blocking mode awaits it. Either way, by the time we reach here the LLM call
    // has settled (or no-oped). Clear the guard so a later lazy request can run if
    // this one produced nothing ('Other' / failure).
    setCategoryDetectionInFlight(false);
  }
}

