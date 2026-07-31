/**
 * Build GET_DOM_OUTLINE result from a Document + href.
 */

import { buildDomOutline } from '@/lib/siteRuleSuggest/outline';
import type { GetDomOutlineResult } from '@/types/messages';

export function getDomOutlineFromDocument(
  doc: Document,
  href: string,
): GetDomOutlineResult {
  try {
    const url = new URL(href);
    const outline = buildDomOutline(doc, {
      url: href,
      hostname: url.hostname.toLowerCase(),
    });
    return { success: true, outline };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
