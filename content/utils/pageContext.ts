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

/** Hardcoded domain-to-category map for top domains */
export const DOMAIN_CATEGORY_MAP: Record<string, string> = {
  'github.com': 'software development',
  'stackoverflow.com': 'programming Q&A',
  'arxiv.org': 'academic research',
  'docs.python.org': 'software documentation',
  'developer.mozilla.org': 'web development documentation',
  'wikipedia.org': 'encyclopedia',
  'news.ycombinator.com': 'technology news',
  'medium.com': 'technology blog',
  'dev.to': 'developer blog',
  'npmjs.com': 'package registry',
  'pypi.org': 'package registry',
  'crates.io': 'package registry',
  'udemy.com': 'online education',
  'coursera.org': 'online education',
  'youtube.com': 'video platform',
  'netflix.com': 'streaming entertainment',
  'reddit.com': 'community discussion',
  'twitter.com': 'social media',
  'x.com': 'social media',
  'linkedin.com': 'professional networking',
  'amazon.com': 'e-commerce',
  'ebay.com': 'e-commerce',
  'booking.com': 'travel booking',
  'airbnb.com': 'travel accommodation',
  'bbc.com': 'news',
  'cnn.com': 'news',
  'nytimes.com': 'news',
  'theguardian.com': 'news',
  'reuters.com': 'news',
  ' bloomberg.com': 'financial news',
  'techcrunch.com': 'technology news',
  'wired.com': 'technology news',
  'nature.com': 'academic journal',
  'sciencedirect.com': 'academic journal',
  'springer.com': 'academic journal',
  'ieee.org': 'technical standards',
  'acm.org': 'computing research',
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
  const domainKey = Object.keys(DOMAIN_CATEGORY_MAP).find((key) => domain.includes(key));
  if (domainKey) {
    return DOMAIN_CATEGORY_MAP[domainKey];
  }

  // 2. Check meta keywords
  const metaKeywords = doc.querySelector('meta[name="keywords"]');
  if (metaKeywords) {
    const keywords = metaKeywords.getAttribute('content') ?? '';
    if (keywords.includes('programming') || keywords.includes('software')) {
      return 'software development';
    }
    if (keywords.includes('research') || keywords.includes('academic')) {
      return 'academic research';
    }
    if (keywords.includes('news')) {
      return 'news';
    }
    if (keywords.includes('education') || keywords.includes('learning')) {
      return 'education';
    }
  }

  // 3. Fallback: analyze first h1 text
  const h1 = doc.querySelector('h1');
  if (h1) {
    const h1Text = h1.textContent ?? '';
    if (/tutorial|guide|how to|documentation/i.test(h1Text)) {
      return 'educational content';
    }
    if (/news|breaking|headline/i.test(h1Text)) {
      return 'news';
    }
    if (/research|study|paper|journal/i.test(h1Text)) {
      return 'academic research';
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

