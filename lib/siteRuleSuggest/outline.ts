/**
 * Build a capped, privacy-minded DOM outline for site-rule suggestions.
 * No full HTML dump. No long article body.
 */

import type { DomOutline, DomOutlineNode } from './types';

export const OUTLINE_MAX_NODES = 40;
export const OUTLINE_MAX_CLASSES = 5;
export const OUTLINE_TEXT_SAMPLE = 80;

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'svg',
  'path',
  'img',
  'video',
  'audio',
  'canvas',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'br',
  'hr',
  'input',
  'button',
  'select',
  'option',
  'textarea',
]);

const PRIORITY_SELECTOR =
  'main, article, section, nav, aside, footer, header, pre, code, ' +
  '[role="main"], [role="navigation"], [role="complementary"], ' +
  '.sidebar, .content, .post, .markdown-body, .prose';

const SEMANTIC_BOOST = new Set([
  'main',
  'article',
  'section',
  'nav',
  'aside',
  'footer',
  'header',
  'pre',
  'code',
]);

function isSafeId(id: string): boolean {
  return id.length > 0 && id.length <= 64 && /^[a-zA-Z][\w-]*$/.test(id);
}

function isStableClass(token: string): boolean {
  if (!token || token.length > 40) return false;
  if (!/^[a-zA-Z_][\w-]*$/.test(token)) return false;
  // Drop long hex-like hashes (e.g. css-modules)
  if (/[a-f0-9]{8,}$/i.test(token) && token.length >= 12) return false;
  return true;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function depthOf(el: Element): number {
  let d = 0;
  let cur: Element | null = el;
  while (cur && cur !== cur.ownerDocument?.body && cur.parentElement) {
    d += 1;
    cur = cur.parentElement;
    if (d > 40) break;
  }
  return d;
}

function nodeFromElement(el: Element): DomOutlineNode | null {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;

  const text = collapseWs(el.textContent ?? '');
  const textLength = Math.min(text.length, 100_000);

  const idRaw = el.getAttribute('id') ?? undefined;
  const id = idRaw && isSafeId(idRaw) ? idRaw : undefined;

  const classAttr = el.getAttribute('class') ?? '';
  const classes = classAttr
    .split(/\s+/)
    .map((c) => c.trim())
    .filter(isStableClass)
    .slice(0, OUTLINE_MAX_CLASSES);

  const role = el.getAttribute('role') ?? undefined;
  const textSample = text ? text.slice(0, OUTLINE_TEXT_SAMPLE) : undefined;

  return {
    tag,
    ...(id ? { id } : {}),
    ...(classes.length ? { classes } : {}),
    ...(role ? { role } : {}),
    ...(textSample ? { textSample } : {}),
    textLength,
    depth: depthOf(el),
  };
}

function scoreNode(n: DomOutlineNode): number {
  let score = n.textLength;
  if (SEMANTIC_BOOST.has(n.tag)) score += 5000;
  if (n.role === 'main') score += 4000;
  if (n.id) score += 200;
  if (n.classes?.length) score += 50 * n.classes.length;
  return score;
}

/** Build a capped DOM outline from a Document (jsdom or real browser). */
export function buildDomOutline(
  doc: Document,
  meta: { url: string; hostname: string },
): DomOutline {
  const title = collapseWs(doc.title ?? '');
  const seen = new Set<Element>();
  const collected: DomOutlineNode[] = [];

  const pushEl = (el: Element) => {
    if (seen.has(el)) return;
    seen.add(el);
    const node = nodeFromElement(el);
    if (!node) return;
    // Skip totally empty noise unless semantic chrome
    if (node.textLength === 0 && !SEMANTIC_BOOST.has(node.tag) && !node.id) return;
    collected.push(node);
  };

  try {
    doc.querySelectorAll(PRIORITY_SELECTOR).forEach((el) => pushEl(el as Element));
  } catch {
    /* invalid selector env */
  }

  // Score additional text-ish parents (p/h*/li → nearest block)
  try {
    const textBits = doc.querySelectorAll('p, h1, h2, h3, li');
    const parentScores = new Map<Element, number>();
    for (const bit of Array.from(textBits)) {
      const el = bit as Element;
      const parent =
        (el.closest('article, main, section, div, td, li') as Element | null) ?? el;
      if (SKIP_TAGS.has(parent.tagName.toLowerCase())) continue;
      const len = collapseWs(parent.textContent ?? '').length;
      parentScores.set(parent, Math.max(parentScores.get(parent) ?? 0, len));
    }
    const ranked = [...parentScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    for (const [el] of ranked) pushEl(el);
  } catch {
    /* ignore */
  }

  collected.sort((a, b) => scoreNode(b) - scoreNode(a));
  const nodes = collected.slice(0, OUTLINE_MAX_NODES);

  return {
    url: meta.url,
    hostname: meta.hostname.toLowerCase(),
    title,
    nodes,
  };
}
