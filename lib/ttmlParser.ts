/**
 * TTML / IMSC1 subtitle parser.
 * Converts timed text markup into normalized cue objects.
 */

import type { SubtitleCue } from '@/types/subtitle';

const DEFAULT_TICK_RATE = 10_000_000;

/**
 * Parse a TTML / IMSC1 document into SubtitleCue[].
 * Handles clock times, tick times, and namespaced elements.
 */
export function parseTTML(ttml: string, tickRate = DEFAULT_TICK_RATE): SubtitleCue[] {
  if (!ttml) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(ttml, 'application/xml');
  if (doc.querySelector('parsererror')) return [];

  const root = doc.documentElement;
  const resolvedTickRate = resolveTickRate(root, tickRate);
  const cues: SubtitleCue[] = [];

  for (const element of collectTimedElements(root)) {
    const begin = element.getAttribute('begin');
    const end = element.getAttribute('end');
    if (!begin || !end) continue;

    const startTime = parseTtmlTime(begin, resolvedTickRate);
    const endTime = parseTtmlTime(end, resolvedTickRate);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;

    const text = extractElementText(element).trim();
    if (!text) continue;

    cues.push({ startTime, endTime, text });
  }

  return cues.sort((a, b) => a.startTime - b.startTime);
}

/** Parse a TTML timestamp (clock or tick format) into seconds. */
export function parseTtmlTime(value: string, tickRate = DEFAULT_TICK_RATE): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;

  if (trimmed.endsWith('t')) {
    const ticks = Number(trimmed.slice(0, -1));
    return Number.isFinite(ticks) ? ticks / tickRate : NaN;
  }

  // Fractional seconds (e.g. "12.34s")
  if (/^\d+(\.\d+)?s$/i.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Clock time: HH:MM:SS[.mmm|:frames]
  const clockMatch = trimmed.match(
    /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3})|:([\d.]+))?$/,
  );
  if (clockMatch) {
    const hours = clockMatch[1] ? parseInt(clockMatch[1], 10) : 0;
    const minutes = parseInt(clockMatch[2], 10);
    const seconds = parseInt(clockMatch[3], 10);
    const fraction = clockMatch[4]
      ? parseInt(clockMatch[4].padEnd(3, '0').slice(0, 3), 10) / 1000
      : clockMatch[5]
        ? parseFloat(clockMatch[5])
        : 0;
    return hours * 3600 + minutes * 60 + seconds + fraction;
  }

  return NaN;
}

function resolveTickRate(root: Element, fallback: number): number {
  const tickRateAttr =
    root.getAttributeNS('http://www.w3.org/ns/ttml#parameter', 'tickRate') ??
    root.getAttribute('ttp:tickRate') ??
    root.getAttribute('tickRate');
  if (!tickRateAttr) return fallback;
  const parsed = Number(tickRateAttr);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function collectTimedElements(root: Element): Element[] {
  const elements: Element[] = [];
  const walker = docCreateTreeWalker(root);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.hasAttribute('begin') && el.hasAttribute('end')) {
        elements.push(el);
      }
    }
    node = walker.nextNode();
  }
  return elements;
}

function docCreateTreeWalker(root: Element): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
}

function extractElementText(element: Element): string {
  const parts: string[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent ?? '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as Element;
      if (childEl.localName === 'br') {
        parts.push('\n');
      } else {
        parts.push(extractElementText(childEl));
      }
    }
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}