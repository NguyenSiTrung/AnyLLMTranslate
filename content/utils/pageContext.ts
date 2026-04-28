/**
 * Page Context Extraction — extracts metadata from the current page
 * for context-aware translation.
 */

import type { PageContext } from '@/types/config';

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
    const keywords = metaKeywords.getAttribute('content') ?? '';
    if (keywords.includes('programming') || keywords.includes('software')) {
      return 'Software Development';
    }
    if (keywords.includes('research') || keywords.includes('academic')) {
      return 'Academic Research';
    }
    if (keywords.includes('news')) {
      return 'News';
    }
    if (keywords.includes('education') || keywords.includes('learning')) {
      return 'Online Education';
    }
  }

  // 3. Fallback: analyze first h1 text
  const h1 = doc.querySelector('h1');
  if (h1) {
    const h1Text = h1.textContent ?? '';
    if (/tutorial|guide|how to|documentation/i.test(h1Text)) {
      return 'Online Education';
    }
    if (/news|breaking|headline/i.test(h1Text)) {
      return 'News';
    }
    if (/research|study|paper|journal/i.test(h1Text)) {
      return 'Academic Research';
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

